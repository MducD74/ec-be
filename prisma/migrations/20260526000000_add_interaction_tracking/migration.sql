-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('VIEW', 'ADD_TO_CART', 'PURCHASE');

-- DropIndex
DROP INDEX "UserInteraction_sessionId_idx";

-- DropIndex
DROP INDEX "UserInteraction_type_idx";

-- AlterTable
ALTER TABLE "UserInteraction" ADD COLUMN "actionType" "ActionType";

UPDATE "UserInteraction"
SET "actionType" = CASE "type"::text
  WHEN 'CART' THEN 'ADD_TO_CART'::"ActionType"
  WHEN 'VIEW' THEN 'VIEW'::"ActionType"
  WHEN 'PURCHASE' THEN 'PURCHASE'::"ActionType"
END;

ALTER TABLE "UserInteraction" ALTER COLUMN "actionType" SET NOT NULL;

ALTER TABLE "UserInteraction"
  DROP COLUMN "sessionId",
  DROP COLUMN "score",
  DROP COLUMN "type";

DROP TYPE "InteractionType";

-- CreateIndex
CREATE INDEX "UserInteraction_actionType_idx" ON "UserInteraction"("actionType");
