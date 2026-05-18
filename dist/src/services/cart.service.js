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
        throw Object.assign(new Error(`${fieldName} must be a positive integer`), {
            statusCode: 400,
        });
    }
}
export class CartService {
    interactionService = new InteractionService();
    async getCart(context) {
        const cart = await this.resolveCart(context);
        return this.findCartById(cart.id);
    }
    async addItem(context, input) {
        assertPositiveInteger(input.productId, "productId");
        assertPositiveInteger(input.quantity, "quantity");
        const cart = await this.resolveCart(context);
        await this.assertProductExists(input.productId);
        await prisma.cartItem.upsert({
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
        await this.interactionService.record({
            authorization: context.authorization,
            sessionId: context.sessionId,
            productId: input.productId,
            type: "CART",
        });
        return this.findCartById(cart.id);
    }
    async updateItem(context, input) {
        assertPositiveInteger(input.productId, "productId");
        assertPositiveInteger(input.quantity, "quantity");
        const cart = await this.resolveCart(context);
        await this.assertProductExists(input.productId);
        await prisma.cartItem.upsert({
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
        return this.findCartById(cart.id);
    }
    async removeItem(context, productId) {
        assertPositiveInteger(productId, "productId");
        const cart = await this.resolveCart(context);
        await prisma.cartItem.deleteMany({
            where: {
                cartId: cart.id,
                productId,
            },
        });
        return this.findCartById(cart.id);
    }
    async resolveCart(context) {
        const user = getUserFromAuthorization(context.authorization);
        if (user) {
            const userCart = await this.getOrCreateUserCart(user.userId);
            if (context.sessionId) {
                await this.mergeGuestCartIntoUserCart(context.sessionId, userCart.id);
            }
            return userCart;
        }
        if (!context.sessionId) {
            throw Object.assign(new Error("x-session-id header or JWT token is required"), { statusCode: 400 });
        }
        return prisma.cart.upsert({
            where: { sessionId: context.sessionId },
            create: { sessionId: context.sessionId },
            update: {},
        });
    }
    getOrCreateUserCart(userId) {
        return prisma.cart.upsert({
            where: { userId },
            create: { userId },
            update: {},
        });
    }
    async mergeGuestCartIntoUserCart(sessionId, userCartId) {
        const guestCart = await prisma.cart.findUnique({
            where: { sessionId },
            include: { items: true },
        });
        if (!guestCart || guestCart.id === userCartId) {
            return;
        }
        await prisma.$transaction(async (tx) => {
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
        });
    }
    async assertProductExists(productId) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: { id: true },
        });
        if (!product) {
            throw Object.assign(new Error("Product not found"), { statusCode: 404 });
        }
    }
    findCartById(cartId) {
        return prisma.cart.findUniqueOrThrow({
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
    }
}
