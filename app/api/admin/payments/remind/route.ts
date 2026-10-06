import {
  database,
  requireAdmin,
  errorResponse,
  encryptToken,
} from "../../../../lib";
import {
  readJson,
  HttpError,
  appOrigin,
  rateLimit,
} from "../../../../../server/security";
import { enqueueMail, brandedMail } from "../../../../../server/mail-jobs";
import { audit } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      { id } = await readJson(req);
    if (typeof id !== "string") throw new HttpError("Invalid payment");
    await rateLimit("checkout-reminder:" + id, 3, 86400000);
    const p = await database()
      .prepare(
        "SELECT full_name as name,email,reference FROM payments WHERE id=? AND status='PENDING'",
      )
      .bind(id)
      .first<{ name: string; email: string; reference: string }>();
    if (!p) throw new HttpError("Pending payment not found", 404);
    const token = await encryptToken(
        JSON.stringify({ id, expires: Date.now() + 30 * 86400000 }),
      ),
      url =
        appOrigin() + "/api/paystack/resume?token=" + encodeURIComponent(token);
    await enqueueMail(
      "checkout-reminder:" + id + ":" + crypto.randomUUID(),
      brandedMail(
        p.email,
        "Complete your FEDMOGA registration payment",
        "Complete your registration",
        [
          "Hello " + p.name + ".",
          "You started registration but payment has not yet been confirmed.",
          "Reference: " + p.reference,
          "If you have already paid, we will try to verify it first. Do not make another payment for a confirmed transaction.",
        ],
        url,
        "Continue my payment",
      ),
      database(),
      null,
      id,
    );
    await audit(admin.email, "payment.checkout_reminder", id);
    return Response.json({
      message: "Payment-completion reminder queued for email delivery",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
