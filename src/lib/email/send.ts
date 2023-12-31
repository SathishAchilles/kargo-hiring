import { Resend } from "resend";

export type EmailMode = "redirect" | "live";

export type OutgoingEmail = { to: string; subject: string; text: string; idempotencyKey: string };

export type Sender = (email: OutgoingEmail & { from: string }) => Promise<{ id: string }>;

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

export function emailMode(value = process.env.EMAIL_MODE ?? "redirect"): EmailMode {
  if (value === "redirect" || value === "live") return value;
  throw new EmailConfigError(`EMAIL_MODE must be "redirect" or "live", not "${value}"`);
}

// Outside live mode every email goes to the test inbox, with the real
// recipient in the subject, so a click never reaches a candidate.
export function route(
  email: { to: string; subject: string },
  mode: EmailMode,
  testTo = process.env.EMAIL_TEST_TO,
): { to: string; subject: string } {
  if (mode === "live") return email;
  if (!testTo) throw new EmailConfigError("EMAIL_TEST_TO must be set in redirect mode");
  return { to: testTo, subject: `[to: ${email.to}] ${email.subject}` };
}

let senderOverride: Sender | null = null;

export function setSenderForTests(sender: Sender | null) {
  senderOverride = sender;
}

const resendSender: Sender = async ({ from, to, subject, text, idempotencyKey }) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new EmailConfigError("RESEND_API_KEY is not set");
  const { data, error } = await new Resend(key).emails.send({ from, to, subject, text }, { idempotencyKey });
  if (error || !data) throw new Error(error?.message ?? "Resend returned no message id");
  return { id: data.id };
};

export function sender(): Sender {
  return senderOverride ?? resendSender;
}

export function fromAddress(): string {
  const from = process.env.RESEND_FROM;
  if (!from) throw new EmailConfigError("RESEND_FROM is not set");
  return from;
}
