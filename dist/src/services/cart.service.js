import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { getJwtSecret } from "../middleware/auth.js";
import { InteractionService } from "./interaction.service.js";
function getBearerToken(authorization) {
    return authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;
}
function getUserFromAuthorization(authorization) {
    const token = getBearerToken(authorization);
    if (!token) {
        return undefined;
    }
    try {
        return jwt.verify(token, getJwtSecret());
    }
    catch {
        return undefined;
    }
}
function assertPositiveInteger(value, fieldName) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
}
export class CartService {
    interactionService = new InteractionService();
    async getCart(context) {
        return prisma.$transaction(async (tx) => {
            const cart = await this.resolveCart(tx, context);
            return this.findCartById(tx, cart.id);
        });
    }
    async addItem(context, input) {
        return prisma.$transaction(async (tx) => {
            assertPositiveInteger(input.productId, "productId");
            assertPositiveInteger(input.quantity, "quantity");
            await this.assertProductExists(tx, input.productId);
            const cart = await this.resolveCart(tx, context);
            await tx.cartItem.upsert({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId: input.productId,
                    },
                },
                create: {
                    cartId: cart.id,
                    productId: input.productId,
                    quantity: input.quantity,
                },
                update: {
                    quantity: {
                        increment: input.quantity,
                    },
                },
            });
            await this.interactionService.recordWithClient(tx, {
                authorization: context.authorization,
                sessionId: context.sessionId,
                productId: input.productId,
                type: "CART",
            });
            return this.findCartById(tx, cart.id);
        });
    }
    async updateItem(context, input) {
        return prisma.$transaction(async (tx) => {
            assertPositiveInteger(input.productId, "productId");
            assertPositiveInteger(input.quantity, "quantity");
            const cart = await this.resolveCart(tx, context);
            await this.assertProductExists(tx, input.productId);
            await tx.cartItem.upsert({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId: input.productId,
                    },
                },
                create: {
                    cartId: cart.id,
                    productId: input.productId,
                    quantity: input.quantity,
                },
                update: {
                    quantity: input.quantity,
                },
            });
            return this.findCartById(tx, cart.id);
        });
    }
    async removeItem(context, productId) {
        return prisma.$transaction(async (tx) => {
            assertPositiveInteger(productId, "productId");
            const cart = await this.resolveCart(tx, context);
            await tx.cartItem.deleteMany({
                where: {
                    cartId: cart.id,
                    productId,
                },
            });
            return this.findCartById(tx, cart.id);
        });
    }
    async resolveCart(tx, context) {
        const user = getUserFromAuthorization(context.authorization);
        if (user) {
            await this.assertUserExists(tx, user.userId);
            const userCart = await this.getOrCreateUserCart(tx, user.userId);
            if (context.sessionId) {
                await this.mergeGuestCartIntoUserCart(tx, context.sessionId, userCart.id);
            }
            return userCart;
        }
        if (!context.sessionId) {
            throw new Error("x-session-id header or JWT token is required");
        }
        return tx.cart.upsert({
            where: { sessionId: context.sessionId },
            create: {
                sessionId: context.sessionId,
                userId: null,
            },
            update: {},
        });
    }
    async getOrCreateUserCart(tx, userId) {
        return tx.cart.upsert({
            where: { userId },
            create: {
                userId,
                sessionId: null,
            },
            update: {},
        });
    }
    async mergeGuestCartIntoUserCart(tx, sessionId, userCartId) {
        const guestCart = await tx.cart.findUnique({
            where: { sessionId },
            include: { items: true },
        });
        if (!guestCart || guestCart.id === userCartId) {
            return;
        }
        for (const item of guestCart.items) {
            await tx.cartItem.upsert({
                where: {
                    cartId_productId: {
                        cartId: userCartId,
                        productId: item.productId,
                    },
                },
                create: {
                    cartId: userCartId,
                    productId: item.productId,
                    quantity: item.quantity,
                },
                update: {
                    quantity: {
                        increment: item.quantity,
                    },
                },
            });
        }
        await tx.cart.delete({
            where: { id: guestCart.id },
        });
    }
    async assertProductExists(tx, productId) {
        const product = await tx.product.findUnique({
            where: { id: productId },
            select: { id: true },
        });
        if (!product) {
            throw new Error("Product not found");
        }
    }
    async assertUserExists(tx, userId) {
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!user) {
            throw new Error("User not found");
        }
    }
    async findCartById(tx, cartId) {
        const cart = await tx.cart.findUnique({
            where: { id: cartId },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });
        if (!cart) {
            throw new Error("Cart not found");
        }
        return cart;
    }
}
