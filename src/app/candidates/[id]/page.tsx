import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateNav } from "@/components/candidate-nav";
import { CopyButton } from "@/components/copy-button";
import { DecisionBadge } from "@/components/decision-badge";
import { RadarChart } from "@/components/radar-chart";
import { ScoreBar } from "@/components/score-bar";
import { TierBadge } from "@/components/tier-badge";
import { loadCandidate, neighbours } from "@/lib/dashboard/queries";
import { emailMode } from "@/lib/email/send";
import { parseRole } from "@/lib/intake/validate";
import { RUBRICS } from "@/lib/scoring/rubric";
import { tierFor } from "@/lib/scoring/score";
import { RADAR_CAPTION } from "@/lib/radar";
import { isProductRole } from "@/lib/scoring/years";
import { ROLE_LABEL, type RoleKey, type Tier } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DecisionPanel } from "./decision-panel";
import { DetailsForm } from "./details-form";
import { DraftPanel } from "./draft-panel";
import { RetryButton } from "./retry-button";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

// What the AI recommends for each band. It is a recommendation: the founder decides.
const NEXT_STEP: Record<Tier, { title: string; text: string }> = {
  Strong: { title: "Recommends shortlisting", text: "A strong match for this role. If you shortlist, a draft invite is ready below." },
  Good: { title: "Recommends a conversation", text: "A good match with gaps to probe. The brief lists what to ask." },
  Partial: { title: "Recommends holding", text: "A partial match. Keep for later, or decline respectfully." },
  Weak: { title: "Recommends declining", text: "Not enough of a match for this role right now." },
};

