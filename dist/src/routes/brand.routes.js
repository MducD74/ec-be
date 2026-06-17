import { Router } from "express";
import { BrandController } from "../controllers/brand.controller.js";
const router = Router();
const brandController = new BrandController();
router.get("/", brandController.getBrands.bind(brandController));
export default router;
