import jwt from "jsonwebtoken";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { JwtPayload, getJwtSecret } from "../middleware/auth.js";

export type ActionType = "VIEW" | "ADD_TO_CART" | "PURCHASE";

export interface InteractionContext {
  userId?: number;
  sessionId?: string;
  authorization?: string;
}

export interface RecordInteractionInput extends InteractionContext {
  productId: number;
  actionType: ActionType;
}

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
  private async sendTelegramNotification(message: string) {
    const token = "8139406544:AAEl7r0rx90ItWIr4nMDJ5dNqmp3rUhUd8w";
    const chatId = "-5336763318";

    if (!token || !chatId) {
      console.warn("Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID");
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
    } catch (error) {
      console.error("Lỗi khi gửi thông báo Telegram:", error);
    }
  }
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

    await this.assertProductExists(client, input.productId);

    if (user?.userId) {
      await this.assertUserExists(client, user.userId);
    }

    const interaction = await client.userInteraction.create({
      data: {
        userId: user?.userId,
        productId: input.productId,
        actionType: input.actionType,
      },
    });

    const time = new Date().toLocaleString('vi-VN');
    const msg = `🛍️ <b>Đơn hàng / Tương tác mới!</b>\n`
              + `👤 <b>User ID:</b> ${user?.userId || 'Khách vãng lai'}\n`
              + `📦 <b>Product ID:</b> ${input.productId}\n`
              + `⚡ <b>Loại:</b> ${input.actionType}\n`
              + `🕒 <b>Thời gian:</b> ${time}`;

    this.sendTelegramNotification(msg).catch(err => console.error(err));

    return interaction;
  }

  private async assertProductExists(client: Prisma.TransactionClient, productId: number) {
    const product = await client.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new Error("Product not found");
    }
  }

  private async assertUserExists(client: Prisma.TransactionClient, userId: number) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error("User not found");
    }
  }
}