const FLAG_TITLE: Record<string, string> = {
  duplicate: "Duplicate CV",
  placeholder: "Unfilled placeholder",
  identity_mismatch: "Profile link name differs",
  education_overlap: "Job during a full-time degree",
  stated_vs_dated: "Stated vs dated experience",
};

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await loadCandidate(id);
  if (!view) notFound();
  const { candidate, pii, evidence, scores, flags, drafts, decisions } = view;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  // The role being reviewed (score, decision, email) defaults to the one they applied for.
  const role: RoleKey = parseRole(one(search.role)) ?? candidate.appliedRole;
  // The ranking they came from, for the back link and previous/next. It can differ from `role`.
  const from: RoleKey = parseRole(one(search.from)) ?? role;
  const score = scores[role];
  const decision = decisions[role] ?? null;
  const nav = scores[from] ? await neighbours(id, from) : null;
  const mode = (() => {
    try {
      return emailMode();
    } catch {
      return null;
    }
  })();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background px-4 pt-3 pb-3 md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/?role=${from}`} className="inline-block min-h-6 text-sm text-muted-foreground hover:underline">
          ← {ROLE_LABEL[from]} ranking
        </Link>
        {nav && <CandidateNav neighbours={nav} from={from} />}
      </div>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight break-words md:text-2xl">{pii?.name ?? candidate.fileName}</h1>
            <DecisionBadge decision={decision?.decision ?? null} />
          </div>
          <p className="mt-1 text-sm break-all text-muted-foreground">
            {pii?.emails[0] ?? "no email found"} · {pii?.phones[0] ? `+91 ${pii.phones[0]}` : "no phone found"} ·{" "}
            <a className="hover:underline" href={`/api/candidates/${id}/file`} target="_blank" rel="noreferrer">
              View CV
            </a>
          </p>
        </div>
        <div className="flex gap-3">
          {(["pm", "spm"] as RoleKey[]).map((key) =>
            scores[key] ? (
              <Link
                key={key}
                href={`/candidates/${id}?role=${key}&from=${from}`}
                className={cn("rounded-lg border px-4 py-2 text-center", key === role && "border-foreground")}
              >
                <div className="text-xs text-muted-foreground">{ROLE_LABEL[key]}</div>
                <div className="text-xl font-semibold tabular-nums">{scores[key]?.total}</div>
                <TierBadge tier={tierFor(scores[key]!.total)} />
              </Link>
            ) : null,
          )}
        </div>
      </header>
      </div>

      {candidate.status !== "ready" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <span>
            Status: {candidate.status.replace("_", " ")}
            {candidate.statusReason ? ` — ${candidate.statusReason}` : ""}
          </span>
          {candidate.status === "failed" && <RetryButton id={id} />}
        </div>
      )}

      {flags.length > 0 ? (
        <section
          aria-label="Integrity flags"
          className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm dark:border-rose-800 dark:bg-rose-950"
        >
          <h2 className="flex flex-wrap items-center gap-2 font-medium text-rose-900 dark:text-rose-200">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {flags.length} integrity {flags.length === 1 ? "flag" : "flags"} to check
            <span className="font-normal text-foreground/80">· flags never change scores</span>
          </h2>
          <ul className="mt-3 space-y-3">
            {flags.map((flag) => (
              <li key={flag.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{FLAG_TITLE[flag.type]}</p>
                  {flag.relatedName && flag.relatedCandidateId && (
                    <p className="mt-0.5">
                      Same CV as{" "}
                      <Link className="underline" href={`/candidates/${flag.relatedCandidateId}?from=${from}`}>
                        {flag.relatedName}
                      </Link>
                    </p>
                  )}
                  <p className="mt-1 text-foreground/80">Ask: {flag.question}</p>
                </div>
                <CopyButton text={flag.question} label="Copy question" />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No integrity flags.</p>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <SettingsForm id={id} appliedRole={candidate.appliedRole} asOfDate={candidate.asOfDate} />
        <DetailsForm id={id} name={pii?.name ?? ""} email={pii?.emails[0] ?? ""} phone={pii?.phones[0] ?? ""} />
      </section>

      {score && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Why {score.total} for {ROLE_LABEL[role]}</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="anim-fade-up flex flex-col items-center gap-5 rounded-xl border bg-card p-4 shadow-xs sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-1">
                <RadarChart
                  scores={score.subScores.map((item) => item.score)}
                  labels={score.subScores.map((item) => item.criterion)}
                />
                <p className="max-w-52 text-center text-[11px] leading-snug text-muted-foreground">{RADAR_CAPTION}</p>
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI recommendation</p>
                <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xl font-semibold tracking-tight sm:justify-start">
                  {NEXT_STEP[tierFor(score.total)].title}
                  <TierBadge tier={tierFor(score.total)} />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{NEXT_STEP[tierFor(score.total)].text}</p>
                <p className="mt-3 text-sm text-muted-foreground tabular-nums">
                  Product {score.productYears.toFixed(1)} yrs · Total {score.totalYears.toFixed(1)} yrs · suggested role:{" "}
                  {score.suggestedRole.replace("_", " ").replace("pm or spm", "PM or Senior PM")}
                  {score.suggestOther ? " (differs from the applied role)" : ""}
                </p>
              </div>
            </div>
            <DecisionPanel
              key={`${role}-${decision?.decision ?? "none"}-${decision?.decidedAt.getTime() ?? 0}`}
              candidateId={id}
              role={role}
              tier={tierFor(score.total)}
              current={
                decision
                  ? { decision: decision.decision, note: decision.note, decidedAt: decision.decidedAt.toISOString() }
                  : null
              }
            />
          </div>
          <ol className="mt-4 space-y-3">
            {score.subScores.map((item, itemIndex) => {
              const criterion = RUBRICS[role].find((c) => c.id === item.criterion);
              return (
                <li
                  key={item.criterion}
                  className="anim-fade-up rounded-xl border bg-card p-4 shadow-xs"
                  style={{ animationDelay: `${itemIndex * 50}ms` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">
                      {item.criterion} {criterion?.name}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        · weight {Math.round((criterion?.weight ?? 0) * 100)}%
                      </span>
                    </p>
                    <span className="text-lg font-semibold tabular-nums">{item.score}/5</span>
                  </div>
                  <div className="mt-2">
                    <ScoreBar score={item.score} label={`${item.criterion} ${criterion?.name ?? ""}`} size="wide" />
                  </div>
                  <p className="mt-2 text-sm">{item.anchor}</p>
                  {item.quotes.length > 0 && (
                    <details className="group mt-2 text-sm">
                      <summary className="inline-flex min-h-8 cursor-pointer items-center text-muted-foreground hover:text-foreground">
                        Evidence from the CV ({item.quotes.length})
                      </summary>
                      <ul className="mt-1 space-y-1 border-l-2 pl-3 text-foreground/80">
                        {item.quotes.map((quote, index) => (
                          <li key={index}>“{quote}”</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {evidence && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Roles counted</h2>
          <ul className="mt-3 divide-y rounded-lg border text-sm">
            {evidence.roles.map((item, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  {item.title}
                  {item.company ? ` · ${item.company}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {item.start} – {item.end} ·{" "}
                  {item.internship ? "internship (not counted)" : isProductRole(item) ? "product" : item.roleType}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {score && (
        <DraftPanel
          key={`${role}-${drafts[role]?.id ?? "none"}`}
          candidateId={id}
          role={role}
          draft={drafts[role]}
          emailMode={mode}
          hasEmail={Boolean(pii?.emails[0])}
          candidateEmail={pii?.emails[0] ?? null}
          testInbox={process.env.EMAIL_TEST_TO ?? null}
          decision={decision?.decision ?? null}
          appliedRole={candidate.appliedRole}
          from={from}
        />
      )}
    </main>
  );
}
