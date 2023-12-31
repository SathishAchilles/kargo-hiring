import Link from "next/link";
import type { PendingRow } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const STEPS = [
  { status: "extracting", label: "Read" },
  { status: "preparing", label: "Prepare" },
  { status: "evidence", label: "Extract facts" },
  { status: "scoring", label: "Score" },
] as const;

const WORKING = new Set<string>(["uploaded", ...STEPS.map((step) => step.status)]);

function Stepper({ status }: { status: string }) {
  const current = STEPS.findIndex((step) => step.status === status);
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {STEPS.map((step, index) => {
        const state = current === -1 ? "todo" : index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={step.status} className="flex items-center gap-1">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-6 rounded-full",
                state === "done" && "bg-foreground",
                state === "active" && "animate-pulse bg-foreground/60 motion-reduce:animate-none",
                state === "todo" && "bg-muted",
              )}
            />
            <span className={cn("hidden text-xs sm:inline", state === "todo" ? "text-muted-foreground" : "text-foreground")}>
              {step.label}
              <span className="sr-only">{state === "done" ? " (done)" : state === "active" ? " (in progress)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// "Not ranked yet": CVs still being processed, failed, or needing OCR. The live region
// announces progress to screen readers without moving focus.
export function ProcessingList({ pending }: { pending: PendingRow[] }) {
  const working = pending.filter((row) => WORKING.has(row.status)).length;
  return (
    <section className="mt-8" aria-label="Not ranked yet">
      <p role="status" className="sr-only">
        {working > 0 ? `${working} ${working === 1 ? "CV is" : "CVs are"} being processed` : ""}
      </p>
      {pending.length > 0 && (
        <>
          <h2 className="text-sm font-medium">Not ranked yet</h2>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <Link href={`/candidates/${row.id}`} className="break-all hover:underline">
                  {row.fileName}
                </Link>
                {row.status === "failed" ? (
                  <span className="text-xs text-destructive">failed: {row.reason ?? "unknown"}</span>
                ) : row.status === "needs_ocr" ? (
                  <span className="text-xs text-muted-foreground">needs OCR: no text layer found</span>
                ) : (
                  <Stepper status={row.status} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
