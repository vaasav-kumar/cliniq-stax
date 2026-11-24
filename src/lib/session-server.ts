import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { SESSION_TTL_HOURS, resolveSession, type SessionUser } from "./sessions";
import { can, type Permission } from "./rbac";

export const SESSION_COOKIE = "hv_session";

export async function currentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(getDb(), token);
}

// For pages and layouts: send anonymous visitors to sign-in.
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

// For server actions: returns an error message instead of redirecting, so the form can show it.
export async function authorize(
  permission?: Permission,
): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };
  if (permission && !can(user.role, permission)) return { ok: false, error: "Your role does not allow this." };
  return { ok: true, user };
}

export function setSessionCookie(token: string): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export function sessionTokenFromCookie(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}
