import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { CheckoutPaymentMethod, OrderService } from "../services/order.service.js";

const orderService = new OrderService();

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function toPositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return fallback;
}

function getPositiveInteger(value: unknown) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return undefined;
}

const checkoutPaymentMethods = new Set<CheckoutPaymentMethod>([
  "COD",
  "STRIPE",
  "VNPAY",
  "ONLINE",
]);

function getCheckoutPaymentMethod(value: unknown): CheckoutPaymentMethod {
  if (typeof value === "string" && checkoutPaymentMethods.has(value as CheckoutPaymentMethod)) {
    return value as CheckoutPaymentMethod;
  }

  return "COD";
}

export class OrderController {
  async checkout(req: AuthenticatedRequest, res: Response, _next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Missing authenticated user" });
      }

      const order = await orderService.checkout({
        userId: req.user.userId,
        paymentMethod: getCheckoutPaymentMethod(req.body?.paymentMethod),
        voucherCode: typeof req.body?.voucherCode === "string" ? req.body.voucherCode : undefined,
      });

      return res.status(201).json({ order });
    } catch (error) {
      return res.status(400).json({ message: getErrorMessage(error) });
    }
  }

  async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Missing authenticated user" });
      }

      const page = toPositiveInteger(req.query.page, 1);
      const limit = toPositiveInteger(req.query.limit, 10);
      const result = await orderService.getHistory({
        userId: req.user.userId,
        page,
        limit,
      });

      return res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async completeOrder(req: AuthenticatedRequest, res: Response, _next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Missing authenticated user" });
      }

      const orderId = getPositiveInteger(req.params.id);

      if (!orderId) {
        return res.status(400).json({ message: "Order id must be a positive integer" });
      }

      const order = await orderService.completeOrder({
        orderId,
        userId: req.user.userId,
      });

      return res.json({
        success: true,
        data: order,
        order,
      });
    } catch (error) {
      const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 400;

      return res.status(statusCode).json({ message: getErrorMessage(error) });
    }
  }
}
