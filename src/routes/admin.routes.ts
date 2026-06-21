import { Router } from "express";
import { AdminController } from "../controllers/admin.controller.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";

const router = Router();
const adminController = new AdminController();

router.get("/ai-config", adminController.getAiConfig.bind(adminController));
router.use(authenticateToken, requireAdmin);

router.get("/stats", adminController.getStats.bind(adminController));
router.get("/users", adminController.getUsers.bind(adminController));
router.patch("/users/:userId/toggle-status", adminController.toggleUserStatus.bind(adminController));
router.get("/orders", adminController.getOrders.bind(adminController));
router.put("/orders/:id/status", adminController.updateOrderStatus.bind(adminController));
router.get("/products", adminController.getInventory.bind(adminController));
router.put("/products/:variantId", adminController.updateInventoryStock.bind(adminController));
router.get("/brands", adminController.getBrands.bind(adminController));
router.get("/categories", adminController.getCategories.bind(adminController));
router.get("/vouchers", adminController.getVouchers.bind(adminController));
router.patch("/vouchers/:id/toggle", adminController.toggleVoucher.bind(adminController));
router.put("/vouchers/:id/toggle", adminController.toggleVoucher.bind(adminController));
router.put("/ai-config", adminController.updateAiConfig.bind(adminController));
router.get("/ai/interactions", adminController.getAiInteractions.bind(adminController));
router.post("/ai/train", adminController.trainAiModel.bind(adminController));

export default router;
