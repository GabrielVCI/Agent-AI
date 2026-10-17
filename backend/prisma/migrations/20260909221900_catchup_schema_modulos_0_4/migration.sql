-- ============================================================================
-- Puesta al día del historial de migraciones (fase QA, 2026-09-09)
--
-- Entre junio y septiembre de 2026 el esquema creció con `prisma db push` +
-- los scripts manuales de prisma/sql/. El historial de migraciones quedó
-- congelado en 20260610162201_saas_multiempresa y ya no podía reconstruir la
-- base desde cero, lo que impedía crear bases de prueba y CI reproducibles.
--
-- Este archivo es el diff EXACTO entre ese historial y schema.prisma, generado
-- con:  prisma migrate diff --from-migrations prisma/migrations
--                          --to-schema=prisma/schema.prisma --script
--
-- Contenido: 21 CREATE TABLE, 40 CREATE TYPE, 89 índices, 44 ALTER TABLE.
-- NO contiene DROP TABLE, DROP COLUMN, TRUNCATE ni DELETE.
--
-- IMPORTANTE — bases que YA tienen este esquema (dev, y producción cuando se
-- despliegue): NO ejecutar este SQL. Registrarlo como ya aplicado con
--     prisma migrate resolve --applied 20260909221900_catchup_schema_modulos_0_4
-- Eso solo inserta una fila en _prisma_migrations; no toca ninguna tabla.
--
-- Bases NUEVAS y vacías (test, CI, staging): `prisma migrate deploy` aplica
-- las 3 migraciones previas + esta y produce el esquema completo.
-- ============================================================================

