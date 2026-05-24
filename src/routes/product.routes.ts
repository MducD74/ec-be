import { Router } from "express";
import { ProductController } from "../controllers/product.controller.js";
import { optionalAuthenticateToken } from "../middleware/auth.js";

const router = Router();
const productController = new ProductController();

router.get("/", productController.getProducts.bind(productController));

router.get(
  "/recommendations",
  optionalAuthenticateToken,
  productController.getRecommendations.bind(productController),
);

router.get("/:id", productController.getProductById.bind(productController));

export default router;
