import axios from "axios";
import { prisma } from "../lib/prisma.js";
import { CategoryService } from "../services/category.service.js";
import { InteractionService } from "../services/interaction.service.js";
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
function toPositiveInteger(value, fallback) {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue > 0) {
        return numberValue;
    }
    return fallback;
}
function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}
export class ProductController {
    categoryService;
    interactionService;
    constructor(categoryService = new CategoryService(), interactionService = new InteractionService()) {
        this.categoryService = categoryService;
        this.interactionService = interactionService;
    }
    async getProducts(req, res) {
        const page = toPositiveInteger(req.query.page, 1) ?? 1;
        const limit = toPositiveInteger(req.query.limit, 12) ?? 12;
        const categoryId = toPositiveInteger(req.query.categoryId);
        const search = toTrimmedString(req.query.search || req.query.q || req.query.name);
        const brand = toTrimmedString(req.query.brand);
        const skip = (page - 1) * limit;
        let categoryIds;
        if (typeof categoryId === "number") {
            categoryIds = await this.categoryService.getCategoryAndDescendantIds(categoryId);
            if (categoryIds.length === 0) {
                return res.json({
                    success: true,
                    data: [],
                    products: [],
                    pagination: {
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                    },
                });
            }
        }
        const whereFilters = [];
        if (categoryIds) {
            whereFilters.push({
                categoryId: {
                    in: categoryIds,
                },
            });
        }
        if (search) {
            whereFilters.push({
                name: {
                    contains: search,
                    mode: "insensitive",
                },
            });
        }
        if (brand) {
            whereFilters.push({
                brand: {
                    contains: brand,
                    mode: "insensitive",
                },
            });
        }
        const where = whereFilters.length > 0 ? { AND: whereFilters } : undefined;
        const [total, products] = await Promise.all([
            prisma.product.count({ where }),
            prisma.product.findMany({
                where,
                skip,
                take: limit,
                include: {
                    category: true,
                    inventory: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
            }),
        ]);
        return res.json({
            success: true,
            data: products,
            products,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    async getRecommendations(req, res) {
        const userId = req.user?.userId ?? null;
        if (!userId) {
            const products = await getFallbackProducts();
            return res.json({ products });
        }
        try {
            const response = await aiClient.get(`/recommend/hybrid/${userId}`);
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
    async getSimilarProducts(req, res) {
        const productId = toPositiveInteger(req.params.id);
        if (!productId) {
            return res.status(400).json({ message: "Product id must be a positive integer" });
        }
        try {
            const product = await prisma.product.findUnique({
                where: { id: productId },
                select: { id: true },
            });
            if (!product) {
                return res.status(404).json({ message: "Product not found" });
            }
            const response = await aiClient.get(`/recommend/similar/${productId}`);
            const similarProductIds = normalizeRecommendedProductIds(response.data);
            if (similarProductIds.length === 0) {
                return res.json({
                    success: true,
                    data: [],
                    products: [],
                });
            }
            const products = await prisma.product.findMany({
                where: {
                    id: {
                        in: similarProductIds,
                    },
                },
                include: {
                    category: true,
                    inventory: true,
                },
            });
            const productById = new Map(products.map((similarProduct) => [similarProduct.id, similarProduct]));
            const orderedProducts = similarProductIds
                .map((similarProductId) => productById.get(similarProductId))
                .filter((similarProduct) => similarProduct !== undefined);
            return res.json({
                success: true,
                data: orderedProducts,
                products: orderedProducts,
            });
        }
        catch (error) {
            console.error("Similar products service error:", error);
            return res.status(503).json({
                success: false,
                message: "Unable to load similar products",
            });
        }
    }
    async getProductById(req, res) {
        const productId = toPositiveInteger(req.params.id);
        if (!productId) {
            return res.status(400).json({ message: "Product id must be a positive integer" });
        }
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                category: true,
                inventory: true,
            },
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        await this.interactionService.record({
            authorization: req.header("authorization") ?? undefined,
            sessionId: req.header("x-session-id") ?? undefined,
            productId,
            actionType: "VIEW",
        });
        return res.json({
            success: true,
            data: product,
            product,
        });
    }
}
