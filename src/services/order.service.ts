import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { InteractionService } from "./interaction.service.js";

export interface CheckoutInput {
  userId: number;
}

export interface OrderHistoryInput {
  userId: number;
  page: number;
  limit: number;
}

export class OrderService {
  private readonly interactionService = new InteractionService();

  async checkout(input: CheckoutInput) {
    return prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: input.userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }

      const orderTotal = cart.items.reduce(
        (sum, item) => sum.plus(item.product.price.mul(item.quantity)),
        new Prisma.Decimal(0),
      );

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          total: orderTotal,
          paymentMethod: "COD",
          paymentStatus: "PENDING",
        },
      });

      const orderItems = [];

      for (const cartItem of cart.items) {
        const availableInventory = await tx.inventory.findMany({
          where: {
            productId: cartItem.productId,
            status: "AVAILABLE",
          },
          orderBy: {
            id: "asc",
          },
          take: cartItem.quantity,
        });

        if (availableInventory.length !== cartItem.quantity) {
          throw new Error(`Not enough available serials for product ${cartItem.productId}`);
        }

        const orderItemTotal = cartItem.product.price.mul(cartItem.quantity);
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: cartItem.productId,
            quantity: cartItem.quantity,
            unitPrice: cartItem.product.price,
            total: orderItemTotal,
          },
        });

        const inventoryIds = availableInventory.map((inventoryItem) => inventoryItem.id);
        const updateResult = await tx.inventory.updateMany({
          where: {
            id: {
              in: inventoryIds,
            },
            status: "AVAILABLE",
          },
          data: {
            status: "SOLD",
            orderItemId: orderItem.id,
          },
        });

        if (updateResult.count !== cartItem.quantity) {
          throw new Error(
            `Unable to reserve exact serial quantity for product ${cartItem.productId}`,
          );
        }

        orderItems.push(orderItem);

        await this.interactionService.recordWithClient(tx, {
          userId: input.userId,
          productId: cartItem.productId,
          type: "PURCHASE",
        });
      }

      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: {
            include: {
              product: true,
              inventory: true,
            },
          },
        },
      });
    });
  }

  async getHistory(input: OrderHistoryInput) {
    const skip = (input.page - 1) * input.limit;
    const where = {
      userId: input.userId,
    };

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: input.limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: orders,
      pagination: {
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }
}
