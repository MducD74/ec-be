import { Prisma } from "../../generated/prisma/client.js";
import { appLog } from "../config/winston.js";
import { prisma } from "../lib/prisma.js";
import { InteractionService } from "./interaction.service.js";
import { paymentTransactionService } from "./payment-transaction.service.js";
import { vnPayService } from "./vnpay.service.js";
async function validateVoucher(orderTotal, tx, lockedVoucher) {
    if (!lockedVoucher) {
        throw new Error("Mã voucher không hợp lệ");
    }
    const voucher = await tx.voucher.findUniqueOrThrow({
        where: { id: lockedVoucher.id },
    });
    const now = new Date();
    if (!voucher.isActive) {
        throw new Error("Mã voucher hiện không khả dụng");
    }
    if (voucher.startDate && voucher.startDate > now) {
        throw new Error("Mã voucher chưa đến thời gian áp dụng");
    }
    if (voucher.endDate && voucher.endDate < now) {
        throw new Error("Mã voucher đã hết hạn");
    }
    if (lockedVoucher.usedCount >= lockedVoucher.usageLimit) {
        throw new Error("Mã voucher đã hết lượt sử dụng");
    }
    if (voucher.minOrderValue && orderTotal.lessThan(voucher.minOrderValue)) {
        throw new Error(`Đơn hàng tối thiểu ${voucher.minOrderValue.toString()}đ để áp dụng mã này`);
    }
    const orderTotalValue = orderTotal.toNumber();
    if (orderTotalValue < voucher.minOrderValue) {
        throw new Error("Đơn hàng chưa đạt giá trị tối thiểu để dùng voucher");
    }
    const rawDiscount = voucher.discountType === "PERCENTAGE"
        ? (orderTotalValue * voucher.discountValue) / 100
        : voucher.discountValue;
    const cappedDiscount = voucher.discountType === "PERCENTAGE" && voucher.maxDiscountValue !== null
        ? Math.min(rawDiscount, voucher.maxDiscountValue)
        : rawDiscount;
    const discountAmount = Math.min(Math.max(cappedDiscount, 0), orderTotalValue);
    return {
        voucherId: voucher.id,
        discountAmount,
        usageLimit: lockedVoucher.usageLimit,
    };
}
export class OrderService {
    interactionService = new InteractionService();
    getInitialOrderStatus(paymentMethod) {
        if (paymentMethod === "COD") {
            return "PROCESSING";
        }
        return "PENDING";
    }
    buildTransactionRef(orderId) {
        // VNPay TxnRef tối đa 100 ký tự, chỉ alphanumeric
        // Dùng orderId (UUID) bỏ dấu gạch ngang
        return `${orderId.toString().replace(/-/g, "")}_${Date.now().toString()}`;
    }
    getPaymentExpiredAt() {
        const expiredAt = new Date();
        expiredAt.setMinutes(expiredAt.getMinutes() + 15);
        return expiredAt;
    }
    async checkout(input) {
        // Với VNPAY, ipAddr là bắt buộc
        if (input.paymentMethod === "VNPAY" && !input.ipAddr) {
            throw new Error("IP address is required for VNPay payment");
        }
        const order = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`; // lock userId để serialize các transaction checkout của cùng 1 user
            const cart = await tx.cart.findUnique({
                where: { userId: input.userId },
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            });
            if (!cart || cart.items.length === 0) {
                throw new Error("Cart is empty");
            }
            const orderTotal = cart.items.reduce((sum, item) => sum.plus(item.product.price.mul(item.quantity)), new Prisma.Decimal(0));
            // ── Lock voucher record TRƯỚC khi validate, không chỉ ở bước update ──
            let lockedVoucher = null;
            if (input.voucherCode !== undefined) {
                const rows = await tx.$queryRaw `
          SELECT id, "usageLimit", "usedCount"
          FROM "Voucher"
          WHERE code = ${input.voucherCode}
          FOR UPDATE
        `;
                lockedVoucher = rows[0] ?? null;
            }
            const voucherResult = input.voucherCode !== undefined
                ? await validateVoucher(orderTotal, tx, lockedVoucher)
                : null;
            const discountAmount = voucherResult?.discountAmount ?? 0;
            const finalTotal = orderTotal.minus(new Prisma.Decimal(discountAmount));
            const order = await tx.order.create({
                data: {
                    userId: input.userId,
                    voucherId: voucherResult?.voucherId,
                    total: finalTotal,
                    discountAmount,
                    status: "PROCESSING",
                    paymentMethod: input.paymentMethod,
                    paymentStatus: "PENDING",
                },
            });
            if (voucherResult) {
                const updateVoucherResult = await tx.voucher.updateMany({
                    where: {
                        id: voucherResult.voucherId,
                        usedCount: { lt: voucherResult.usageLimit },
                    },
                    data: { usedCount: { increment: 1 } },
                });
                if (updateVoucherResult.count !== 1) {
                    throw new Error("Mã voucher đã hết lượt sử dụng");
                }
            }
            const orderItems = [];
            for (const cartItem of cart.items) {
                // ── Lock đúng N dòng inventory AVAILABLE cho sản phẩm này ──
                const availableInventory = await tx.$queryRaw `
          SELECT id
          FROM "Inventory"
          WHERE "productId" = ${cartItem.productId}
            AND status = 'AVAILABLE'
          ORDER BY id ASC
          LIMIT ${cartItem.quantity}
          FOR UPDATE
        `;
                if (availableInventory.length !== cartItem.quantity) {
                    throw new Error(`Not enough available serials for product ${cartItem.productId}`);
                }
                const orderItemTotal = cartItem.product.price.mul(cartItem.quantity);
                const orderItem = await tx.orderItem.create({
                    data: {
                        orderId: order.id,
                        productId: cartItem.productId,
                        quantity: cartItem.quantity,
                        unitPrice: cartItem.product.price,
                        total: orderItemTotal,
                    },
                });
                const inventoryIds = availableInventory.map((i) => i.id);
                const updateResult = await tx.inventory.updateMany({
                    where: { id: { in: inventoryIds }, status: "AVAILABLE" },
                    data: { status: "SOLD", orderItemId: orderItem.id },
                });
                if (updateResult.count !== cartItem.quantity) {
                    throw new Error(`Unable to reserve exact serial quantity for product ${cartItem.productId}`);
                }
                orderItems.push(orderItem);
                await this.interactionService.recordWithClient(tx, {
                    userId: input.userId,
                    productId: cartItem.productId,
                    actionType: "PURCHASE",
                });
            }
            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            // ── VNPay: tạo PaymentTransaction và sinh URL ─────────────────────────
            if (input.paymentMethod === "VNPAY") {
                const transactionRef = this.buildTransactionRef(order.id);
                const amountVnd = finalTotal.toNumber();
                const expiredAt = this.getPaymentExpiredAt();
                const paymentUrl = vnPayService.createPaymentUrl({
                    orderId: transactionRef,
                    amount: amountVnd,
                    orderInfo: `Thanh toan don hang ${order.id}`,
                    ipAddr: input.ipAddr,
                });
                await paymentTransactionService.createTransaction(tx, {
                    orderId: order.id,
                    transactionRef,
                    amount: finalTotal,
                    paymentUrl,
                    expiredAt,
                });
                appLog.info("[Order] VNPay payment transaction created", {
                    orderId: order.id,
                    transactionRef,
                });
            }
            return tx.order.findUniqueOrThrow({
                where: { id: order.id },
                include: {
                    voucher: true,
                    items: {
                        include: {
                            product: true,
                            inventory: true,
                        },
                    },
                    paymentTransactions: input.paymentMethod === "VNPAY",
                },
            });
        });
        if (input.paymentMethod === "VNPAY") {
            const latestTx = await prisma.paymentTransaction.findFirst({
                where: { orderId: order.id },
                orderBy: { createdAt: "desc" },
            });
            return {
                order,
                paymentUrl: latestTx?.paymentUrl ?? undefined,
            };
        }
        return { order };
    }
    async getHistory(input) {
        const skip = (input.page - 1) * input.limit;
        const where = {
            userId: input.userId,
        };
        const [total, orders] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.findMany({
                where,
                skip,
                take: input.limit,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    items: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    price: true,
                                    imageUrl: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        return {
            data: orders,
            pagination: {
                total,
                page: input.page,
                totalPages: Math.ceil(total / input.limit),
            },
        };
    }
    async getOrderByTransactionRef(input) {
        const transaction = await prisma.paymentTransaction.findFirst({
            where: {
                transactionRef: input.transactionRef,
            },
            orderBy: {
                createdAt: "desc",
            },
            include: {
                order: {
                    include: {
                        voucher: true,
                        items: {
                            include: {
                                product: true,
                                inventory: true,
                            },
                        },
                    },
                },
            },
        });
        if (!transaction) {
            const error = new Error("Payment transaction not found");
            error.statusCode = 404;
            throw error;
        }
        if (transaction.order.userId !== input.userId) {
            const error = new Error("Order not found");
            error.statusCode = 404;
            throw error;
        }
        return transaction.order;
    }
    async completeOrder(input) {
        const order = await prisma.order.findUnique({
            where: { id: input.orderId },
            select: {
                id: true,
                userId: true,
                paymentMethod: true,
            },
        });
        if (!order || order.userId !== input.userId) {
            const error = new Error("Forbidden");
            error.statusCode = 403;
            throw error;
        }
        let status = "PAID";
        if (order.paymentMethod === "COD") {
            status = "SHIPPED";
        }
        else {
            status = "COMPLETED";
        }
        return prisma.order.update({
            where: { id: input.orderId },
            data: {
                status: status,
                paymentStatus: "PAID",
            },
            include: {
                items: {
                    include: {
                        product: true,
                        inventory: true,
                    },
                },
            },
        });
    }
}
