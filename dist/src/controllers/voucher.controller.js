import axios from "axios";
import { VoucherService } from "../services/voucher.service.js";
const voucherService = new VoucherService();
const aiClient = axios.create({
    baseURL: "http://localhost:8000",
    timeout: 2500,
});
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Request failed";
}
function toPositiveInteger(value) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue > 0) {
        return numberValue;
    }
    return undefined;
}
export class VoucherController {
    async getActiveVouchers(req, res, _next) {
        try {
            const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
            const page = toPositiveInteger(req.query.page) ?? 1;
            const limit = toPositiveInteger(req.query.limit) ?? 5;
            const result = await voucherService.getActiveVouchers({
                search,
                page,
                limit,
            });
            return res.json({
                data: result.data,
                pagination: result.pagination,
            });
        }
        catch (error) {
            return res.status(400).json({
                message: getErrorMessage(error),
            });
        }
    }
    async validate(req, res, _next) {
        try {
            const code = typeof req.body?.code === "string" ? req.body.code : "";
            const orderTotal = Number(req.body?.orderTotal);
            const result = await voucherService.validate(code, orderTotal);
            return res.json({
                valid: true,
                voucherId: result.voucherId,
                discountAmount: result.discountAmount,
            });
        }
        catch (error) {
            return res.status(400).json({
                valid: false,
                message: getErrorMessage(error),
            });
        }
    }
    async recommendByProduct(req, res, _next) {
        const productId = toPositiveInteger(req.params.productId);
        if (!productId) {
            return res.status(400).json({ message: "productId must be a positive integer" });
        }
        try {
            const response = await aiClient.get(`/recommend/vouchers/${productId}`);
            return res.json(response.data);
        }
        catch (error) {
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
