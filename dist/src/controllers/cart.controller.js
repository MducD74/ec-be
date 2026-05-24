import { CartService } from "../services/cart.service.js";
const cartService = new CartService();
function getCartContext(req) {
    const sessionId = req.header("x-session-id") ?? undefined;
    const authorization = req.header("authorization") ?? undefined;
    return { sessionId, authorization };
}
function toPositiveInteger(value) {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) ? numberValue : NaN;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Request failed";
}
export class CartController {
    async getCart(req, res, _next) {
        try {
            const cart = await cartService.getCart(getCartContext(req));
            return res.json({ cart });
        }
        catch (error) {
            return res.status(400).json({ message: getErrorMessage(error) });
        }
    }
    async addItem(req, res, _next) {
        try {
            const cart = await cartService.addItem(getCartContext(req), {
                productId: toPositiveInteger(req.body.productId),
                quantity: toPositiveInteger(req.body.quantity),
            });
            return res.status(201).json({ cart });
        }
        catch (error) {
            return res.status(400).json({ message: getErrorMessage(error) });
        }
    }
    async updateItem(req, res, _next) {
        try {
            const cart = await cartService.updateItem(getCartContext(req), {
                productId: toPositiveInteger(req.params.productId),
                quantity: toPositiveInteger(req.body.quantity),
            });
            return res.json({ cart });
        }
        catch (error) {
            return res.status(400).json({ message: getErrorMessage(error) });
        }
    }
    async removeItem(req, res, _next) {
        try {
            const cart = await cartService.removeItem(getCartContext(req), toPositiveInteger(req.params.productId));
            return res.json({ cart });
        }
        catch (error) {
            return res.status(400).json({ message: getErrorMessage(error) });
        }
    }
}
