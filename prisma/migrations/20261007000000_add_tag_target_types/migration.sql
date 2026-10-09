-- CreateEnum
CREATE TYPE "tag_target_type" AS ENUM ('city', 'business', 'event');

-- CreateTable
CREATE TABLE "tag_target" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tag_id" UUID NOT NULL,
    "target_type" "tag_target_type" NOT NULL,

    CONSTRAINT "tag_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_target_tag_id_target_type_key" ON "tag_target"("tag_id", "target_type");
CREATE INDEX "tag_target_target_type_idx" ON "tag_target"("target_type");

-- AddForeignKey
ALTER TABLE "tag_target" ADD CONSTRAINT "tag_target_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
