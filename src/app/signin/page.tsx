import { SignInForm } from "./signin-form";

export const metadata = { title: "Sign in · Kargo Hiring" };

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Kargo Hiring</h1>
        <p className="mt-1 text-sm text-muted-foreground">Founder access only.</p>
        <SignInForm />
      </div>
    </main>
  );
}
