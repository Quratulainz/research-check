import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const NAME = "research_checker_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("Set AUTH_SECRET to a random secret of at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function createSession(userId: string, email: string) {
  const token = await new SignJWT({ email }).setProtectedHeader({ alg: "HS256" })
    .setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  const store = await cookies();
  store.set(NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function clearSession() {
  const store = await cookies();
  store.set(NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getSession(): Promise<{ userId: string; email: string } | null> {
  try {
    const token = (await cookies()).get(NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { userId: payload.sub, email: payload.email };
  } catch { return null; }
}
