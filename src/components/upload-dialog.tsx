"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";

export function UploadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!role) return setError("Select the role these CVs applied for.");
    if (!files.length) return setError("Choose at least one CV file.");
    setError(null);
    setBusy(true);
    const done: UploadResult[] = [];
    // One request per file so a bad file never blocks the rest.
    for (const file of files) {
      const form = new FormData();
      form.set("role", role);
      form.set("file", file);
      try {
        done.push(await uploadCv(form));
      } catch {
        done.push({ ok: false, name: file.name, reason: "Upload failed; try again." });
      }
      setResults([...done]);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFiles([]);
          setResults([]);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button />}>Upload CVs</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload CVs</DialogTitle>
          <DialogDescription>PDF or DOCX, up to 5 MB each. Every CV is scored for both roles.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role">Applied role</Label>
            <select
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select a role…</option>
              <option value="pm">Product Manager</option>
              <option value="spm">Senior Product Manager</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="files">CV files</Label>
            <input
              id="files"
              type="file"
              multiple
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {results.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {results.map((result, index) => (
                <li key={index} className={result.ok ? "text-foreground" : "text-destructive"}>
                  {result.ok
                    ? `${result.name}: ${result.duplicate ? "already uploaded" : "uploaded, processing"}`
                    : `${result.name}: ${result.reason}`}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? `Uploading ${results.length + 1} of ${files.length}…` : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
