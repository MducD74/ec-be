import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { OrderService } from "../services/order.service.js";

const orderService = new OrderService();

export class OrderController {
  async checkout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Missing authenticated user" });
      }

      const order = await orderService.checkout({
        userId: req.user.userId,
      });

      return res.status(201).json({ order });
    } catch (error) {
      next(error);
    }
  }
}
