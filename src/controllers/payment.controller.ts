import { Request, Response, NextFunction } from "express";
import { appLog } from "../config/winston.js";
import { paymentTransactionService } from "../services/payment-transaction.service.js";
import { prisma } from "../lib/prisma.js";
import { vnPayService } from "../services/vnpay.service.js";

// ─── IPN Response helpers ─────────────────────────────────────────────────────
// VNPay yêu cầu response IPN đúng format, không được trả lỗi HTTP

interface IpnResponse {
  RspCode: string;
  Message: string;
}

function ipnOk(): IpnResponse {
  return { RspCode: "00", Message: "Confirm Success" };
}

function ipnInvalidSignature(): IpnResponse {
  return { RspCode: "97", Message: "Invalid Signature" };
}

function ipnOrderNotFound(): IpnResponse {
  return { RspCode: "01", Message: "Order not found" };
}

function ipnInvalidAmount(): IpnResponse {
  return { RspCode: "04", Message: "Invalid amount" };
}

function ipnAlreadyConfirmed(): IpnResponse {
  return { RspCode: "02", Message: "Order already confirmed" };
}

function ipnUnknownError(): IpnResponse {
  return { RspCode: "99", Message: "Unknown error" };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class PaymentController {
  /**
   * POST /payment/vnpay/ipn
   * VNPay gọi endpoint này sau khi xử lý thanh toán.
   * Đây là nguồn duy nhất để cập nhật trạng thái đơn hàng.
   */
  async vnpayIpn(req: Request, res: Response, _next: NextFunction) {
    const query = req.query as Record<string, string>;

    appLog.info("[PaymentController] IPN received", {
      transactionRef: query.vnp_TxnRef,
      responseCode: query.vnp_ResponseCode,
    });

    try {
      // 1. Verify SecureHash
      const isValidSignature = vnPayService.verifySignature(query);
      if (!isValidSignature) {
        appLog.warn("[PaymentController] IPN invalid signature", {
          transactionRef: query.vnp_TxnRef,
        });
        return res.json(ipnInvalidSignature());
      }

      const ipnResult = vnPayService.verifyIpn(query);

      // 2. Verify transactionRef tồn tại
      const existingTransaction = await prisma.paymentTransaction.findFirst({
        where: { transactionRef: ipnResult.transactionRef },
        orderBy: { createdAt: "desc" },
        include: { order: true },
      });

      if (!existingTransaction) {
        appLog.warn("[PaymentController] IPN: transaction not found", {
          transactionRef: ipnResult.transactionRef,
        });
        return res.json(ipnOrderNotFound());
      }

      // 3. Verify amount khớp
      const expectedAmountVnd = existingTransaction.amount.toNumber();
      if (expectedAmountVnd !== ipnResult.amount) {
        appLog.warn("[PaymentController] IPN: amount mismatch", {
          transactionRef: ipnResult.transactionRef,
          expected: expectedAmountVnd,
          received: ipnResult.amount,
        });
        return res.json(ipnInvalidAmount());
      }

      // 4. Idempotent: nếu đã SUCCESS rồi thì return OK ngay
      if (existingTransaction.status === "SUCCESS") {
        appLog.info("[PaymentController] IPN: already confirmed, idempotent", {
          transactionRef: ipnResult.transactionRef,
        });
        return res.json(ipnAlreadyConfirmed());
      }

      // 5. Xử lý trong Prisma transaction
      await prisma.$transaction(async (tx) => {
        const rawResponse = query as unknown as Record<string, string>;

        if (ipnResult.responseCode === "00") {
          // Thanh toán thành công
          await paymentTransactionService.markSuccess(tx, existingTransaction.id, {
            providerTransactionId: ipnResult.transactionNo,
            responseCode: ipnResult.responseCode,
            responseMessage: ipnResult.message,
            bankCode: ipnResult.bankCode,
            bankTransactionNo: ipnResult.bankTransactionNo,
            paidAt: new Date(),
            rawResponse,
          });

          await tx.order.update({
            where: { id: existingTransaction.orderId },
            data: {
              paymentStatus: "PAID",
              status: "COMPLETED",
            },
          });

          appLog.info("[PaymentController] IPN: order confirmed", {
            orderId: existingTransaction.orderId,
            transactionRef: ipnResult.transactionRef,
          });
        } else {
          // Thanh toán thất bại
          await paymentTransactionService.markFailed(tx, existingTransaction.id, {
            responseCode: ipnResult.responseCode,
            responseMessage: ipnResult.message,
            rawResponse,
          });

          // Order giữ PENDING để user có thể retry
          appLog.info("[PaymentController] IPN: payment failed", {
            orderId: existingTransaction.orderId,
            responseCode: ipnResult.responseCode,
            message: ipnResult.message,
          });
        }
      });

      return res.json(ipnOk());
    } catch (error) {
      appLog.error("[PaymentController] IPN unexpected error", {
        error: error instanceof Error ? error.message : String(error),
        transactionRef: query.vnp_TxnRef,
      });
      return res.json(ipnUnknownError());
    }
  }

  /**
   * GET /payment/vnpay/return
   * VNPay redirect user về đây sau khi thanh toán.
   * KHÔNG cập nhật database — chỉ redirect frontend với kết quả.
   * Cập nhật DB chỉ thực hiện qua IPN.
   */
  async vnpayReturn(req: Request, res: Response, _next: NextFunction) {
    const query = req.query as Record<string, string>;

    appLog.info("[PaymentController] Return URL received", {
      transactionRef: query.vnp_TxnRef,
      responseCode: query.vnp_ResponseCode,
    });

    try {
      const returnResult = vnPayService.verifyReturnUrl(query);

      const frontendReturnUrl = process.env.FRONTEND_RETURN_URL;
      if (!frontendReturnUrl) {
        throw new Error("Missing FRONTEND_RETURN_URL environment variable");
      }

      const redirectParams = new URLSearchParams({
        transactionRef: returnResult.transactionRef,
        responseCode: returnResult.responseCode,
        message: returnResult.message,
        isValid: String(returnResult.isValid),
      });

      const redirectUrl = `${frontendReturnUrl}?${redirectParams.toString()}`;

      appLog.info("[PaymentController] Return URL: redirecting to frontend", {
        transactionRef: returnResult.transactionRef,
        responseCode: returnResult.responseCode,
      });

      return res.redirect(302, redirectUrl);
    } catch (error) {
      appLog.error("[PaymentController] Return URL unexpected error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ message: "Internal server error" });
    }
  }
}

export const paymentController = new PaymentController();