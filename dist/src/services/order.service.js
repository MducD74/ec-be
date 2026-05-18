import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { InteractionService } from "./interaction.service.js";
function createHttpError(message, statusCode) {
    return Object.assign(new Error(message), { statusCode });
}
export class OrderService {
    interactionService = new InteractionService();
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
                throw createHttpError("Cart is empty", 400);
            }
            const orderTotal = cart.items.reduce((sum, item) => sum.plus(item.product.price.mul(item.quantity)), new Prisma.Decimal(0));
            const order = await tx.order.create({
                data: {
                    userId: input.userId,
                    total: orderTotal,
                },
            });
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
                    throw createHttpError(`Not enough available serials for product ${cartItem.productId}`, 409);
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
                    throw createHttpError(`Unable to reserve exact serial quantity for product ${cartItem.productId}`, 409);
                }
                orderItems.push(orderItem);
                await this.interactionService.recordWithClient(tx, {
                    userId: input.userId,
                    productId: cartItem.productId,
                    type: "PURCHASE",
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
}