-- CreateEnum
CREATE TYPE "TenantLifecycleStatus" AS ENUM ('REGISTERED', 'EMAIL_PENDING', 'EMAIL_VERIFIED', 'IMPLEMENTATION_PENDING', 'IMPLEMENTATION_IN_PROGRESS', 'IMPLEMENTATION_COMPLETED', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('WHATSAPP', 'VOICE');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('MANUAL', 'LEMONSQUEEZY', 'FREE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppointmentConfirmation" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AppointmentPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('AI', 'MANUAL', 'WHATSAPP', 'ADMIN');

-- CreateEnum
CREATE TYPE "CatalogItemType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('META_CLOUD', 'TWILIO', 'DIALOG360', 'INFOBIP', 'EIGHTX8', 'SENDWARY_DEMO', 'OTHER');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionMode" AS ENUM ('EASY_ONBOARDING', 'MANUAL_CLOUD_API', 'DEMO_SANDBOX');

-- CreateEnum
CREATE TYPE "WhatsAppNumberReadiness" AS ENUM ('UNKNOWN', 'PERSONAL_WHATSAPP', 'WHATSAPP_BUSINESS_APP', 'CLOUD_API_READY', 'BSP_CONNECTED', 'NEW_NUMBER_RECOMMENDED', 'NEEDS_MIGRATION', 'NEEDS_ASSISTED_SETUP', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppReadinessStage" AS ENUM ('PENDING', 'IN_REVIEW', 'READY_TO_CONNECT', 'CONNECTED', 'REQUIRES_CUSTOMER_ACTION');

-- CreateEnum
CREATE TYPE "WhatsAppIntegrationStatus" AS ENUM ('DRAFT', 'CONNECTING', 'CONNECTED', 'REQUIRES_ACTION', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerStage" AS ENUM ('CONTACT', 'CLIENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('WHATSAPP', 'MANUAL', 'APPOINTMENT', 'IMPORT', 'VOICE', 'API');

-- CreateEnum
CREATE TYPE "CustomerRiskStatus" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CustomerCategoryType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "CustomerCategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerCategoryAssignmentSource" AS ENUM ('MANUAL', 'AUTOMATION', 'SYSTEM', 'IMPORT', 'API');

-- CreateEnum
CREATE TYPE "AppointmentLineKind" AS ENUM ('SERVICE', 'PRODUCT_SOLD', 'PRODUCT_USED');

-- CreateEnum
CREATE TYPE "AppointmentLineStatus" AS ENUM ('PLANNED', 'PERFORMED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RecurrenceUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateEnum
CREATE TYPE "SupportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupportSource" AS ENUM ('USER', 'SYSTEM', 'AI', 'ADMIN');

-- CreateEnum
CREATE TYPE "SupportActorType" AS ENUM ('AI', 'USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AutomationEventType" AS ENUM ('APPOINTMENT_CREATED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_NO_SHOW', 'CUSTOMER_CREATED', 'CUSTOMER_VISITED', 'SERVICE_USED', 'PRODUCT_PURCHASED', 'CUSTOMER_BIRTHDAY', 'MAINTENANCE_DUE', 'CUSTOMER_INACTIVE_15_DAYS', 'CUSTOMER_INACTIVE_30_DAYS', 'CUSTOMER_INACTIVE_60_DAYS', 'CUSTOMER_INACTIVE_90_DAYS', 'CUSTOMER_CHURN_RISK', 'CUSTOMER_BECAME_VIP', 'CUSTOMER_CATEGORY_ASSIGNED', 'CUSTOMER_CATEGORY_REMOVED');

-- CreateEnum
CREATE TYPE "AutomationEntityType" AS ENUM ('CUSTOMER', 'APPOINTMENT', 'CONVERSATION', 'QUOTE', 'PRODUCT', 'TENANT');

-- CreateEnum
CREATE TYPE "AutomationRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRY_PENDING');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'RETRY_SCHEDULED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('SEND_WHATSAPP_MESSAGE', 'SEND_EMAIL', 'CREATE_INTERNAL_NOTIFICATION', 'UPDATE_CUSTOMER_TAG', 'ASSIGN_CUSTOMER_CATEGORY', 'REMOVE_CUSTOMER_CATEGORY');

-- CreateEnum
CREATE TYPE "AutomationScheduleStrategy" AS ENUM ('IMMEDIATE', 'DELAY', 'RELATIVE_TO_FIELD', 'DAILY_AT_LOCAL_TIME');

-- CreateEnum
CREATE TYPE "ScheduledMessageStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduledMessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationType" ADD VALUE 'EXCEL';
ALTER TYPE "IntegrationType" ADD VALUE 'GOOGLE_SHEETS';

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "allowVoiceCalls" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "elevenLabsAgentId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "channel" "ConversationChannel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "lastOutboundAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "clientSince" TIMESTAMP(3),
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "firstVisitAt" TIMESTAMP(3),
ADD COLUMN     "isVip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "lastVisitAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phoneCountry" TEXT,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "riskStatus" "CustomerRiskStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "source" "CustomerSource" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "stage" "CustomerStage" NOT NULL DEFAULT 'CONTACT',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vipSince" TIMESTAMP(3),
ADD COLUMN     "visitCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "code" TEXT,
ADD COLUMN     "estimatedMessagesMin" INTEGER,
ADD COLUMN     "featuresJson" JSONB,
ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lemonSqueezyProductId" TEXT,
ADD COLUMN     "lemonSqueezyVariantId" TEXT,
ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "monthlyMessageLimit" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "monthlyTokenLimit" INTEGER,
ADD COLUMN     "setupFee" DECIMAL(10,2),
ADD COLUMN     "setupFeeLabel" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "itemType" "CatalogItemType" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceInterval" INTEGER,
ADD COLUMN     "recurrenceUnit" "RecurrenceUnit",
ADD COLUMN     "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
ALTER COLUMN "sku" DROP NOT NULL,
ALTER COLUMN "unit" SET DEFAULT 'unidad',
ALTER COLUMN "stock" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingMode" "BillingMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "customMaxAgents" INTEGER,
ADD COLUMN     "customMaxUsers" INTEGER,
ADD COLUMN     "customMaxWhatsappNumbers" INTEGER,
ADD COLUMN     "customMonthlyMessageLimit" INTEGER,
ADD COLUMN     "customMonthlyPrice" DECIMAL(10,2),
ADD COLUMN     "customMonthlyTokenLimit" INTEGER,
ADD COLUMN     "customPlanName" TEXT,
ADD COLUMN     "customSetupFee" DECIMAL(10,2),
ADD COLUMN     "customVoiceMinutesLimit" INTEGER,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "lemonSqueezyCustomerId" TEXT,
ADD COLUMN     "lemonSqueezyOrderId" TEXT,
ADD COLUMN     "lemonSqueezyProductId" TEXT,
ADD COLUMN     "lemonSqueezySubscriptionId" TEXT,
ADD COLUMN     "lemonSqueezyVariantId" TEXT,
ADD COLUMN     "metadataJson" JSONB,
ADD COLUMN     "nextBillingDate" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "renewsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "appointmentSettings" JSONB,
ADD COLUMN     "createdByAdminId" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "finalActivationDate" TIMESTAMP(3),
ADD COLUMN     "firstMonthEndsAt" TIMESTAMP(3),
ADD COLUMN     "implementationExpectedEndAt" TIMESTAMP(3),
ADD COLUMN     "implementationFeePaidAt" TIMESTAMP(3),
ADD COLUMN     "implementationStartedAt" TIMESTAMP(3),
ADD COLUMN     "internalImplementationNotes" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "lifecycleStatus" "TenantLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "onboarding" JSONB,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "paywallBypassReason" TEXT,
ADD COLUMN     "paywallBypassUntil" TIMESTAMP(3),
ADD COLUMN     "trainingConfig" JSONB,
ADD COLUMN     "voiceSettings" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "emailVerificationSentAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "lastName" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UnmatchedBillingWebhook" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'LEMONSQUEEZY',
    "eventName" TEXT NOT NULL,
    "lemonSqueezySubscriptionId" TEXT,
    "customerEmail" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "UnmatchedBillingWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "CustomerCategoryType" NOT NULL DEFAULT 'MANUAL',
    "status" "CustomerCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "color" TEXT NOT NULL DEFAULT 'purple',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCategoryAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "source" "CustomerCategoryAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "reason" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT,

    CONSTRAINT "CustomerCategoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "serviceOrProduct" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "notes" TEXT,
    "source" "AppointmentSource" NOT NULL DEFAULT 'MANUAL',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "confirmationStatus" "AppointmentConfirmation" NOT NULL DEFAULT 'UNCONFIRMED',
    "priority" "AppointmentPriority" NOT NULL DEFAULT 'NORMAL',
    "reminderConfig" JSONB,
    "lastReminderAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rescheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT,
    "kind" "AppointmentLineKind" NOT NULL DEFAULT 'SERVICE',
    "status" "AppointmentLineStatus" NOT NULL DEFAULT 'PLANNED',
    "productId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalSnapshot" DECIMAL(12,2) NOT NULL,
    "performedAt" TIMESTAMP(3),
    "nextRecommendedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationLabel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationLabelAssignment" (
    "conversationId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationLabelAssignment_pkey" PRIMARY KEY ("conversationId","labelId")
);

-- CreateTable
CREATE TABLE "WhatsAppIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META_CLOUD',
    "mode" "WhatsAppConnectionMode" NOT NULL DEFAULT 'MANUAL_CLOUD_API',
    "status" "WhatsAppIntegrationStatus" NOT NULL DEFAULT 'DRAFT',
    "businessName" TEXT,
    "businessAccountId" TEXT,
    "wabaId" TEXT,
    "businessId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneNumber" TEXT,
    "graphApiVersion" TEXT NOT NULL DEFAULT 'v20.0',
    "verifyToken" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "tokenLastFour" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "webhookUrl" TEXT,
    "webhookVerifiedAt" TIMESTAMP(3),
    "lastValidationAt" TIMESTAMP(3),
    "lastValidationError" TEXT,
    "embeddedSignupCompletedAt" TIMESTAMP(3),
    "webhookSubscribedAt" TIMESTAMP(3),
    "lastHealthStatus" TEXT,
    "numberReadiness" "WhatsAppNumberReadiness" NOT NULL DEFAULT 'UNKNOWN',
    "readinessStage" "WhatsAppReadinessStage",
    "declaredNumberType" TEXT,
    "declaredPhoneNumber" TEXT,
    "currentProvider" TEXT,
    "readinessRecommendation" TEXT,
    "readinessNotes" TEXT,
    "readinessUpdatedAt" TIMESTAMP(3),
    "assistedSetupRequestedAt" TIMESTAMP(3),
    "assistedSetupRequestedByUserId" TEXT,
    "assistedSetupStartedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "demoMessagesUsed" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceUsageCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "usedSeconds" INTEGER NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "conversationId" TEXT,
    "elevenLabsConversationId" TEXT,
    "elevenLabsCallId" TEXT,
    "direction" "CallDirection" NOT NULL DEFAULT 'INBOUND',
    "status" "CallStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "customerPhone" TEXT,
    "summary" TEXT,
    "transcript" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "inboundMessages" INTEGER NOT NULL DEFAULT 0,
    "outboundMessages" INTEGER NOT NULL DEFAULT 0,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiTotalTokens" INTEGER NOT NULL DEFAULT 0,
    "audioTranscriptionSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "createdByUserId" TEXT,
    "assignedToAdminId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "tier" "SupportTier" NOT NULL DEFAULT 'TIER_2',
    "severity" "SupportSeverity" NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT,
    "source" "SupportSource" NOT NULL DEFAULT 'USER',
    "aiSummary" TEXT,
    "detectedIssue" TEXT,
    "recommendedAction" TEXT,
    "resolution" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAuditLog" (
    "id" TEXT NOT NULL,
    "supportTicketId" TEXT,
    "actorType" "SupportActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAuditLog_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "UnmatchedBillingWebhook_createdAt_idx" ON "UnmatchedBillingWebhook"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerCategory_tenantId_status_idx" ON "CustomerCategory"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomerCategory_tenantId_type_idx" ON "CustomerCategory"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCategory_tenantId_slug_key" ON "CustomerCategory"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCategory_tenantId_systemKey_key" ON "CustomerCategory"("tenantId", "systemKey");

-- CreateIndex
CREATE INDEX "CustomerCategoryAssignment_tenantId_categoryId_idx" ON "CustomerCategoryAssignment"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "CustomerCategoryAssignment_tenantId_customerId_idx" ON "CustomerCategoryAssignment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerCategoryAssignment_categoryId_idx" ON "CustomerCategoryAssignment"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCategoryAssignment_customerId_categoryId_key" ON "CustomerCategoryAssignment"("customerId", "categoryId");

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_name_key" ON "Category"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_idx" ON "Appointment"("tenantId");

-- CreateIndex
CREATE INDEX "Appointment_scheduledAt_idx" ON "Appointment"("scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_customerPhone_idx" ON "Appointment"("customerPhone");

-- CreateIndex
CREATE INDEX "Appointment_conversationId_idx" ON "Appointment"("conversationId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_customerId_status_idx" ON "Appointment"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_customerId_completedAt_idx" ON "Appointment"("tenantId", "customerId", "completedAt");

-- CreateIndex
CREATE INDEX "AppointmentLine_tenantId_appointmentId_idx" ON "AppointmentLine"("tenantId", "appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentLine_tenantId_customerId_performedAt_idx" ON "AppointmentLine"("tenantId", "customerId", "performedAt");

-- CreateIndex
CREATE INDEX "AppointmentLine_tenantId_productId_performedAt_idx" ON "AppointmentLine"("tenantId", "productId", "performedAt");

-- CreateIndex
CREATE INDEX "AppointmentLine_appointmentId_idx" ON "AppointmentLine"("appointmentId");

-- CreateIndex
CREATE INDEX "ConversationLabel_tenantId_idx" ON "ConversationLabel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationLabel_tenantId_name_key" ON "ConversationLabel"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ConversationLabelAssignment_labelId_idx" ON "ConversationLabelAssignment"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppIntegration_phoneNumberId_key" ON "WhatsAppIntegration"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppIntegration_verifyToken_key" ON "WhatsAppIntegration"("verifyToken");

-- CreateIndex
CREATE INDEX "WhatsAppIntegration_tenantId_idx" ON "WhatsAppIntegration"("tenantId");

-- CreateIndex
CREATE INDEX "WhatsAppIntegration_status_idx" ON "WhatsAppIntegration"("status");

-- CreateIndex
CREATE INDEX "WhatsAppIntegration_mode_idx" ON "WhatsAppIntegration"("mode");

-- CreateIndex
CREATE INDEX "WhatsAppIntegration_assistedSetupRequestedAt_idx" ON "WhatsAppIntegration"("assistedSetupRequestedAt");

-- CreateIndex
CREATE INDEX "WhatsAppIntegration_numberReadiness_idx" ON "WhatsAppIntegration"("numberReadiness");

-- CreateIndex
CREATE INDEX "WhatsAppIntegration_readinessStage_idx" ON "WhatsAppIntegration"("readinessStage");

-- CreateIndex
CREATE INDEX "VoiceUsageCounter_tenantId_idx" ON "VoiceUsageCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceUsageCounter_tenantId_periodStart_key" ON "VoiceUsageCounter"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_elevenLabsCallId_key" ON "CallLog"("elevenLabsCallId");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_idx" ON "CallLog"("tenantId");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_startedAt_idx" ON "CallLog"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "CallLog_agentId_idx" ON "CallLog"("agentId");

-- CreateIndex
CREATE INDEX "UsageCounter_tenantId_idx" ON "UsageCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_tenantId_periodStart_key" ON "UsageCounter"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_tier_idx" ON "SupportTicket"("tier");

-- CreateIndex
CREATE INDEX "SupportTicket_severity_idx" ON "SupportTicket"("severity");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "SupportAuditLog_supportTicketId_idx" ON "SupportAuditLog"("supportTicketId");

-- CreateIndex
CREATE INDEX "SupportAuditLog_createdAt_idx" ON "SupportAuditLog"("createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "Agent_elevenLabsAgentId_key" ON "Agent"("elevenLabsAgentId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_stage_idx" ON "Customer"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "Customer_tenantId_lastVisitAt_idx" ON "Customer"("tenantId", "lastVisitAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_createdAt_idx" ON "Customer"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_isVip_idx" ON "Customer"("tenantId", "isVip");

-- CreateIndex
CREATE INDEX "Customer_tenantId_riskStatus_idx" ON "Customer"("tenantId", "riskStatus");

-- CreateIndex
CREATE INDEX "Customer_tenantId_email_idx" ON "Customer"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Customer_tenantId_lastName_idx" ON "Customer"("tenantId", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phoneNormalized_key" ON "Customer"("tenantId", "phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_lemonSqueezySubscriptionId_key" ON "Subscription"("lemonSqueezySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCategory" ADD CONSTRAINT "CustomerCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCategoryAssignment" ADD CONSTRAINT "CustomerCategoryAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCategoryAssignment" ADD CONSTRAINT "CustomerCategoryAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCategoryAssignment" ADD CONSTRAINT "CustomerCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CustomerCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLabelAssignment" ADD CONSTRAINT "ConversationLabelAssignment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLabelAssignment" ADD CONSTRAINT "ConversationLabelAssignment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "ConversationLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppIntegration" ADD CONSTRAINT "WhatsAppIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceUsageCounter" ADD CONSTRAINT "VoiceUsageCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAuditLog" ADD CONSTRAINT "SupportAuditLog_supportTicketId_fkey" FOREIGN KEY ("supportTicketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

