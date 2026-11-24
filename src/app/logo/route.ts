import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/session-server";

// Serves the signed-in user's clinic logo. Not public: other clinics and signed-out visitors get 404.
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const row = await getDb().one<{ logo_mime: string | null; logo_data: Buffer | null }>(
    "SELECT logo_mime, logo_data FROM clinics WHERE id = @clinicId",
    { clinicId: user.clinicId },
  );
  if (!row?.logo_data || !row.logo_mime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.logo_data), {
    headers: { "Content-Type": row.logo_mime, "Cache-Control": "private, max-age=300" },
  });
}
