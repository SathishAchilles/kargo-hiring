CREATE TABLE "kargo_hiring"."decisions" (
	"candidate_id" uuid NOT NULL,
	"role" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_candidate_id_role_pk" PRIMARY KEY("candidate_id","role")
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."decisions" ADD CONSTRAINT "decisions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;