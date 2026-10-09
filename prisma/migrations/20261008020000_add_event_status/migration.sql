-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('published', 'draft');

-- Existing events are already public; preserve that behavior while allowing new drafts.
ALTER TABLE "event" ADD COLUMN "status" "event_status" NOT NULL DEFAULT 'published';
