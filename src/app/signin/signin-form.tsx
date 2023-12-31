"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null };

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="mt-5 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="passcode">Passcode</Label>
        <Input id="passcode" name="passcode" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
