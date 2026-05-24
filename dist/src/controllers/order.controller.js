import { OrderService } from "../services/order.service.js";
const orderService = new OrderService();
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Request failed";
}
function toPositiveInteger(value, fallback) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue > 0) {
        return numberValue;
    }
    return fallback;
}
export class OrderController {
    async checkout(req, res, _next) {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "Missing authenticated user" });
            }
            const order = await orderService.checkout({
                userId: req.user.userId,
            });
            return res.status(201).json({ order });
        }
        catch (error) {
            return res.status(400).json({ message: getErrorMessage(error) });
        }
    }
    async getHistory(req, res, next) {
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
        }
        catch (error) {
            next(error);
        }
    }
}
