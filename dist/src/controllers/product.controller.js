import axios from "axios";
import { prisma } from "../lib/prisma.js";
const aiClient = axios.create({
    baseURL: "http://localhost:8000",
    timeout: 2500,
});
function normalizeRecommendedProductIds(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (typeof data !== "object" || data === null) {
        return [];
    }
    const payload = data;
    const ids = payload.recommended_product_ids ?? payload.product_ids ?? payload.recommendations ?? [];
    if (!Array.isArray(ids)) {
        return [];
    }
    return ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
}
async function getFallbackProducts() {
    return prisma.product.findMany({
        take: 4,
        include: {
            inventory: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}
export class ProductController {
    async getRecommendations(req, res) {
        const userId = req.user?.userId ?? null;
        if (!userId) {
            const products = await getFallbackProducts();
            return res.json({ products });
        }
        try {
            const response = await aiClient.get(`/recommend/${userId}`);
            const recommendedProductIds = normalizeRecommendedProductIds(response.data);
            if (recommendedProductIds.length === 0) {
                const products = await getFallbackProducts();
                return res.json({ products });
            }
            const products = await prisma.product.findMany({
                where: {
                    id: {
                        in: recommendedProductIds,
                    },
                },
                include: {
                    inventory: true,
                },
            });
            const productById = new Map(products.map((product) => [product.id, product]));
            const orderedProducts = recommendedProductIds
                .map((productId) => productById.get(productId))
                .filter((product) => product !== undefined);
            return res.json({ products: orderedProducts });
        }
        catch (error) {
            console.error("Recommendation service fallback:", error);
            const products = await getFallbackProducts();
            return res.json({ products });
        }
    }
}
