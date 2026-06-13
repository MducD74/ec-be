import axios from "axios";
import { NextFunction, Request, Response } from "express";
import { OrderStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

const aiClient = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 5000,
});

const adminStatsStatuses = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.COMPLETED];
const allowedOrderStatuses = new Set(Object.values(OrderStatus));

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function toPositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return fallback;
}

function getPositiveInteger(value: unknown) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return undefined;
}

function normalizeOrderStatus(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const status = value.trim().toUpperCase();

  if (status === "DELIVERED") {
    return OrderStatus.COMPLETED;
  }

  return allowedOrderStatuses.has(status as OrderStatus) ? (status as OrderStatus) : undefined;
}

export class AdminController {
  async getStats(_req: Request, res: Response, _next: NextFunction) {
    try {
      const [revenueAggregate, totalOrders, totalUsers, ordersByStatus] = await Promise.all([
        prisma.order.aggregate({
          where: {
            status: {
              not: OrderStatus.CANCELLED,
            },
          },
          _sum: {
            total: true,
          },
        }),
        prisma.order.count(),
        prisma.user.count(),
        prisma.order.groupBy({
          by: ["status"],
          where: {
            status: {
              in: adminStatsStatuses,
            },
          },
          _count: {
            _all: true,
          },
        }),
      ]);

      const orderStatusCounts = {
        PENDING: 0,
        PROCESSING: 0,
        DELIVERED: 0,
      };

      for (const statusGroup of ordersByStatus) {
        if (statusGroup.status === OrderStatus.PENDING) {
          orderStatusCounts.PENDING = statusGroup._count._all;
        }

        if (statusGroup.status === OrderStatus.PROCESSING) {
          orderStatusCounts.PROCESSING = statusGroup._count._all;
        }

        if (statusGroup.status === OrderStatus.COMPLETED) {
          orderStatusCounts.DELIVERED = statusGroup._count._all;
        }
      }

      return res.json({
        success: true,
        data: {
          totalRevenue: revenueAggregate._sum.total ?? 0,
          totalOrders,
          totalUsers,
          orderStatusCounts,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: getErrorMessage(error),
      });
    }
  }

  async getOrders(req: Request, res: Response, _next: NextFunction) {
    try {
      const page = toPositiveInteger(req.query.page, 1);
      const limit = 10;
      const skip = (page - 1) * limit;

      const [total, orders] = await Promise.all([
        prisma.order.count(),
        prisma.order.findMany({
          skip,
          take: limit,
          orderBy: {
            createdAt: "desc",
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    price: true,
                    imageUrl: true,
                  },
                },
                inventory: true,
              },
            },
          },
        }),
      ]);

      return res.json({
        success: true,
        data: orders,
        orders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: getErrorMessage(error),
      });
    }
  }

  async updateOrderStatus(req: Request, res: Response, _next: NextFunction) {
    try {
      const orderId = getPositiveInteger(req.params.id);
      const status = normalizeOrderStatus(req.body?.status);

      if (!orderId) {
        return res.status(400).json({ success: false, message: "Order id must be a positive integer" });
      }

      if (!status) {
        return res.status(400).json({ success: false, message: "Invalid order status" });
      }

      const order = await prisma.order.update({
        where: {
          id: orderId,
        },
        data: {
          status,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          items: {
            include: {
              product: true,
              inventory: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: order,
        order,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: getErrorMessage(error),
      });
    }
  }

  async getAiInteractions(_req: Request, res: Response, _next: NextFunction) {
    try {
      const interactions = await prisma.userInteraction.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        select: {
          id: true,
          userId: true,
          productId: true,
          actionType: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: interactions,
        interactions,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Unable to load AI interaction stream: ${getErrorMessage(error)}`,
      });
    }
  }

  async toggleVoucher(req: Request, res: Response, _next: NextFunction) {
    try {
      const voucherId = getPositiveInteger(req.params.id);

      if (!voucherId) {
        return res.status(400).json({
          success: false,
          message: "Mã định danh voucher phải là số nguyên dương",
        });
      }

      const voucher = await prisma.voucher.findUnique({
        where: {
          id: voucherId,
        },
        select: {
          id: true,
          code: true,
          isActive: true,
        },
      });

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy voucher",
        });
      }

      const updatedVoucher = await prisma.voucher.update({
        where: {
          id: voucherId,
        },
        data: {
          isActive: !voucher.isActive,
        },
      });

      return res.json({
        success: true,
        message: updatedVoucher.isActive
          ? `Đã bật voucher ${updatedVoucher.code} thành công`
          : `Đã tắt voucher ${updatedVoucher.code} thành công`,
        data: updatedVoucher,
        voucher: updatedVoucher,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Không thể cập nhật trạng thái voucher: ${getErrorMessage(error)}`,
      });
    }
  }

  async trainAiModel(_req: Request, res: Response, _next: NextFunction) {
    try {
      void aiClient.post("/train").catch((error) => {
        console.error("AI training request failed:", getErrorMessage(error));
      });

      return res.status(202).json({
        success: true,
        message: "Đang tiến hành huấn luyện mô hình",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: getErrorMessage(error),
      });
    }
  }
}
