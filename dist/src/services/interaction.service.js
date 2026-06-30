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
    async sendTelegramNotification(message) {
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
        }
        catch (error) {
            console.error("Lỗi khi gửi thông báo Telegram:", error);
        }
    }
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
