import { NextFunction, Request, Response } from "express";
import { CartService } from "../services/cart.service.js";

const cartService = new CartService();

function getCartContext(req: Request) {
  const sessionId = req.header("x-session-id") ?? undefined;
  const authorization = req.header("authorization") ?? undefined;

  return { sessionId, authorization };
}

function toPositiveInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : NaN;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

export class CartController {
  async getCart(req: Request, res: Response, _next: NextFunction) {
    try {
      const cart = await cartService.getCart(getCartContext(req));
      return res.json({ cart });
    } catch (error) {
      return res.status(400).json({ message: getErrorMessage(error) });
    }
  }

  async addItem(req: Request, res: Response, _next: NextFunction) {
    try {
      const cart = await cartService.addItem(getCartContext(req), {
        productId: toPositiveInteger(req.body.productId),
        quantity: toPositiveInteger(req.body.quantity),
      });

      return res.status(201).json({ cart });
    } catch (error) {
      return res.status(400).json({ message: getErrorMessage(error) });
    }
  }

  async updateItem(req: Request, res: Response, _next: NextFunction) {
    try {
      const cart = await cartService.updateItem(getCartContext(req), {
        productId: toPositiveInteger(req.params.productId),
        quantity: toPositiveInteger(req.body.quantity),
      });

      return res.json({ cart });
    } catch (error) {
      return res.status(400).json({ message: getErrorMessage(error) });
    }
  }

  async removeItem(req: Request, res: Response, _next: NextFunction) {
    try {
      const cart = await cartService.removeItem(
        getCartContext(req),
        toPositiveInteger(req.params.productId),
      );

      return res.json({ cart });
    } catch (error) {
      return res.status(400).json({ message: getErrorMessage(error) });
    }
  }
}
