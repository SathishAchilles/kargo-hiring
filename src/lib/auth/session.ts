import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kh_session";
export const SESSION_HOURS = 12;

function key(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(now = new Date(), secret?: string): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sub: "founder" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_HOURS * 3600)
    .sign(key(secret));
}

export async function verifySessionToken(
  token: string | undefined,
  now = new Date(),
  secret?: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      currentDate: now,
    });
    return payload.sub === "founder";
  } catch {
    return false;
  }
}
