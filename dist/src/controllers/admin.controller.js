import { OrderStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { addManualTrainingJob } from "../queues/ai-training.queue.js";
const adminStatsStatuses = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.COMPLETED];
const allowedOrderStatuses = new Set(Object.values(OrderStatus));
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Request failed";
}
function toPositiveInteger(value, fallback) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue > 0) {
        return numberValue;
    }
    return fallback;
}
function parsePagination(query) {
    const page = toPositiveInteger(query.page, 1);
    const limit = toPositiveInteger(query.limit, 10);
    const skip = (page - 1) * limit;
    return {
        page,
        limit,
        skip,
        take: limit,
    };
}
function createPaginationMeta(totalItems, currentPage, limit) {
    return {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage,
        limit,
    };
}
function getPositiveInteger(value) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue > 0) {
        return numberValue;
    }
    return undefined;
}
function getFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
}
async function getOrCreateSystemConfig() {
    const existingConfig = await prisma.systemConfig.findFirst({
        orderBy: {
            id: "asc",
        },
    });
    if (existingConfig) {
        return existingConfig;
    }
    return prisma.systemConfig.create({
        data: {
            collaborativeWeight: 0.4,
            contentWeight: 0.3,
            brandWeight: 0.3,
        },
    });
}
function normalizeOrderStatus(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const status = value.trim().toUpperCase();
    if (status === "DELIVERED") {
        return OrderStatus.COMPLETED;
    }
    return allowedOrderStatuses.has(status) ? status : undefined;
}
function toAdminVoucherResponse(voucher) {
    return {
        id: voucher.id,
        code: voucher.code,
        discountAmount: voucher.discountValue,
        minOrderValue: voucher.minOrderValue,
        isActive: voucher.isActive,
        maxUses: voucher.usageLimit,
        usedCount: voucher.usedCount,
        expiredAt: voucher.endDate,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        usageLimit: voucher.usageLimit,
        endDate: voucher.endDate,
    };
}
function toAdminInventoryResponse(variant) {
    return {
        id: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        product: variant.product,
        attributeName: variant.attributeName,
        attributeValue: variant.attributeValue,
        attributes: {
            [variant.attributeName]: variant.attributeValue,
        },
        color: variant.attributeName.toLowerCase() === "color" ? variant.attributeValue : null,
        size: variant.attributeName.toLowerCase() === "size" ? variant.attributeValue : null,
        ram: variant.attributeName.toLowerCase() === "ram" ? variant.attributeValue : null,
        storage: variant.attributeName.toLowerCase() === "storage" ? variant.attributeValue : null,
        sku: variant.sku,
        stock: variant.stock,
        price: variant.price,
    };
}
function toAdminUserResponse(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        status: user.isActive ? "ACTIVE" : "LOCKED",
        createdAt: user.createdAt,
    };
}
export class AdminController {
    async getStats(_req, res, _next) {
        try {
            const [revenueAggregate, totalOrders, totalUsers, ordersByStatus] = await Promise.all([
                prisma.order.aggregate({
                    where: {
                        status: {
                            not: OrderStatus.CANCELLED,
                        },
                    },
                    _sum: {
                        total: true,
                    },
                }),
                prisma.order.count(),
                prisma.user.count(),
                prisma.order.groupBy({
                    by: ["status"],
                    where: {
                        status: {
                            in: adminStatsStatuses,
                        },
                    },
                    _count: {
                        _all: true,
                    },
                }),
            ]);
            const orderStatusCounts = {
                PENDING: 0,
                PROCESSING: 0,
                DELIVERED: 0,
            };
            for (const statusGroup of ordersByStatus) {
                if (statusGroup.status === OrderStatus.PENDING) {
                    orderStatusCounts.PENDING = statusGroup._count._all;
                }
                if (statusGroup.status === OrderStatus.PROCESSING) {
                    orderStatusCounts.PROCESSING = statusGroup._count._all;
                }
                if (statusGroup.status === OrderStatus.COMPLETED) {
                    orderStatusCounts.DELIVERED = statusGroup._count._all;
                }
            }
            return res.json({
                success: true,
                data: {
                    totalRevenue: revenueAggregate._sum.total ?? 0,
                    totalOrders,
                    totalUsers,
                    orderStatusCounts,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    }
    async getOrders(req, res, _next) {
        try {
            const { page, limit, skip, take } = parsePagination(req.query);
            const [orders, totalItems] = await Promise.all([
                prisma.order.findMany({
                    skip,
                    take,
                    orderBy: {
                        createdAt: "desc",
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                            },
                        },
                        items: {
                            include: {
                                product: {
                                    select: {
                                        id: true,
                                        name: true,
                                        sku: true,
                                        price: true,
                                        imageUrl: true,
                                    },
                                },
                                inventory: true,
                            },
                        },
                    },
                }),
                prisma.order.count(),
            ]);
            return res.json({
                success: true,
                data: orders,
                meta: createPaginationMeta(totalItems, page, limit),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    }
    async updateOrderStatus(req, res, _next) {
        try {
            const orderId = getPositiveInteger(req.params.id);
            const status = normalizeOrderStatus(req.body?.status);
            if (!orderId) {
                return res.status(400).json({ success: false, message: "Mã đơn hàng phải là số nguyên dương." });
            }
            if (!status) {
                return res.status(400).json({ success: false, message: "Trạng thái đơn hàng không hợp lệ." });
            }
            const order = await prisma.order.update({
                where: {
                    id: orderId,
                },
                data: {
                    status,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                    items: {
                        include: {
                            product: true,
                            inventory: true,
                        },
                    },
                },
            });
            return res.json({
                success: true,
                data: order,
                order,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    }
    async getUsers(_req, res, _next) {
        try {
            const users = await prisma.user.findMany({
                orderBy: {
                    createdAt: "desc",
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                },
            });
            const data = users.map(toAdminUserResponse);
            return res.json({
                success: true,
                data,
                users: data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể tải danh sách người dùng: ${getErrorMessage(error)}`,
            });
        }
    }
    async toggleUserStatus(req, res, _next) {
        try {
            const userId = getPositiveInteger(req.params.userId);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: "Mã người dùng phải là số nguyên dương.",
                });
            }
            const user = await prisma.user.findUnique({
                where: {
                    id: userId,
                },
                select: {
                    id: true,
                    isActive: true,
                },
            });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy người dùng.",
                });
            }
            const updatedUser = await prisma.user.update({
                where: {
                    id: userId,
                },
                data: {
                    isActive: !user.isActive,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                },
            });
            const data = toAdminUserResponse(updatedUser);
            return res.json({
                success: true,
                message: data.isActive
                    ? `Đã mở khóa tài khoản ${data.email} thành công.`
                    : `Đã khóa tài khoản ${data.email} thành công.`,
                data,
                user: data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể cập nhật trạng thái người dùng: ${getErrorMessage(error)}`,
            });
        }
    }
    async getVouchers(req, res, _next) {
        try {
            const { page, limit, skip, take } = parsePagination(req.query);
            const [vouchers, totalItems] = await Promise.all([
                prisma.voucher.findMany({
                    skip,
                    take,
                    orderBy: {
                        id: "desc",
                    },
                    select: {
                        id: true,
                        code: true,
                        discountType: true,
                        discountValue: true,
                        minOrderValue: true,
                        usageLimit: true,
                        usedCount: true,
                        isActive: true,
                        endDate: true,
                    },
                }),
                prisma.voucher.count(),
            ]);
            const data = vouchers.map(toAdminVoucherResponse);
            return res.json({
                success: true,
                data,
                meta: createPaginationMeta(totalItems, page, limit),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể tải danh sách voucher: ${getErrorMessage(error)}`,
            });
        }
    }
    async getInventory(req, res, _next) {
        try {
            const { page, limit, skip, take } = parsePagination(req.query);
            const [variants, totalItems] = await Promise.all([
                prisma.productVariant.findMany({
                    skip,
                    take,
                    orderBy: {
                        id: "desc",
                    },
                    select: {
                        id: true,
                        productId: true,
                        sku: true,
                        attributeName: true,
                        attributeValue: true,
                        price: true,
                        stock: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                }),
                prisma.productVariant.count(),
            ]);
            const data = variants.map(toAdminInventoryResponse);
            return res.json({
                success: true,
                data,
                meta: createPaginationMeta(totalItems, page, limit),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể tải danh sách tồn kho biến thể: ${getErrorMessage(error)}`,
            });
        }
    }
    async createProduct(req, res, _next) {
        try {
            const { name, description, brandId, categoryId, sku, price, quantity, } = req.body;
            if (!name?.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Product name is required.",
                });
            }
            if (!sku?.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "SKU is required.",
                });
            }
            if (price == null || price < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid price.",
                });
            }
            if (!Number.isInteger(quantity) || quantity < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid quantity.",
                });
            }
            const [brand, category, existingProduct] = await Promise.all([
                prisma.brand.findUnique({
                    where: { id: brandId },
                    select: { id: true },
                }),
                prisma.category.findUnique({
                    where: { id: categoryId },
                    select: { id: true },
                }),
                prisma.product.findUnique({
                    where: { sku },
                    select: { id: true },
                }),
            ]);
            if (!brand) {
                return res.status(404).json({
                    success: false,
                    message: "Brand not found.",
                });
            }
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found.",
                });
            }
            if (existingProduct) {
                return res.status(409).json({
                    success: false,
                    message: "SKU already exists.",
                });
            }
            const product = await prisma.$transaction(async (tx) => {
                const createdProduct = await tx.product.create({
                    data: {
                        name: name.trim(),
                        description,
                        sku: sku.trim(),
                        price,
                        brandId,
                        categoryId,
                    },
                });
                if (quantity > 0) {
                    await tx.inventory.createMany({
                        data: Array.from({ length: quantity }, (_, index) => ({
                            productId: createdProduct.id,
                            serialNumber: `${createdProduct.sku}-${Date.now()}-${index + 1}`,
                        })),
                    });
                }
                return tx.product.findUnique({
                    where: {
                        id: createdProduct.id,
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        sku: true,
                        price: true,
                        brand: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        category: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        _count: {
                            select: {
                                inventory: true,
                            },
                        },
                    },
                });
            });
            return res.status(201).json({
                success: true,
                data: product,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Unable to create product: ${getErrorMessage(error)}`,
            });
        }
    }
    async updateInventoryStock(req, res, _next) {
        try {
            const variantId = getPositiveInteger(req.params.variantId);
            const stock = Number(req.body?.stock);
            if (!variantId) {
                return res.status(400).json({
                    success: false,
                    message: "Mã biến thể sản phẩm phải là số nguyên dương.",
                });
            }
            if (!Number.isInteger(stock) || stock < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Số lượng tồn kho phải là số nguyên không âm.",
                });
            }
            const existingVariant = await prisma.productVariant.findUnique({
                where: {
                    id: variantId,
                },
                select: {
                    id: true,
                },
            });
            if (!existingVariant) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy biến thể sản phẩm.",
                });
            }
            const updatedVariant = await prisma.productVariant.update({
                where: {
                    id: variantId,
                },
                data: {
                    stock,
                },
                select: {
                    id: true,
                    productId: true,
                    sku: true,
                    attributeName: true,
                    attributeValue: true,
                    price: true,
                    stock: true,
                    product: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
            const data = toAdminInventoryResponse(updatedVariant);
            return res.json({
                success: true,
                message: "Cập nhật tồn kho biến thể thành công.",
                data,
                inventory: data,
                variant: data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể cập nhật tồn kho biến thể: ${getErrorMessage(error)}`,
            });
        }
    }
    async getBrands(req, res, _next) {
        try {
            const { page, limit, skip, take } = parsePagination(req.query);
            const [brands, totalItems] = await Promise.all([
                prisma.brand.findMany({
                    // skip,
                    // take,
                    orderBy: {
                        name: "asc",
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        logoUrl: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                }),
                prisma.brand.count(),
            ]);
            return res.json({
                success: true,
                data: brands,
                meta: createPaginationMeta(totalItems, page, limit),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Unable to load brand list: ${getErrorMessage(error)}`,
            });
        }
    }
    async createBrand(req, res, _next) {
        try {
            const { name, description, logoUrl } = req.body;
            const existingBrand = await prisma.brand.findUnique({
                where: {
                    name,
                },
                select: {
                    id: true,
                },
            });
            if (existingBrand) {
                return res.status(409).json({
                    success: false,
                    message: "Brand already exists.",
                });
            }
            const brand = await prisma.brand.create({
                data: {
                    name,
                    description,
                    logoUrl,
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    logoUrl: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return res.status(201).json({
                success: true,
                data: brand,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Unable to create brand: ${getErrorMessage(error)}`,
            });
        }
    }
    async getCategories(req, res, _next) {
        try {
            const { page, limit, skip, take } = parsePagination(req.query);
            const [categories, totalItems] = await Promise.all([
                prisma.category.findMany({
                    // skip,
                    // take,
                    orderBy: [{ parentId: "asc" }, { name: "asc" }],
                    select: {
                        id: true,
                        name: true,
                        parentId: true,
                    },
                }),
                prisma.category.count(),
            ]);
            return res.json({
                success: true,
                data: categories,
                meta: createPaginationMeta(totalItems, page, limit),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Unable to load category list: ${getErrorMessage(error)}`,
            });
        }
    }
    async createCategory(req, res, _next) {
        try {
            const { name, parentId } = req.body;
            const normalizedName = name?.trim();
            if (!normalizedName) {
                return res.status(400).json({
                    success: false,
                    message: "Category name is required.",
                });
            }
            if (parentId) {
                const parentCategory = await prisma.category.findUnique({
                    where: {
                        id: parentId,
                    },
                    select: {
                        id: true,
                    },
                });
                if (!parentCategory) {
                    return res.status(404).json({
                        success: false,
                        message: "Parent category not found.",
                    });
                }
            }
            const existingCategory = await prisma.category.findFirst({
                where: {
                    name: {
                        equals: normalizedName,
                        mode: "insensitive",
                    },
                    parentId: parentId ?? null,
                },
                select: {
                    id: true,
                },
            });
            if (existingCategory) {
                return res.status(409).json({
                    success: false,
                    message: "Category already exists.",
                });
            }
            const category = await prisma.category.create({
                data: {
                    name: normalizedName,
                    parentId: parentId ?? null,
                },
                select: {
                    id: true,
                    name: true,
                    parentId: true,
                },
            });
            return res.status(201).json({
                success: true,
                data: category,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Unable to create category: ${getErrorMessage(error)}`,
            });
        }
    }
    async getAiInteractions(req, res, _next) {
        try {
            const { page, limit, skip, take } = parsePagination(req.query);
            const [interactions, totalItems] = await Promise.all([
                prisma.userInteraction.findMany({
                    skip,
                    take,
                    orderBy: {
                        createdAt: "desc",
                    },
                    select: {
                        id: true,
                        userId: true,
                        productId: true,
                        actionType: true,
                        createdAt: true,
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                            },
                        },
                        product: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                }),
                prisma.userInteraction.count(),
            ]);
            return res.json({
                success: true,
                data: interactions,
                meta: createPaginationMeta(totalItems, page, limit),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể tải dữ liệu tương tác AI: ${getErrorMessage(error)}`,
            });
        }
    }
    async toggleVoucher(req, res, _next) {
        try {
            const voucherId = getPositiveInteger(req.params.id);
            if (!voucherId) {
                return res.status(400).json({
                    success: false,
                    message: "Mã định danh voucher phải là số nguyên dương.",
                });
            }
            if (req.method === "PATCH" &&
                typeof req.body.isActive !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng gửi trạng thái kích hoạt isActive với giá trị true hoặc false.",
                });
            }
            const voucher = await prisma.voucher.findUnique({
                where: {
                    id: voucherId,
                },
                select: {
                    id: true,
                    code: true,
                    isActive: true,
                },
            });
            if (!voucher) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy voucher.",
                });
            }
            const nextIsActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : !voucher.isActive;
            const updatedVoucher = await prisma.voucher.update({
                where: {
                    id: voucherId,
                },
                data: {
                    isActive: nextIsActive,
                },
                select: {
                    id: true,
                    code: true,
                    discountType: true,
                    discountValue: true,
                    minOrderValue: true,
                    usageLimit: true,
                    usedCount: true,
                    isActive: true,
                    endDate: true,
                },
            });
            const data = toAdminVoucherResponse(updatedVoucher);
            return res.json({
                success: true,
                message: data.isActive
                    ? `Đã bật voucher ${data.code} thành công.`
                    : `Đã tắt voucher ${data.code} thành công.`,
                data,
                voucher: data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể cập nhật trạng thái voucher: ${getErrorMessage(error)}`,
            });
        }
    }
    async getAiConfig(_req, res, _next) {
        try {
            const data = await getOrCreateSystemConfig();
            return res.json({
                success: true,
                message: "Đã tải cấu hình trọng số AI thành công.",
                data,
                config: data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể tải cấu hình trọng số AI: ${getErrorMessage(error)}`,
            });
        }
    }
    async updateAiConfig(req, res, _next) {
        try {
            const collaborativeWeight = getFiniteNumber(req.body?.collaborativeWeight);
            const contentWeight = getFiniteNumber(req.body?.contentWeight);
            const brandWeight = getFiniteNumber(req.body?.brandWeight);
            if (collaborativeWeight === undefined ||
                contentWeight === undefined ||
                brandWeight === undefined) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng gửi đủ ba trọng số AI hợp lệ: collaborativeWeight, contentWeight và brandWeight.",
                });
            }
            const currentConfig = await getOrCreateSystemConfig();
            const data = await prisma.systemConfig.update({
                where: {
                    id: currentConfig.id,
                },
                data: {
                    collaborativeWeight,
                    contentWeight,
                    brandWeight,
                },
            });
            return res.json({
                success: true,
                message: "Đã cập nhật cấu hình trọng số AI thành công.",
                data,
                config: data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể cập nhật cấu hình trọng số AI: ${getErrorMessage(error)}`,
            });
        }
    }
    async trainAiModel(_req, res, _next) {
        try {
            const job = await addManualTrainingJob();
            return res.status(202).json({
                success: true,
                message: "Đã đưa yêu cầu huấn luyện AI vào hàng đợi.",
                data: {
                    jobId: job.id,
                    jobName: job.name,
                    queueName: job.queueName,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: `Không thể đưa yêu cầu huấn luyện AI vào hàng đợi: ${getErrorMessage(error)}`,
            });
        }
    }
}
