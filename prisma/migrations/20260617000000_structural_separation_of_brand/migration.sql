CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

ALTER TABLE "Product" ADD COLUMN "brandId" INTEGER;

INSERT INTO "Brand" ("name")
SELECT DISTINCT btrim("brand")
FROM "Product"
WHERE "brand" IS NOT NULL
  AND btrim("brand") <> ''
ON CONFLICT ("name") DO NOTHING;

UPDATE "Product"
SET "brandId" = "Brand"."id"
FROM "Brand"
WHERE "Product"."brand" IS NOT NULL
  AND btrim("Product"."brand") = "Brand"."name";

CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" DROP COLUMN "brand";
