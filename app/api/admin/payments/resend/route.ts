import { database, errorResponse, requireAdmin } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import { sendContinuation } from "../../../../../server/email";
import { registrationToken } from "../../../../../server/manual-payments";
import { audit } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      { id } = await readJson(req);
    if (typeof id !== "string") throw new HttpError("Invalid payment");
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD ||
      !process.env.SMTP_FROM
    )
      throw new HttpError(
        "Configure SMTP email delivery in Hostinger first",
        503,
      );
    const p = await database()
      .prepare(
        "SELECT reference FROM payments WHERE id=? AND status='SUCCESS' AND completed=0",
      )
      .bind(id)
      .first<{ reference: string }>();
    if (!p) throw new HttpError("Eligible payment not found", 404);
    const token = await registrationToken(p.reference);
    if (!token) throw new HttpError("Registration already completed", 409);
    await sendContinuation(p.reference, token, true);
    await audit(admin.email, "payment.link_resent", id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
