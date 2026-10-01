CREATE SCHEMA "kargo_hiring";
--> statement-breakpoint
CREATE TABLE "kargo_hiring"."candidate_pii" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_tokens" text[] NOT NULL,
	"emails" text[] NOT NULL,
	"phones" text[] NOT NULL,
	"links" text[] NOT NULL,
	"location_text" text
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."candidate_pii" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kargo_hiring"."candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applied_role" text NOT NULL,
	"as_of_date" date NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"status_reason" text,
	"file_sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"file_mime" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_file_sha256_unique" UNIQUE("file_sha256")
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kargo_hiring"."cv_texts" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"raw_text" text NOT NULL,
	"redacted_text" text,
	"redaction_version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."cv_texts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kargo_hiring"."drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"brief" jsonb NOT NULL,
	"status" text DEFAULT 'drafted' NOT NULL,
	"edited_by_founder" boolean DEFAULT false NOT NULL,
	"scores_changed" boolean DEFAULT false NOT NULL,
	"sending_since" timestamp with time zone,
	"resend_message_id" text,
	"sent_to" text,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kargo_hiring"."evidence" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"record" jsonb NOT NULL,
	"prompt_version" integer NOT NULL,
	"input_hash" text NOT NULL,
	"dropped_fact_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kargo_hiring"."flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"type" text NOT NULL,
	"detail" jsonb NOT NULL,
	"related_candidate_id" uuid
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kargo_hiring"."scores" (
	"candidate_id" uuid NOT NULL,
	"role" text NOT NULL,
	"sub_scores" jsonb NOT NULL,
	"total" integer NOT NULL,
	"tier" text NOT NULL,
	"product_years" double precision NOT NULL,
	"total_years" double precision NOT NULL,
	"suggested_role" text NOT NULL,
	"suggest_other" boolean NOT NULL,
	"tie_key" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_candidate_id_role_pk" PRIMARY KEY("candidate_id","role")
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."candidate_pii" ADD CONSTRAINT "candidate_pii_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."cv_texts" ADD CONSTRAINT "cv_texts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."drafts" ADD CONSTRAINT "drafts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."evidence" ADD CONSTRAINT "evidence_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."flags" ADD CONSTRAINT "flags_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."flags" ADD CONSTRAINT "flags_related_candidate_id_candidates_id_fk" FOREIGN KEY ("related_candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."scores" ADD CONSTRAINT "scores_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;