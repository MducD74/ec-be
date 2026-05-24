import axios from "axios";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { CategoryService } from "../services/category.service.js";
import { InteractionService } from "../services/interaction.service.js";

const aiClient = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 2500,
});

function normalizeRecommendedProductIds(data: unknown) {
  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const payload = data as {
    recommended_product_ids?: unknown;
    product_ids?: unknown;
    recommendations?: unknown;
  };

  const ids =
    payload.recommended_product_ids ?? payload.product_ids ?? payload.recommendations ?? [];

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

function toPositiveInteger(value: unknown, fallback?: number) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return fallback;
}

export class ProductController {
  constructor(
    private readonly categoryService = new CategoryService(),
    private readonly interactionService = new InteractionService(),
  ) {}

  async getProducts(req: Request, res: Response) {
    const page = toPositiveInteger(req.query.page, 1) ?? 1;
    const limit = toPositiveInteger(req.query.limit, 12) ?? 12;
    const categoryId = toPositiveInteger(req.query.categoryId);
    const skip = (page - 1) * limit;

    let categoryIds: number[] | undefined;

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

    const where = categoryIds
      ? {
          categoryId: {
            in: categoryIds,
          },
        }
      : undefined;

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

  async getRecommendations(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId ?? null;

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
    } catch (error) {
      console.error("Recommendation service fallback:", error);
      const products = await getFallbackProducts();
      return res.json({ products });
    }
  }

  async getProductById(req: Request, res: Response) {
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
      type: "VIEW",
    });

    return res.json({
      success: true,
      data: product,
      product,
    });
  }
}
