import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function stringifySearchValue(value: unknown) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function containsAnyKeyword(searchText: string, keywords: string[]) {
  return keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
}

function getFallbackBrand(productName: string) {
  const [firstWord] = productName.trim().split(/\s+/);
  const normalizedBrand = firstWord?.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  return normalizedBrand || "Generic";
}

function detectBrand(product: { name: string; specifications: unknown }) {
  const searchText = [product.name, stringifySearchValue(product.specifications)]
    .join(" ")
    .toLowerCase();

  if (containsAnyKeyword(searchText, ["Apple", "iPhone", "MacBook", "iPad"])) {
    return "Apple";
  }

  if (containsAnyKeyword(searchText, ["Samsung", "Galaxy"])) {
    return "Samsung";
  }

  if (containsAnyKeyword(searchText, ["Corsair"])) {
    return "Corsair";
  }

  return getFallbackBrand(product.name);
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      specifications: true,
    },
  });

  for (const productItem of products) {
    const brand = detectBrand(productItem);

    await prisma.product.update({
      where: {
        id: productItem.id,
      },
      data: {
        brand,
      },
    });

    console.log(`${productItem.id} - ${productItem.name}: ${brand}`);
  }

  console.log(`Updated ${products.length} product brands.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
