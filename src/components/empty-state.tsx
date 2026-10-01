import { FileSearch, ListOrdered, UploadCloud } from "lucide-react";
import { UploadDialog } from "@/components/upload-dialog";

const STEPS = [
  { icon: UploadCloud, title: "Upload CVs", text: "Choose the role they applied for and drop in PDF or DOCX files." },
  { icon: FileSearch, title: "We read and score them", text: "Each CV is scored against both job descriptions. Personal details never reach the AI." },
  { icon: ListOrdered, title: "Review the ranking", text: "See why each score was given, check the flags, then draft the email." },
] as const;

// Shown when there are no candidates at all, so a fresh database still tells you what to do.
export function EmptyState() {
  return (
    <section
      aria-label="Get started"
      className="anim-fade-up mt-8 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center shadow-xs"
    >
      <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary">
        <UploadCloud className="size-7" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">No candidates yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Upload a few CVs to see them ranked for the Product Manager and Senior Product Manager roles.
      </p>
      <div className="mt-5">
        <UploadDialog variant="hero" />
      </div>
      <ol className="mx-auto mt-10 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-xl border bg-card p-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground tabular-nums">
                {index + 1}
              </span>
              {step.title}
            </span>
            <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="mx-auto mt-6 max-w-md text-xs text-muted-foreground">
        CVs written some time ago? Set “CV written as of” when you upload, so roles ending “Present” are dated correctly.
      </p>
    </section>
  );
}
