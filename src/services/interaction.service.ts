import jwt from "jsonwebtoken";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { JwtPayload, getJwtSecret } from "../middleware/auth.js";

export type InteractionType = "VIEW" | "CART" | "PURCHASE";

export interface InteractionContext {
  userId?: number;
  sessionId?: string;
  authorization?: string;
}

export interface RecordInteractionInput extends InteractionContext {
  productId: number;
  type: InteractionType;
}

const interactionScores: Record<InteractionType, number> = {
  VIEW: 1,
  CART: 3,
  PURCHASE: 5,
};

function getBearerToken(authorization?: string) {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
}

function getUserFromAuthorization(authorization?: string) {
  const token = getBearerToken(authorization);

  if (!token) {
    return undefined;
  }

  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return undefined;
  }
}

export class InteractionService {
  getUserFromContext(context: InteractionContext) {
    if (context.userId) {
      return { userId: context.userId };
    }

    return getUserFromAuthorization(context.authorization);
  }

  async record(input: RecordInteractionInput) {
    return this.recordWithClient(prisma, input);
  }

  async recordWithClient(
    client: Prisma.TransactionClient,
    input: RecordInteractionInput,
  ) {
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
