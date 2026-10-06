import { database, decryptToken, errorResponse } from "../../../lib";
import { appOrigin, HttpError } from "../../../../server/security";
import { verifyPayment } from "../../../paystack";
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token || token.length > 2000)
      throw new HttpError("Invalid reminder link", 403);
    let data;
    try {
      data = JSON.parse(await decryptToken(token));
    } catch {
      throw new HttpError("Invalid reminder link", 403);
    }
    if (!data.id || data.expires < Date.now())
      throw new HttpError("This reminder link has expired", 403);
    const p = await database()
      .prepare("SELECT reference,completed FROM payments WHERE id=?")
      .bind(data.id)
      .first<{ reference: string; completed: number }>();
    if (!p) throw new HttpError("Payment not found", 404);
    if (p.completed) return Response.redirect(appOrigin() + "/member", 303);
    try {
      const continuation = await verifyPayment(p.reference);
      if (continuation)
        return Response.redirect(
          appOrigin() + "/?continue=" + continuation,
          303,
        );
    } catch {}
    const checkout = await database()
      .prepare(
        "SELECT authorization_url FROM checkout_links WHERE payment_id=?",
      )
      .bind(data.id)
      .first<{ authorization_url: string }>();
    if (checkout) return Response.redirect(checkout.authorization_url, 303);
    return Response.redirect(
      appOrigin() +
        "/?payment=unverified&reference=" +
        encodeURIComponent(p.reference),
      303,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
