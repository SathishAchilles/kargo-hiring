"use client";

import { CalendarDays, CircleAlert, CircleCheck, CopyCheck, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadCv, type UploadResult } from "@/app/actions/candidates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_FILE_BYTES } from "@/lib/intake/limits";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "pm", title: "Product Manager", hint: "2–4 years · the core platform" },
  { value: "spm", title: "Senior Product Manager", hint: "5–8 years · integrations and data" },
] as const;

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const size = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / 1024 / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
};
const today = () => new Date().toISOString().slice(0, 10);

export function UploadDialog({ variant = "button" }: { variant?: "button" | "hero" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [asOf, setAsOf] = useState("");
  const [results, setResults] = useState<UploadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setFiles([]);
    setResults([]);
    setError(null);
    setDone(false);
    setBusy(false);
  }

  function add(list: FileList | File[]) {
    const incoming = Array.from(list);
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
      return [...current, ...incoming.filter((file) => !seen.has(`${file.name}:${file.size}`))];
    });
    setDone(false);
    setResults([]);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!role) return setError("Select the role these CVs applied for.");
    if (!files.length) return setError("Choose at least one CV file.");
    setError(null);
    setBusy(true);
    const finished: UploadResult[] = [];
    // One request per file so a bad file never blocks the rest.
    for (const file of files) {
      const form = new FormData();
      form.set("role", role);
      form.set("file", file);
      form.set("asOf", asOf);
      try {
        finished.push(await uploadCv(form));
      } catch {
        finished.push({ ok: false, name: file.name, reason: "Upload failed; try again." });
      }
      setResults([...finished]);
    }
    setBusy(false);
    setDone(true);
    router.refresh();
  }

  const accepted = results.filter((r) => r.ok && !r.duplicate).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          variant === "hero" ? (
            <Button size="lg" className="gap-2 shadow-sm" />
          ) : (
            <Button className="gap-1.5 shadow-xs" />
          )
        }
      >
        <UploadCloud className="size-4" aria-hidden />
        Upload CVs
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload CVs</DialogTitle>
          <DialogDescription>PDF or DOCX, up to 5 MB each. Every CV is scored for both roles.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Applied role</legend>
            <div role="radiogroup" aria-label="Applied role" className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((option) => {
                const selected = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(option.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-primary bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {option.title}
                      {selected && <CircleCheck className="size-4 text-primary" aria-hidden />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="text-sm font-medium">CV files</p>
            <label
              htmlFor="files"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                add(event.dataTransfer.files);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
                dragging ? "border-primary bg-accent" : "hover:bg-muted/60",
              )}
            >
              <UploadCloud className={cn("size-7", dragging ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="text-sm font-medium">{dragging ? "Drop to add" : "Drag CVs here, or choose files"}</span>
              <span className="text-xs text-muted-foreground">PDF or DOCX · up to {size(MAX_FILE_BYTES)} each</span>
              <input
                id="files"
                ref={input}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) add(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            {files.length > 0 && !done && (
              <ul className="max-h-40 space-y-1 overflow-y-auto" aria-label="Chosen files">
                {files.map((file) => (
                  <li key={`${file.name}:${file.size}`} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{size(file.size)}</span>
                    {!busy && (
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asOf" className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden />
              CV written as of <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="asOf" type="date" max={today()} value={asOf} onChange={(event) => setAsOf(event.target.value)} className="w-44" />
            <p className="text-xs text-muted-foreground">
              Roles ending “Present” run to this date. Leave empty to use today; you can change it later per candidate.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {busy && (
            <div className="space-y-1" role="status">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(results.length / Math.max(1, files.length)) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uploading {Math.min(results.length + 1, files.length)} of {files.length}…
              </p>
            </div>
          )}

          {results.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm" aria-label="Upload results">
              {results.map((result, index) => (
                <li key={index} className="flex items-start gap-2">
                  {result.ok ? (
                    result.duplicate ? (
                      <CopyCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    )
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <span className={cn("min-w-0 break-words", !result.ok && "text-destructive")}>
                    {result.ok
                      ? `${result.name}: ${result.duplicate ? "already uploaded" : "uploaded, processing"}`
                      : `${result.name}: ${result.reason}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {done && accepted > 0 ? `${accepted} ${accepted === 1 ? "CV is" : "CVs are"} processing. They rank as they finish.` : ""}
            </p>
            {done ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            ) : (
              <Button type="submit" disabled={busy || !role || files.length === 0} className="gap-1.5">
                {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                {busy ? "Uploading…" : files.length > 1 ? `Upload ${files.length} CVs` : "Upload"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
