import {
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Evidence } from "@/lib/evidence/schema";
import type { Step } from "@/lib/pipeline/runner";
import type {
  Brief,
  CandidateStatus,
  DraftKind,
  DraftStatus,
  FlagType,
  RoleKey,
  SubScore,
  SuggestedRole,
  TieKey,
  Tier,
} from "@/lib/types";

// Everything lives outside `public`, which Supabase exposes through PostgREST.
export const kargo = pgSchema("kargo_hiring");

export const candidates = kargo
  .table("candidates", {
    id: uuid("id").primaryKey().defaultRandom(),
    appliedRole: text("applied_role").$type<RoleKey>().notNull(),
    asOfDate: date("as_of_date").notNull(),
    status: text("status").$type<CandidateStatus>().notNull().default("uploaded"),
    statusReason: text("status_reason"),
    failedStep: text("failed_step").$type<Step>(),
    fileSha256: text("file_sha256").notNull().unique(),
    fileName: text("file_name").notNull(),
    fileMime: text("file_mime").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  })
  .enableRLS();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// The original CV file. Kept in Postgres: the Docker Storage service cannot
// write on macOS volumes (no extended attributes), and CVs are at most 5 MB.
export const cvFiles = kargo
  .table("cv_files", {
    candidateId: uuid("candidate_id")
      .primaryKey()
      .references(() => candidates.id, { onDelete: "cascade" }),
    bytes: bytea("bytes").notNull(),
  })
  .enableRLS();

// The only table that holds personal details. Never read by AI code paths.
export const candidatePii = kargo
  .table("candidate_pii", {
    candidateId: uuid("candidate_id")
      .primaryKey()
      .references(() => candidates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameTokens: text("name_tokens").array().notNull(),
    emails: text("emails").array().notNull(),
    phones: text("phones").array().notNull(),
    links: text("links").array().notNull(),
    locationText: text("location_text"),
  })
  .enableRLS();

export const cvTexts = kargo
  .table("cv_texts", {
    candidateId: uuid("candidate_id")
      .primaryKey()
      .references(() => candidates.id, { onDelete: "cascade" }),
    rawText: text("raw_text").notNull(),
    redactedText: text("redacted_text"),
    redactionVersion: integer("redaction_version").notNull().default(0),
  })
  .enableRLS();

export const evidence = kargo
  .table("evidence", {
    candidateId: uuid("candidate_id")
      .primaryKey()
      .references(() => candidates.id, { onDelete: "cascade" }),
    record: jsonb("record").$type<Evidence>().notNull(),
    promptVersion: integer("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    droppedFactCount: integer("dropped_fact_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  })
  .enableRLS();

export const scores = kargo
  .table(
    "scores",
    {
      candidateId: uuid("candidate_id")
        .notNull()
        .references(() => candidates.id, { onDelete: "cascade" }),
      role: text("role").$type<RoleKey>().notNull(),
      subScores: jsonb("sub_scores").$type<SubScore[]>().notNull(),
      total: integer("total").notNull(),
      tier: text("tier").$type<Tier>().notNull(),
      productYears: doublePrecision("product_years").notNull(),
      totalYears: doublePrecision("total_years").notNull(),
      suggestedRole: text("suggested_role").$type<SuggestedRole>().notNull(),
      suggestOther: boolean("suggest_other").notNull(),
      tieKey: jsonb("tie_key").$type<TieKey>().notNull(),
      computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.candidateId, t.role] })],
  )
  .enableRLS();

export const flags = kargo
  .table("flags", {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    type: text("type").$type<FlagType>().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    relatedCandidateId: uuid("related_candidate_id").references(() => candidates.id, {
      onDelete: "cascade",
    }),
  })
  .enableRLS();

export const drafts = kargo
  .table(
    "drafts",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      candidateId: uuid("candidate_id")
        .notNull()
        .references(() => candidates.id, { onDelete: "cascade" }),
      role: text("role").$type<RoleKey>().notNull(),
      kind: text("kind").$type<DraftKind>().notNull(),
      subject: text("subject").notNull(),
      body: text("body").notNull(),
      brief: jsonb("brief").$type<Brief>().notNull(),
      status: text("status").$type<DraftStatus>().notNull().default("drafted"),
      editedByFounder: boolean("edited_by_founder").notNull().default(false),
      scoresChanged: boolean("scores_changed").notNull().default(false),
      sendingSince: timestamp("sending_since", { withTimezone: true }),
      resendMessageId: text("resend_message_id"),
      sentTo: text("sent_to"),
      sentAt: timestamp("sent_at", { withTimezone: true }),
      error: text("error"),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
  )
  .enableRLS();
