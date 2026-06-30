import { Router } from "express";
import { paymentController } from "../controllers/payment.controller.js";
const router = Router();
/**
 * GET /payment/vnpay/ipn
 * Endpoint cho VNPay server gọi sau khi xử lý giao dịch.
 * KHÔNG yêu cầu auth — VNPay gọi trực tiếp.
 * Bảo mật qua SecureHash verification trong controller.
 */
router.get("/vnpay/ipn", (req, res, next) => paymentController.vnpayIpn(req, res, next));
/**
 * GET /payment/vnpay/return
 * VNPay redirect user về sau khi thanh toán.
 * KHÔNG yêu cầu auth — browser redirect từ VNPay.
 */
router.get("/vnpay/return", (req, res, next) => paymentController.vnpayReturn(req, res, next));
export default router;
