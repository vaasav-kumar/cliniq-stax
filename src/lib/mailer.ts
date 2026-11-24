import nodemailer from "nodemailer";

// Sends notification emails through the SMTP server named in the environment.
// Nothing is sent unless SMTP_HOST is set. Failures are logged and never block the caller.
export const CLINIC_SIGNUP_NOTIFY_TO = process.env.CLINIC_SIGNUP_NOTIFY_TO || "harshavedic@gmail.com";

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn(`[mail] SMTP_HOST is not set; email "${subject}" to ${to} was not sent`);
    return false;
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) {
    console.warn("[mail] MAIL_FROM or SMTP_USER must be set; email was not sent");
    return false;
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from, to, subject, text });
    return true;
  } catch (e) {
    console.error(`[mail] could not send "${subject}" to ${to}:`, e instanceof Error ? e.message : e);
    return false;
  } finally {
    transport.close();
  }
}
