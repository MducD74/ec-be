-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" SERIAL NOT NULL,
    "collaborativeWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "contentWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "brandWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);
