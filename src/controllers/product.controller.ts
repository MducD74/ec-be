import axios from "axios";
import { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
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
      brand: true,
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

function toTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createPaginationMeta(totalItems: number, currentPage: number, limit: number) {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage,
    limit,
  };
}

export class ProductController {
  constructor(
    private readonly categoryService = new CategoryService(),
    private readonly interactionService = new InteractionService(),
  ) {}

  async getProducts(req: Request, res: Response) {
    const page = toPositiveInteger(req.query.page, 1) ?? 1;
    const limit = toPositiveInteger(req.query.limit, 10) ?? 10;
    const categoryId = toPositiveInteger(req.query.categoryId);
    const brandId = toPositiveInteger(req.query.brandId);
    const search = toTrimmedString(req.query.search || req.query.q || req.query.name);
    const skip = (page - 1) * limit;

    let categoryIds: number[] | undefined;

    if (typeof categoryId === "number") {
      categoryIds = await this.categoryService.getCategoryAndDescendantIds(categoryId);

      if (categoryIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          products: [],
          meta: createPaginationMeta(0, page, limit),
        });
      }
    }

    const whereFilters: Prisma.ProductWhereInput[] = [];

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

    if (typeof brandId === "number") {
      whereFilters.push({
        brandId,
      });
    }

    const where: Prisma.ProductWhereInput | undefined =
      whereFilters.length > 0 ? { AND: whereFilters } : undefined;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          brand: true,
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
      meta: createPaginationMeta(total, page, limit),
    });
  }

  async getRecommendations(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId ?? null;

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
          brand: true,
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

  async getSimilarProducts(req: Request, res: Response) {
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
          brand: true,
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
    } catch (error) {
      console.error("Similar products service error:", error);
      return res.status(503).json({
        success: false,
        message: "Unable to load similar products",
      });
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
        brand: true,
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
