import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

export interface ValidatedVoucher {
  voucherId: number;
  usageLimit: number;
  discountAmount: number;
}

function formatVoucherValue(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function buildVoucherDescription(voucher: {
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  minOrderValue: number;
  maxDiscountValue: number | null;
}) {
  const discountText =
    voucher.discountType === "PERCENTAGE"
      ? `Giảm ${voucher.discountValue}%${
          voucher.maxDiscountValue ? ` tối đa ${formatVoucherValue(voucher.maxDiscountValue)}đ` : ""
        }`
      : `Giảm ${formatVoucherValue(voucher.discountValue)}đ`;
  const conditionText =
    voucher.minOrderValue > 0
      ? `cho đơn từ ${formatVoucherValue(voucher.minOrderValue)}đ`
      : "cho mọi đơn hàng";

  return `${discountText} ${conditionText}`;
}

export async function validateVoucher(
  code: string,
  orderTotal: Prisma.Decimal,
  client: PrismaClientLike = prisma,
): Promise<ValidatedVoucher> {
  const voucherCode = code.trim();

  if (!voucherCode) {
    throw new Error("Mã voucher không được để trống");
  }

  const voucher = await client.voucher.findUnique({
    where: {
      code: voucherCode,
    },
  });

  if (!voucher) {
    throw new Error("Mã voucher không tồn tại");
  }

  if (!voucher.isActive) {
    throw new Error("Mã voucher không còn hoạt động");
  }

  const now = new Date();

  if (now < voucher.startDate) {
    throw new Error("Mã voucher chưa có hiệu lực");
  }

  if (now > voucher.endDate) {
    throw new Error("Mã đã hết hạn");
  }

  if (voucher.usedCount >= voucher.usageLimit) {
    throw new Error("Mã voucher đã hết lượt sử dụng");
  }

  const orderTotalValue = orderTotal.toNumber();

  if (orderTotalValue < voucher.minOrderValue) {
    throw new Error("Đơn hàng chưa đạt giá trị tối thiểu để dùng voucher");
  }

  const rawDiscount =
    voucher.discountType === "PERCENTAGE"
      ? (orderTotalValue * voucher.discountValue) / 100
      : voucher.discountValue;
  const cappedDiscount =
    voucher.discountType === "PERCENTAGE" && voucher.maxDiscountValue !== null
      ? Math.min(rawDiscount, voucher.maxDiscountValue)
      : rawDiscount;
  const discountAmount = Math.min(Math.max(cappedDiscount, 0), orderTotalValue);

  return {
    voucherId: voucher.id,
    usageLimit: voucher.usageLimit,
    discountAmount,
  };
}

export class VoucherService {
  async getFallbackRecommendedVouchers() {
    const now = new Date();
    const vouchers = await prisma.voucher.findMany({
      where: {
        isActive: true,
        endDate: {
          gt: now,
        },
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        minOrderValue: true,
        maxDiscountValue: true,
        endDate: true,
        usageLimit: true,
        usedCount: true,
      },
      orderBy: {
        id: "desc",
      },
      take: 10,
    });

    return vouchers
      .filter((voucher) => voucher.usedCount < voucher.usageLimit)
      .slice(0, 3)
      .map((voucher) => ({
        id: voucher.id,
        code: voucher.code,
        description: buildVoucherDescription(voucher),
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        minOrderValue: voucher.minOrderValue,
        maxDiscountValue: voucher.maxDiscountValue,
        endDate: voucher.endDate,
        is_upsell: false,
      }));
  }

  async getActiveVouchers() {
    const now = new Date();
    const vouchers = await prisma.voucher.findMany({
      where: {
        isActive: true,
        endDate: {
          gt: now,
        },
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        minOrderValue: true,
        maxDiscountValue: true,
        endDate: true,
        usageLimit: true,
        usedCount: true,
      },
    });

    return vouchers
      .filter((voucher) => voucher.usedCount < voucher.usageLimit)
      .sort((firstVoucher, secondVoucher) => secondVoucher.discountValue - firstVoucher.discountValue)
      .map((voucher) => ({
        id: voucher.id,
        code: voucher.code,
        description: buildVoucherDescription(voucher),
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        minOrderValue: voucher.minOrderValue,
        maxDiscountValue: voucher.maxDiscountValue,
        endDate: voucher.endDate,
      }));
  }

  async validate(code: string, orderTotal: number) {
    if (!Number.isFinite(orderTotal) || orderTotal < 0) {
      throw new Error("Tổng tiền đơn hàng không hợp lệ");
    }

    return validateVoucher(code, new Prisma.Decimal(orderTotal));
  }
}
