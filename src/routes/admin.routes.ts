import { Router } from "express";
import { AdminController } from "../controllers/admin.controller.js";

const router = Router();
const adminController = new AdminController();

router.post("/ai/train", adminController.trainAiModel.bind(adminController));

export default router;
