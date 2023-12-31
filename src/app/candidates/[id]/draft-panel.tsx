"use client";

import { CircleCheck, FlaskConical, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { openDraft, regenerateDraft, saveDraft, sendDraftAction } from "@/app/actions/drafts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { drafts } from "@/db/schema";
import { ROLE_LABEL, type RoleKey } from "@/lib/types";

type Draft = typeof drafts.$inferSelect;

export function DraftPanel(props: {
  candidateId: string;
  role: RoleKey;
  draft: Draft | null;
  emailMode: "redirect" | "live" | null;
  hasEmail: boolean;
  candidateEmail: string | null;
  testInbox: string | null;
}) {
  const { candidateId, role, draft } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requested = useRef(false);

  // Generated lazily, the first time this role's detail is opened.
  useEffect(() => {
    if (draft || requested.current) return;
    requested.current = true;
    start(async () => {
      try {
        await openDraft(candidateId, role);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not generate the brief.");
      }
    });
  }, [draft, candidateId, role, router]);

  const run = (label: string, action: () => Promise<unknown>) =>
    start(async () => {
      setMessage(null);
      try {
        await action();
        toast.success(label);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });

  if (!draft) {
    return (
      <section className="mt-8 rounded-lg border p-4 text-sm text-muted-foreground">
        {message ?? `Writing the interview brief and email for ${ROLE_LABEL[role]}…`}
      </section>
    );
  }

  const sent = draft.status === "sent";
  const edited = subject !== draft.subject || body !== draft.body;
  const otherKind = draft.kind === "invite" ? "rejection" : "invite";
  const live = props.emailMode === "live";
  const sendNow = () =>
    run(`Email sent to ${live ? props.candidateEmail : (props.testInbox ?? "the test inbox")}`, async () => {
      const outcome = await sendDraftAction(candidateId, draft.id);
      if (outcome.status !== "sent") throw new Error(outcome.detail ?? "Not sent");
    });

  return (
    <>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Interview brief · {ROLE_LABEL[role]}</h2>
        <p className="mt-2 text-sm">{draft.brief.summary}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium">Strongest</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {draft.brief.strengths.map((item) => (
                <li key={item.criterion}>
                  <span className="font-medium">{item.criterion}</span>
                  <span className="block text-muted-foreground">“{item.evidence}”</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium">Probe</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {draft.brief.probes.map((item) => (
                <li key={item.criterion}>
                  <span className="font-medium">{item.criterion}</span>
                  <span className="block text-muted-foreground">{item.question}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {draft.brief.verification.length > 0 && (
          <div className="mt-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Verify</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {draft.brief.verification.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Email · {draft.kind === "invite" ? "interview invite" : "rejection"}
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {sent && <CircleCheck aria-hidden className="anim-pop size-4 text-emerald-600 dark:text-emerald-400" />}
            {sent
              ? `Sent ${draft.sentAt ? new Date(draft.sentAt).toLocaleString() : ""} to ${draft.sentTo}`
              : draft.status === "needs_manual_edit"
                ? "Needs a manual edit before sending"
                : draft.status === "failed"
                  ? `Send failed: ${draft.error}`
                  : draft.editedByFounder
                    ? "Edited by you"
                    : "AI draft"}
          </span>
        </div>
        {draft.scoresChanged && !sent && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Scores changed since this draft.</p>
        )}
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} disabled={sent} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" rows={12} value={body} disabled={sent} onChange={(event) => setBody(event.target.value)} />
          </div>
        </div>
        {!sent && props.emailMode && (
          <p
            className={
              live
                ? "mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "mt-3 inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-100 px-2 py-1 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
            }
          >
            {live ? <Mail className="size-3.5 shrink-0" aria-hidden /> : <FlaskConical className="size-3.5 shrink-0" aria-hidden />}
            {live
              ? `Live: this goes to the candidate (${props.candidateEmail ?? "no address"})`
              : `Test mode: this goes to ${props.testInbox ?? "the test inbox"}, not to the candidate`}
          </p>
        )}
        {!sent && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={pending || edited || !props.hasEmail || !props.emailMode || draft.status === "needs_manual_edit"}
              onClick={() => (live ? setConfirmOpen(true) : sendNow())}
            >
              {pending ? "Working…" : live ? "Send" : "Send to test inbox"}
            </Button>
            <Button
              variant="outline"
              disabled={pending || !edited}
              onClick={() => run("Saved.", () => saveDraft(candidateId, draft.id, { subject, body }))}
            >
              Save edits
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run("Regenerated.", () => regenerateDraft(candidateId, role, otherKind))}
            >
              Switch to {otherKind}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run("Regenerated.", () => regenerateDraft(candidateId, role))}>
              Regenerate
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {!props.hasEmail ? "Add an email address to send. " : ""}
          {!props.emailMode ? "Email is not configured (EMAIL_MODE). " : ""}
          {edited ? "Save your edits before sending." : ""}
        </p>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this email to {props.candidateEmail}?</DialogTitle>
            <DialogDescription>It is sent immediately and cannot be recalled.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                sendNow();
              }}
            >
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
