# Kargo hiring dashboard

A founder-only tool that scores every CV against both Kargo job descriptions (Product Manager and Senior Product Manager), explains each score with quotes from the CV, flags CVs that need checking, and drafts an interview brief and an email for each candidate.

Planning artifacts (proposal, specs, design, tasks) live in `~/ws/openspec/changes/kargo-hiring-dashboard/`.

## How it works

```
upload CV + role ──▶ extract text ──▶ separate personal details, redact ──▶ AI reads facts (with quotes)
                                                                                     │
          dashboard ◀── rank + insight chips ◀── integrity checks ◀── score both rubrics in code
              │
              └──▶ AI recommends (Strong / Good / Partial / Weak match)
                        └──▶ YOU decide: shortlist, hold or decline ──▶ matching email draft ──▶ one-click send (Resend)
```

- **The AI recommends; you decide.** The tiers are recommendations, never decisions. Nobody is shortlisted, held or declined until you record it (per candidate and role, with an optional private note), and the dashboard tracks how many you have decided. An email can only be sent once your decision matches it: an invite for Shortlisted, a rejection for Declined, nothing on hold. The server enforces this in `sendDraft`, not only the page.
- **Decide from the list or the page.** Each row has Shortlist, On hold and Decline buttons (click the active one to clear; an Undo toast follows each click). Deciding never sends an email. Hovering a name, or hovering or tapping a total, previews the radar chart of the five sub-scores.
- **Candidates open in the role they applied for**, and the email is written for that role by default; one link switches the page and email to the other role.

- **AI reads, code scores.** One AI call turns the redacted CV into an evidence record in which every fact carries a verbatim quote; facts whose quote is not in the CV are dropped. The rubric scores are computed in code (`src/lib/scoring/rubric.ts`), so the same evidence always gives the same score and a changed as-of date rescores with no AI call.
- **Personal details never reach AI.** Name, email, phone, links and education institutions are removed before any AI request, and every request passes a leak gate (`src/lib/pii/gate.ts`) that refuses to send if any stored personal detail is still present. Only `src/lib/ai/client.ts` may call the Anthropic API; a test enforces this.
- **Flags never change scores.** Duplicate CVs, unfilled placeholders, profile links in another name, jobs during a full-time degree, and stated-vs-dated experience become verification questions in the brief.

## Setup

Requires Node 22+, and the self-hosted Supabase stack in Docker at `~/ws/supabase-project`.

```bash
sh ~/ws/supabase-project/run.sh start      # Postgres on :5432 (session) and :6543 (transaction)
npm install
cp .env.example .env.local                 # then fill in the values below
npm run db:migrate
```

`.env.local`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | transaction pooler, `postgres://postgres.local:<password>@localhost:6543/postgres` |
| `DATABASE_MIGRATION_URL` | session pooler, same credentials on `:5432` |
| `ANTHROPIC_API_KEY` | may also come from your shell environment |
| `RESEND_API_KEY`, `RESEND_FROM` | Resend key; `onboarding@resend.dev` works in redirect mode |
| `EMAIL_MODE` | `redirect` (default) or `live` |
| `EMAIL_TEST_TO` | the inbox that receives every email in redirect mode (for the Resend sandbox sender, your Resend account email) |
| `FOUNDER_SIGNATURE` | appended to every email, e.g. `Arjun Mehta, Founder, Kargo` |
| `FOUNDER_PASSCODE_HASH` | from `npm run -s hash-passcode -- '<passcode>'`; escape each `$` as `\$` |
| `SESSION_SECRET` | at least 32 random characters |

Then `npm run dev` and sign in at http://localhost:3000.

## Importing the CV set

```bash
npm run import:resumes      # imports ~/ws/resumes (override with RESUME_DIR)
```

Files named `pm_*` are imported as PM applicants and `spm_*` as Senior PM applicants, both with as-of date 2025-02-01 because their "Present" is written as of early 2025; every other file is a PM applicant dated today. Re-running the import is safe: files are matched by content hash, and unfinished candidates resume where they stopped.

Other maintenance commands:

```bash
npm run process -- <file name | candidate id>   # run or resume one candidate
npm run reprocess -- evidence                    # re-read every CV (after changing the evidence prompt)
npm run reprocess -- scoring                     # rescore every CV (after changing a rubric rule; no AI call)
npm run check:privacy                            # re-check every stored redacted CV for personal details
```

## Calibration

```bash
npm run calibrate
```

Compares the imported 50 with the manual scoring pass in `calibration/manual-scores.json`: the `pm_` score bands, rank agreement (Kendall τ-b ≥ 0.6) for both roles, a floor for `spm_16`–`spm_20` (total ≥ 70 and top 8), the share of sub-scores within ±1 (at least 80%), and the expected integrity flags. It lists every sub-score that differs by more than 1 with the anchor and quote the code used. Disagreements are for the founder to judge; the manual scores are never edited to make the check pass.

## Email modes

- `redirect` (default): every email goes to `EMAIL_TEST_TO`, with the candidate's address in the subject as `[to: …]`. The CVs contain real student mailboxes, so this is the only safe mode for testing.
- `live`: emails go to candidates. Requires `RESEND_FROM` on a domain verified in Resend.

Sending is also gated on your decision (see above). Each draft sends at most once: the send claims the draft row before calling Resend, and the draft id is Resend's idempotency key.

## Clean data and demo data

The database can be switched between empty (to try the UI from scratch) and the 50-CV demo set, without re-reading CVs with the AI:

```bash
npm run data:status                    # row counts
npm run data:backup                    # save everything to backups/demo.sql (gitignored; it holds real CV data)
npm run data:reset -- --yes            # empty every table (the schema stays)
npm run data:restore -- demo --yes     # empty, then load backups/demo.sql
```

On an empty database the dashboard shows a get-started screen. Upload CVs from the dialog; set "CV written as of" when a CV's "Present" is not today (the `pm_*` and `spm_*` samples are written as of 2025-02-01).

## Tests

```bash
npm test          # unit and database tests (needs the Docker stack for *.db.test.ts)
npm run e2e       # Playwright against a production build on :3107 (needs the demo data; specs skip on an empty database)
E2E_LIVE=1 npm run e2e -- e2e/upload.spec.ts   # uploads a CV through the dialog end to end (one live AI call)
PW_REUSE=1 npm run e2e                         # reuse an already running server on :3107
npm run lint
```
