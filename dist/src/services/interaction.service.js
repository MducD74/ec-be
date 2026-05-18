import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { getJwtSecret } from "../middleware/auth.js";
const interactionScores = {
    VIEW: 1,
    CART: 3,
    PURCHASE: 5,
};
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
        return client.userInteraction.create({
            data: {
                userId: user?.userId,
                sessionId: input.sessionId,
                productId: input.productId,
                type: input.type,
                score: interactionScores[input.type],
            },
        });
    }
}
