import { database, requireAdmin, errorResponse } from "../../../../lib";
import { readJson, HttpError, appOrigin } from "../../../../../server/security";
import { registrationToken } from "../../../../../server/manual-payments";
import { audit } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      { id } = await readJson(req);
    if (typeof id !== "string") throw new HttpError("Invalid payment");
    const p = await database()
      .prepare(
        "SELECT reference FROM payments WHERE id=? AND status='SUCCESS' AND completed=0",
      )
      .bind(id)
      .first<{ reference: string }>();
    if (!p) throw new HttpError("Unfinished verified payment not found", 404);
    const token = await registrationToken(p.reference);
    if (!token) throw new HttpError("Registration already completed", 409);
    await audit(admin.email, "payment.link_copied", id);
    return Response.json(
      {
        registrationUrl: new URL("/?continue=" + token, appOrigin()).toString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
