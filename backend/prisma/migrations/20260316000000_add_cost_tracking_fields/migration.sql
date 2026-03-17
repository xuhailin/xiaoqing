-- AlterTable: DevSession 增加预算与累计成本字段
ALTER TABLE "DevSession" ADD COLUMN "budgetUsd" DOUBLE PRECISION;
ALTER TABLE "DevSession" ADD COLUMN "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: DevRun 增加单次成本字段
ALTER TABLE "DevRun" ADD COLUMN "costUsd" DOUBLE PRECISION;
