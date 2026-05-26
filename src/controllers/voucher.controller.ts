import axios from "axios";
import { NextFunction, Request, Response } from "express";
import { VoucherService } from "../services/voucher.service.js";

const voucherService = new VoucherService();
const aiClient = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 2500,
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function toPositiveInteger(value: unknown) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return undefined;
}

export class VoucherController {
  async getActiveVouchers(_req: Request, res: Response, _next: NextFunction) {
    try {
      const vouchers = await voucherService.getActiveVouchers();

      return res.json({
        success: true,
        data: vouchers,
        vouchers,
      });
    } catch (error) {
      return res.status(400).json({
        message: getErrorMessage(error),
      });
    }
  }

  async validate(req: Request, res: Response, _next: NextFunction) {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      const orderTotal = Number(req.body?.orderTotal);
      const result = await voucherService.validate(code, orderTotal);

      return res.json({
        valid: true,
        voucherId: result.voucherId,
        discountAmount: result.discountAmount,
      });
    } catch (error) {
      return res.status(400).json({
        valid: false,
        message: getErrorMessage(error),
      });
    }
  }

  async recommendByProduct(req: Request, res: Response, _next: NextFunction) {
    const productId = toPositiveInteger(req.params.productId);

    if (!productId) {
      return res.status(400).json({ message: "productId must be a positive integer" });
    }

    try {
      const response = await aiClient.get(`/recommend/vouchers/${productId}`);

      return res.json(response.data);
    } catch (error) {
      console.error("Voucher recommendation service fallback:", getErrorMessage(error));
      const vouchers = await voucherService.getFallbackRecommendedVouchers();

      return res.json({
        status: "fallback",
        productId,
        recommended_vouchers: vouchers,
        data: vouchers,
        vouchers,
      });
    }
  }
}
