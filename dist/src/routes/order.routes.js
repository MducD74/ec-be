import { Router } from "express";
import { OrderController } from "../controllers/order.controller.js";
import { authenticateToken } from "../middleware/auth.js";
const router = Router();
const orderController = new OrderController();
router.post("/checkout", authenticateToken, orderController.checkout.bind(orderController));
export default router;
