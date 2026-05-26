import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { getJwtSecret } from "../middleware/auth.js";
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
export class InteractionService {
    getUserFromContext(context) {
        if (context.userId) {
            return { userId: context.userId };
        }
        return getUserFromAuthorization(context.authorization);
    }
    async record(input) {
        return this.recordWithClient(prisma, input);
    }
    async recordWithClient(client, input) {
        const user = this.getUserFromContext(input);
        await this.assertProductExists(client, input.productId);
        if (user?.userId) {
            await this.assertUserExists(client, user.userId);
        }
        return client.userInteraction.create({
            data: {
                userId: user?.userId,
                productId: input.productId,
                actionType: input.actionType,
            },
        });
    }
    async assertProductExists(client, productId) {
        const product = await client.product.findUnique({
            where: { id: productId },
            select: { id: true },
        });
        if (!product) {
            throw new Error("Product not found");
        }
    }
    async assertUserExists(client, userId) {
        const user = await client.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!user) {
            throw new Error("User not found");
        }
    }
}
