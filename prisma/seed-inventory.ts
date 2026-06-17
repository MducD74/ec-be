import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const MIN_STOCK = 50;
const MAX_STOCK = 500;
const SERIAL_BATCH_SIZE = 1_000;

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildSerialNumber(productId: number, sequence: number) {
  const suffix = randomInteger(100_000, 999_999);

  return `INV-SEED-${productId}-${String(sequence).padStart(5, "0")}-${suffix}`;
}

async function seedInventory() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  if (products.length === 0) {
    throw new Error("No products found. Run the main product seed before seed:inventory.");
  }

  let createdCount = 0;

  for (const productItem of products) {
    const targetStock = randomInteger(MIN_STOCK, MAX_STOCK);
    const existingStock = await prisma.inventory.count({
      where: {
        productId: productItem.id,
      },
    });
    const missingStock = Math.max(targetStock - existingStock, 0);

    if (missingStock === 0) {
      console.log(
        `Product ${productItem.id} - ${productItem.name}: already has ${existingStock} inventory rows.`,
      );
      continue;
    }

    for (let offset = 0; offset < missingStock; offset += SERIAL_BATCH_SIZE) {
      const batchSize = Math.min(SERIAL_BATCH_SIZE, missingStock - offset);
      const inventoryRows = Array.from({ length: batchSize }, (_, batchIndex) => ({
        productId: productItem.id,
        serialNumber: buildSerialNumber(productItem.id, existingStock + offset + batchIndex + 1),
        status: "AVAILABLE" as const,
      }));

      const result = await prisma.inventory.createMany({
        data: inventoryRows,
        skipDuplicates: true,
      });

      createdCount += result.count;
    }

    console.log(
      `Product ${productItem.id} - ${productItem.name}: added ${missingStock} inventory rows, target ${targetStock}.`,
    );
  }

  console.log(`Seeded ${createdCount} inventory rows for ${products.length} products.`);
}

seedInventory()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
