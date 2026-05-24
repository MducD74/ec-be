import { Router } from "express";
import { CategoryController } from "../controllers/category.controller.js";
const router = Router();
const categoryController = new CategoryController();
router.get("/", categoryController.getCategories.bind(categoryController));
export default router;
