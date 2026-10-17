
-- CreateEnum
CREATE TYPE "AutomationEventType" AS ENUM ('APPOINTMENT_CREATED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_NO_SHOW', 'CUSTOMER_CREATED', 'CUSTOMER_VISITED', 'SERVICE_USED', 'PRODUCT_PURCHASED', 'CUSTOMER_BIRTHDAY', 'MAINTENANCE_DUE', 'CUSTOMER_INACTIVE_15_DAYS', 'CUSTOMER_INACTIVE_30_DAYS', 'CUSTOMER_INACTIVE_60_DAYS', 'CUSTOMER_INACTIVE_90_DAYS', 'CUSTOMER_CHURN_RISK', 'CUSTOMER_BECAME_VIP');

-- CreateEnum
CREATE TYPE "AutomationEntityType" AS ENUM ('CUSTOMER', 'APPOINTMENT', 'CONVERSATION', 'QUOTE', 'PRODUCT', 'TENANT');

-- CreateEnum
CREATE TYPE "AutomationRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRY_PENDING');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'RETRY_SCHEDULED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('SEND_WHATSAPP_MESSAGE', 'SEND_EMAIL', 'CREATE_INTERNAL_NOTIFICATION', 'UPDATE_CUSTOMER_TAG');

-- CreateEnum
CREATE TYPE "AutomationScheduleStrategy" AS ENUM ('IMMEDIATE', 'DELAY', 'RELATIVE_TO_FIELD', 'DAILY_AT_LOCAL_TIME');

-- CreateEnum
CREATE TYPE "ScheduledMessageStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduledMessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateTable
CREATE TABLE "AutomationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "AutomationEventType" NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" "AutomationEntityType",
    "entityId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" JSONB,
    "correlationId" TEXT,
    "causationId" TEXT,
    "idempotencyKey" TEXT,
    "matchedRules" INTEGER NOT NULL DEFAULT 0,
    "createdJobs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "AutomationEventType" NOT NULL,
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditionsJson" JSONB,
    "actionType" "AutomationActionType" NOT NULL,
    "actionConfigJson" JSONB,
    "scheduleStrategy" "AutomationScheduleStrategy" NOT NULL DEFAULT 'DELAY',
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "scheduleConfigJson" JSONB,
    "cancelOnEventTypes" "AutomationEventType"[] DEFAULT ARRAY[]::"AutomationEventType"[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER,
    "templateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationRuleId" TEXT NOT NULL,
    "eventType" "AutomationEventType" NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT,
    "actionType" "AutomationActionType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "cancelReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payloadJson" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "AutomationExecutionStatus" NOT NULL,
    "resultSummary" TEXT,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationJobId" TEXT,
    "customerId" TEXT,
    "conversationId" TEXT,
    "agentId" TEXT,
    "channel" "ScheduledMessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "templateKey" TEXT,
    "destination" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledMessageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationEvent_tenantId_type_occurredAt_idx" ON "AutomationEvent"("tenantId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "AutomationEvent_tenantId_entityType_entityId_idx" ON "AutomationEvent"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AutomationEvent_correlationId_idx" ON "AutomationEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEvent_tenantId_idempotencyKey_key" ON "AutomationEvent"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_status_idx" ON "AutomationRule"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_eventType_status_idx" ON "AutomationRule"("tenantId", "eventType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRule_tenantId_templateKey_key" ON "AutomationRule"("tenantId", "templateKey");

-- CreateIndex
CREATE INDEX "AutomationJob_status_scheduledFor_idx" ON "AutomationJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AutomationJob_tenantId_status_scheduledFor_idx" ON "AutomationJob"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AutomationJob_tenantId_entityType_entityId_status_idx" ON "AutomationJob"("tenantId", "entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "AutomationJob_tenantId_customerId_status_idx" ON "AutomationJob"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "AutomationJob_automationRuleId_idx" ON "AutomationJob"("automationRuleId");

-- CreateIndex
CREATE INDEX "AutomationJob_lockedAt_idx" ON "AutomationJob"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_tenantId_idempotencyKey_key" ON "AutomationJob"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AutomationExecution_tenantId_createdAt_idx" ON "AutomationExecution"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_jobId_idx" ON "AutomationExecution"("jobId");

-- CreateIndex
CREATE INDEX "AutomationExecution_ruleId_idx" ON "AutomationExecution"("ruleId");

-- CreateIndex
CREATE INDEX "AutomationExecution_tenantId_status_idx" ON "AutomationExecution"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ScheduledMessage_tenantId_status_scheduledFor_idx" ON "ScheduledMessage"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledMessage_tenantId_customerId_idx" ON "ScheduledMessage"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_automationJobId_idx" ON "ScheduledMessage"("automationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledMessage_tenantId_dedupeKey_key" ON "ScheduledMessage"("tenantId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "AutomationEvent" ADD CONSTRAINT "AutomationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

