// Shared constants and pure validation helpers (no DB access here, so they are easy to test).

export const REACH_SOURCES = [
  "Google Search",
  "Instagram",
  "Facebook",
  "Website",
  "Walk-in",
  "Phone call",
  "Doctor referral",
  "Patient referral",
  "Other",
] as const;
export type ReachSource = (typeof REACH_SOURCES)[number];

export const SERVICES = [
  "Ayurveda consultation",
  "Kerala Panchakarma",
  "Pain care",
  "Women's health",
  "Follow-up consultation",
  "Other",
] as const;

export const VISIT_STATUSES = ["completed", "no_show", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

// Payment status is per visit. Shown and stored exactly as PAID / NOT_PAID.
export const PAYMENT_STATUSES = ["PAID", "NOT_PAID"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Medicines & herbs",
  "Utilities",
  "Marketing",
  "Equipment",
  "Other",
] as const;

export const INCOME_CATEGORIES = ["Consultation", "Panchakarma", "Pain care", "Women's health", "Products", "Other"] as const;

export const ROLES = ["admin", "doctor", "front_desk"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  doctor: "Doctor / therapist",
  front_desk: "Front desk",
};

export class ValidationError extends Error {}
export class ForbiddenError extends Error {}

export function requireText(value: unknown, field: string, max = 200): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new ValidationError(`${field} is required`);
  if (v.length > max) throw new ValidationError(`${field} is too long`);
  return v;
}

export function optionalText(value: unknown, max = 500): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  if (v.length > max) throw new ValidationError("Text is too long");
  return v;
}

// Indian mobile: 10 digits starting 6-9, optionally prefixed by +91 / 91 (12 digits) or 0 (11 digits).
export function normalizePhone(value: unknown): string {
  const raw = typeof value === "string" ? value.replace(/[\s\-()]/g, "") : "";
  let digits = raw.replace(/^\+/, "");
  if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new ValidationError("Enter a valid 10-digit mobile number");
  return digits;
}

export function normalizeEmail(value: unknown): string {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ValidationError("Enter a valid email address");
  return v;
}

export function requirePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 10) throw new ValidationError("Password must be at least 10 characters");
  if (value.length > 200) throw new ValidationError("Password is too long");
  return value;
}

export function requireOption<T extends readonly string[]>(value: unknown, options: T, field: string): T[number] {
  if (typeof value === "string" && (options as readonly string[]).includes(value)) return value as T[number];
  throw new ValidationError(`${field} is invalid`);
}

export function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${field} must be a date (YYYY-MM-DD)`);
  }
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${field} is not a real date`);
  }
  return value;
}

export function optionalDate(value: unknown, field: string): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return requireDate(value.trim(), field);
}

export function requireAmount(value: unknown, field: string): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new ValidationError(`${field} must be a valid amount`);
  return Math.round(n * 100) / 100;
}

export function todayIso(now: Date = new Date()): string {
  // Local calendar date in India time, independent of server timezone.
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
