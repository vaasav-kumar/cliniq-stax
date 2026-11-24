import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clinic CRM",
  description: "Patients, visits, follow-ups, income and expenses for Ayurveda clinics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
