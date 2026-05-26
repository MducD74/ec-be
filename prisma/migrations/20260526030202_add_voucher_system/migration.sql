-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "voucherId" INTEGER;

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDiscountValue" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "partnerId" TEXT,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "Order_voucherId_idx" ON "Order"("voucherId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
