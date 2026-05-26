import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { InteractionService } from "./interaction.service.js";
import { validateVoucher } from "./voucher.service.js";
export class OrderService {
    interactionService = new InteractionService();
    getInitialOrderStatus(paymentMethod) {
        if (paymentMethod === "COD") {
            return "PROCESSING";
        }
        return "PENDING";
    }
    async checkout(input) {
        return prisma.$transaction(async (tx) => {
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
            const voucherResult = input.voucherCode !== undefined
                ? await validateVoucher(input.voucherCode, orderTotal, tx)
                : null;
            const discountAmount = voucherResult?.discountAmount ?? 0;
            const finalTotal = orderTotal.minus(new Prisma.Decimal(discountAmount));
            const order = await tx.order.create({
                data: {
                    userId: input.userId,
                    voucherId: voucherResult?.voucherId,
                    total: finalTotal,
                    discountAmount,
                    status: this.getInitialOrderStatus(input.paymentMethod),
                    paymentMethod: input.paymentMethod,
                    paymentStatus: "PENDING",
                },
            });
            if (voucherResult) {
                const updateVoucherResult = await tx.voucher.updateMany({
                    where: {
                        id: voucherResult.voucherId,
                        usedCount: {
                            lt: voucherResult.usageLimit,
                        },
                    },
                    data: {
                        usedCount: {
                            increment: 1,
                        },
                    },
                });
                if (updateVoucherResult.count !== 1) {
                    throw new Error("Mã voucher đã hết lượt sử dụng");
                }
            }
            const orderItems = [];
            for (const cartItem of cart.items) {
                const availableInventory = await tx.inventory.findMany({
                    where: {
                        productId: cartItem.productId,
                        status: "AVAILABLE",
                    },
                    orderBy: {
                        id: "asc",
                    },
                    take: cartItem.quantity,
                });
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
                const inventoryIds = availableInventory.map((inventoryItem) => inventoryItem.id);
                const updateResult = await tx.inventory.updateMany({
                    where: {
                        id: {
                            in: inventoryIds,
                        },
                        status: "AVAILABLE",
                    },
                    data: {
                        status: "SOLD",
                        orderItemId: orderItem.id,
                    },
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
            await tx.cartItem.deleteMany({
                where: {
                    cartId: cart.id,
                },
            });
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
                },
            });
        });
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
    async completeOrder(input) {
        const order = await prisma.order.findUnique({
            where: { id: input.orderId },
            select: {
                id: true,
                userId: true,
            },
        });
        if (!order || order.userId !== input.userId) {
            const error = new Error("Forbidden");
            error.statusCode = 403;
            throw error;
        }
        return prisma.order.update({
            where: { id: input.orderId },
            data: {
                status: "COMPLETED",
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
