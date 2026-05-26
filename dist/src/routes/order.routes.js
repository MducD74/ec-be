import { Router } from "express";
import { OrderController } from "../controllers/order.controller.js";
import { authenticateToken } from "../middleware/auth.js";
const router = Router();
const orderController = new OrderController();
router.get("/history", authenticateToken, orderController.getHistory.bind(orderController));
router.post("/checkout", authenticateToken, orderController.checkout.bind(orderController));
router.put("/:id/complete", authenticateToken, orderController.completeOrder.bind(orderController));
export default router;
