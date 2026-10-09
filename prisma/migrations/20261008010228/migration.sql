-- DropIndex
DROP INDEX "account_role_idx";

-- DropIndex
DROP INDEX "media_business_id_idx";

-- CreateIndex
CREATE INDEX "business_city_business_id_is_headquarter_idx" ON "business_city"("business_id", "is_headquarter");
