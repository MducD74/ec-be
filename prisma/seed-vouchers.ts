import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const startDate = new Date();
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + 1);

const prefixes = ["TECH", "SALE", "VIP", "HOT", "MAKAN"];
const codeCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomCodeSuffix(length = 5) {
  return Array.from({ length }, () => codeCharacters[randomInteger(0, codeCharacters.length - 1)]).join("");
}

function buildVoucherCode(existingCodes: Set<string>) {
  let code = "";

  do {
    const prefix = prefixes[randomInteger(0, prefixes.length - 1)];
    code = `${prefix}${randomCodeSuffix()}`;
  } while (existingCodes.has(code));

  existingCodes.add(code);
  return code;
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
  if (voucher.discountType === "PERCENTAGE") {
    return `Giảm ${voucher.discountValue}% tối đa ${formatVoucherValue(
      voucher.maxDiscountValue ?? 0,
    )}đ cho đơn từ ${formatVoucherValue(voucher.minOrderValue)}đ`;
  }

  return `Giảm ${formatVoucherValue(voucher.discountValue)}đ cho đơn từ ${formatVoucherValue(
    voucher.minOrderValue,
  )}đ`;
}

function randomRoundedValue(min: number, max: number, step = 10_000) {
  const minStep = Math.ceil(min / step);
  const maxStep = Math.floor(max / step);

  return randomInteger(minStep, maxStep) * step;
}

function randomMinOrderValue() {
  const probability = Math.random();

  if (probability < 0.1) {
    return 0;
  }

  if (probability < 0.5) {
    return randomRoundedValue(200_000, 1_000_000);
  }

  if (probability < 0.8) {
    return randomRoundedValue(2_000_000, 5_000_000, 50_000);
  }

  return randomRoundedValue(10_000_000, 30_000_000, 100_000);
}

function buildVoucherSeeds(count = 50) {
  const existingCodes = new Set<string>();

  return Array.from({ length: count }, () => {
    const minOrderValue = randomMinOrderValue();
    const discountType = Math.random() < 0.5 ? "PERCENTAGE" as const : "FIXED_AMOUNT" as const;

    if (discountType === "PERCENTAGE") {
      const voucher = {
        code: buildVoucherCode(existingCodes),
        discountType,
        discountValue: randomInteger(5, 30),
        minOrderValue,
        maxDiscountValue: randomRoundedValue(50_000, 1_000_000, 10_000),
        startDate,
        endDate,
        usageLimit: 100,
        usedCount: 0,
        isActive: true,
      };

      return {
        ...voucher,
        description: buildVoucherDescription(voucher),
      };
    }

    const maxFixedDiscount = Math.max(20_000, Math.min(2_000_000, minOrderValue || 200_000));

    const voucher = {
      code: buildVoucherCode(existingCodes),
      discountType,
      discountValue: randomRoundedValue(20_000, maxFixedDiscount, 10_000),
      minOrderValue,
      maxDiscountValue: null,
      startDate,
      endDate,
      usageLimit: 100,
      usedCount: 0,
      isActive: true,
    };

    return {
      ...voucher,
      description: buildVoucherDescription(voucher),
    };
  });
}

async function main() {
  const voucherSeeds = buildVoucherSeeds(50);

  await prisma.voucher.deleteMany();
  await prisma.voucher.createMany({
    data: voucherSeeds,
  });

  console.log(`Seeded ${voucherSeeds.length} vouchers.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
