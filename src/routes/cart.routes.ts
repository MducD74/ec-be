import { Router } from "express";
import { CartController } from "../controllers/cart.controller.js";

const router = Router();
const cartController = new CartController();

router.get("/", cartController.getCart.bind(cartController));
router.post("/items", cartController.addItem.bind(cartController));
router.patch("/items/:productId", cartController.updateItem.bind(cartController));
router.delete("/items/:productId", cartController.removeItem.bind(cartController));

export default router;
