import { Router } from "express";
import { ProductController } from "../controllers/product.controller.js";
import { prisma } from "../lib/prisma.js";
import { optionalAuthenticateToken } from "../middleware/auth.js";
import { InteractionService } from "../services/interaction.service.js";
const router = Router();
const interactionService = new InteractionService();
const productController = new ProductController();
function toPositiveInteger(value) {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : NaN;
}
router.get("/", async (_req, res, next) => {
    try {
        const products = await prisma.product.findMany({
            include: {
                inventory: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return res.json({ products });
    }
    catch (error) {
        next(error);
    }
});
router.get("/recommendations", optionalAuthenticateToken, productController.getRecommendations.bind(productController));
router.get("/:id", async (req, res, next) => {
    try {
        const productId = toPositiveInteger(req.params.id);
        if (!productId) {
            return res.status(400).json({ message: "Product id must be a positive integer" });
        }
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                inventory: true,
            },
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        await interactionService.record({
            authorization: req.header("authorization") ?? undefined,
            sessionId: req.header("x-session-id") ?? undefined,
            productId,
            type: "VIEW",
        });
        return res.json({ product });
    }
    catch (error) {
        next(error);
    }
});
export default router;
