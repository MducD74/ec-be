import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

interface PriceRange {
  label: string;
  min: number;
  max: number;
  step: number;
}

const priceRanges = {
  accessory: {
    label: "Phụ kiện",
    min: 50_000,
    max: 450_000,
    step: 10_000,
  },
  peripheral: {
    label: "Linh kiện/Thiết bị ngoại vi",
    min: 250_000,
    max: 3_500_000,
    step: 50_000,
  },
  mobile: {
    label: "Điện thoại/Máy tính bảng",
    min: 4_500_000,
    max: 38_000_000,
    step: 100_000,
  },
  computer: {
    label: "Máy tính/Laptop",
    min: 12_000_000,
    max: 68_000_000,
    step: 500_000,
  },
} satisfies Record<string, PriceRange>;

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function hasAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(normalizeSearchText(keyword)));
}

function randomRoundedValue(min: number, max: number, step: number) {
  const minStep = Math.ceil(min / step);
  const maxStep = Math.floor(max / step);

  return (Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep) * step;
}

function pickPriceRange(searchText: string): PriceRange {
  if (
    hasAnyKeyword(searchText, [
      "iPhone",
      "iPad",
      "Samsung",
      "Xiaomi",
      "OPPO",
      "điện thoại",
      "dien thoai",
      "máy tính bảng",
      "may tinh bang",
      "Galaxy Tab",
    ])
  ) {
    return priceRanges.mobile;
  }

  if (
    hasAnyKeyword(searchText, [
      "bàn phím",
      "ban phim",
      "chuột",
      "chuot",
      "tai nghe",
      "loa",
      "soundbar",
      "màn hình",
      "man hinh",
      "linh kiện",
      "linh kien",
      "thiết bị ngoại vi",
      "thiet bi ngoai vi",
    ])
  ) {
    return priceRanges.peripheral;
  }

  if (
    hasAnyKeyword(searchText, [
      "MacBook",
      "Asus",
      "Dell",
      "Laptop",
      "Laptop & PC",
    ])
  ) {
    return priceRanges.computer;
  }

  if (
    hasAnyKeyword(searchText, [
      "phụ kiện",
      "phu kien",
      "ốp lưng",
      "op lung",
      "cáp sạc",
      "cap sac",
      "củ sạc",
      "cu sac",
      "bao da",
      "sạc dự phòng",
      "sac du phong",
      "balo",
      "túi chống sốc",
      "tui chong soc",
    ])
  ) {
    return priceRanges.accessory;
  }

  return priceRanges.peripheral;
}

async function main() {
  const products = await prisma.product.findMany({
    include: {
      category: {
        include: {
          parent: true,
        },
      },
    },
  });

  for (const product of products) {
    const searchText = normalizeSearchText(
      [product.name, product.category?.name, product.category?.parent?.name].filter(Boolean).join(" "),
    );
    const priceRange = pickPriceRange(searchText);
    const newPrice = randomRoundedValue(priceRange.min, priceRange.max, priceRange.step);

    await prisma.product.update({
      where: {
        id: product.id,
      },
      data: {
        price: newPrice,
      },
    });

    console.log(`${product.id} - ${product.name}: ${newPrice.toLocaleString("vi-VN")}đ (${priceRange.label})`);
  }

  console.log(`Updated ${products.length} product prices.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
