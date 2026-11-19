-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "OutreachOptOutSource" AS ENUM ('link', 'admin');

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "publishedUrl" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'pending',
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachOptOut" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" "OutreachOptOutSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachMessage_email_idx" ON "OutreachMessage"("email");

-- CreateIndex
CREATE INDEX "OutreachMessage_candidateId_idx" ON "OutreachMessage"("candidateId");

-- CreateIndex
CREATE INDEX "OutreachMessage_createdAt_idx" ON "OutreachMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachOptOut_email_key" ON "OutreachOptOut"("email");

