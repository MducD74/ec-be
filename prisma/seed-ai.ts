import "dotenv/config";
import { faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const TEST_USER_COUNT = 10;
const INTERACTION_COUNT = 650;
const STATIC_PASSWORD = "password123";

function pickActionType() {
  const roll = faker.number.int({ min: 1, max: 100 });

  if (roll <= 70) {
    return "VIEW" as const;
  }

  if (roll <= 90) {
    return "ADD_TO_CART" as const;
  }

  return "PURCHASE" as const;
}

async function seedAiData() {
  faker.seed(20260526);

  const hashedPassword = await bcrypt.hash(STATIC_PASSWORD, 12);

  await prisma.recommendationCache.deleteMany();
  await prisma.userInteraction.deleteMany();

  const testUsers = [];

  for (let index = 1; index <= TEST_USER_COUNT; index += 1) {
    const user = await prisma.user.upsert({
      where: {
        email: `test${index}@gmail.com`,
      },
      update: {
        password: hashedPassword,
        name: `Test User ${index}`,
        role: "USER",
      },
      create: {
        email: `test${index}@gmail.com`,
        password: hashedPassword,
        name: `Test User ${index}`,
        role: "USER",
      },
      select: {
        id: true,
      },
    });

    testUsers.push(user);
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
    },
  });

  if (products.length === 0) {
    throw new Error("No products found. Run the main seed before seed:ai.");
  }

  const interactions = Array.from({ length: INTERACTION_COUNT }, () => {
    const user = faker.helpers.arrayElement(testUsers);
    const product = faker.helpers.arrayElement(products);

    return {
      userId: user.id,
      productId: product.id,
      actionType: pickActionType(),
      createdAt: faker.date.recent({ days: 30 }),
    };
  });

  await prisma.userInteraction.createMany({
    data: interactions,
  });

  console.log(`Seeded ${testUsers.length} AI test users.`);
  console.log(`Seeded ${interactions.length} user interactions.`);
  console.log(`Static password for test users: ${STATIC_PASSWORD}`);
}

seedAiData()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
