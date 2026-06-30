import { appLog } from "../config/winston.js";
export class PaymentTransactionService {
    async createTransaction(tx, input) {
        const transaction = await tx.paymentTransaction.create({
            data: {
                orderId: input.orderId,
                provider: "VNPAY",
                transactionRef: input.transactionRef,
                amount: input.amount,
                currency: "VND",
                status: "PENDING",
                paymentUrl: input.paymentUrl,
                expiredAt: input.expiredAt,
            },
        });
        appLog.info("[PaymentTransaction] Created", {
            id: transaction.id,
            orderId: input.orderId,
            transactionRef: input.transactionRef,
        });
        return transaction;
    }
    async markSuccess(tx, id, data) {
        const transaction = await tx.paymentTransaction.update({
            where: { id },
            data: {
                status: "SUCCESS",
                providerTransactionId: data.providerTransactionId,
                responseCode: data.responseCode,
                responseMessage: data.responseMessage,
                bankCode: data.bankCode,
                bankTransactionNo: data.bankTransactionNo,
                paidAt: data.paidAt,
                rawResponse: data.rawResponse,
            },
        });
        appLog.info("[PaymentTransaction] Marked SUCCESS", {
            id,
            providerTransactionId: data.providerTransactionId,
        });
        return transaction;
    }
    async markFailed(tx, id, data) {
        const transaction = await tx.paymentTransaction.update({
            where: { id },
            data: {
                status: "FAILED",
                responseCode: data.responseCode,
                responseMessage: data.responseMessage,
                rawResponse: data.rawResponse,
            },
        });
        appLog.info("[PaymentTransaction] Marked FAILED", {
            id,
            responseCode: data.responseCode,
        });
        return transaction;
    }
    async markExpired(tx, id) {
        const transaction = await tx.paymentTransaction.update({
            where: { id },
            data: { status: "EXPIRED" },
        });
        appLog.info("[PaymentTransaction] Marked EXPIRED", { id });
        return transaction;
    }
    async findByTransactionRef(tx, transactionRef) {
        return tx.paymentTransaction.findFirst({
            where: { transactionRef },
            orderBy: { createdAt: "desc" },
        });
    }
}
export const paymentTransactionService = new PaymentTransactionService();
