"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_HOURS, createSessionToken } from "@/lib/auth/session";

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const passcode = String(formData.get("passcode") ?? "");
  const hash = process.env.FOUNDER_PASSCODE_HASH;
  if (!hash) return { error: "Sign-in is not configured: FOUNDER_PASSCODE_HASH is missing." };
  if (!passcode || !(await bcrypt.compare(passcode, hash))) return { error: "Wrong passcode." };

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  redirect("/");
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/signin");
}
