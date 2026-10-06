import { database } from "../../../server/database";
import { logFailure } from "../../../server/diagnostics";
export const dynamic = "force-dynamic";
export async function GET() {
  const options = { headers: { "Cache-Control": "no-store" } };
  try {
    await database().prepare("SELECT 1 AS ok").first();
    const count = await database()
      .prepare("SELECT count(*) AS n FROM admins")
      .first<{ n: number }>();
    const missing = [
      "APP_URL",
      "FEDMOGA_ENCRYPTION_KEY",
      ...(count?.n === 0 ? ["SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD"] : []),
    ].filter((name) => !process.env[name]);
    return Response.json(
      {
        status: missing.length ? "setup_required" : "ok",
        database: "connected",
        adminSetup: count?.n === 0 ? "pending_first_login" : "initialized",
        missing,
      },
      options,
    );
  } catch (e) {
    return Response.json(
      { status: "unavailable", database: "unavailable", ...logFailure(e) },
      { ...options, status: 503 },
    );
  }
}
