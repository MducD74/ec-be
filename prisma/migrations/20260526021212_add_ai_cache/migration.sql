-- CreateTable
CREATE TABLE "RecommendationCache" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "recommendedProductIds" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationCache_userId_key" ON "RecommendationCache"("userId");

-- AddForeignKey
ALTER TABLE "RecommendationCache" ADD CONSTRAINT "RecommendationCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
