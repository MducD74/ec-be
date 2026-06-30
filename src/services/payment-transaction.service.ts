import { Prisma } from "../../generated/prisma/client.js";
import { appLog } from "../config/winston.js";

export interface CreateTransactionInput {
  orderId: number;
  transactionRef: string;
  amount: Prisma.Decimal;
  paymentUrl: string;
  expiredAt: Date;
}

export class PaymentTransactionService {
  async createTransaction(
    tx: Prisma.TransactionClient,
    input: CreateTransactionInput,
  ) {
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

  async markSuccess(
    tx: Prisma.TransactionClient,
    id: number,
    data: {
      providerTransactionId: string;
      responseCode: string;
      responseMessage: string;
      bankCode: string;
      bankTransactionNo: string;
      paidAt: Date;
      rawResponse: Prisma.InputJsonValue;
    },
  ) {
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

  async markFailed(
    tx: Prisma.TransactionClient,
    id: number,
    data: {
      responseCode: string;
      responseMessage: string;
      rawResponse: Prisma.InputJsonValue;
    },
  ) {
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

  async markExpired(
    tx: Prisma.TransactionClient,
    id: number,
  ) {
    const transaction = await tx.paymentTransaction.update({
      where: { id },
      data: { status: "EXPIRED" },
    });

    appLog.info("[PaymentTransaction] Marked EXPIRED", { id });

    return transaction;
  }

  async findByTransactionRef(
    tx: Prisma.TransactionClient,
    transactionRef: string,
  ) {
    return tx.paymentTransaction.findFirst({
      where: { transactionRef },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const paymentTransactionService = new PaymentTransactionService();