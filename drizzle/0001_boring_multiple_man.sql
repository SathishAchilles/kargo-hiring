CREATE TABLE "kargo_hiring"."cv_files" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kargo_hiring"."cv_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kargo_hiring"."cv_files" ADD CONSTRAINT "cv_files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "kargo_hiring"."candidates"("id") ON DELETE cascade ON UPDATE no action;