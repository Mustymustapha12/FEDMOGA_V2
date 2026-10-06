import { database, errorResponse, paystackKey, setting } from "../../../lib";
import {
  readJson,
  HttpError,
  rateLimit,
  validEmail,
  appOrigin,
} from "../../../../server/security";
export async function POST(req: Request) {
  try {
    const input = await readJson(req),
      name = String(input.name || "").trim(),
      email = String(input.email || "")
        .trim()
        .toLowerCase(),
      phone = String(input.phone || "").trim();
    if (
      name.length < 2 ||
      name.length > 160 ||
      !validEmail(email) ||
      phone.length < 7 ||
      phone.length > 30
    )
      throw new HttpError("Enter valid payer details");
    await rateLimit("checkout:" + email, 10);
    const mode = await setting("paystack_mode", "test");
    if (mode !== "test" && mode !== "live")
      throw new HttpError("Checkout is not configured", 503);
    if (
      mode === "live" &&
      (process.env.ALLOW_LIVE_PAYMENTS !== "true" ||
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASSWORD ||
        !process.env.SMTP_FROM)
    )
      throw new HttpError("Live checkout is disabled", 503);
    const amount = Number(await setting("fee", "5000")) * 100;
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000000)
      throw new HttpError("Invalid fee", 503);
    const key = await paystackKey(mode),
      id = crypto.randomUUID(),
      reference = "FEDMOGA-" + crypto.randomUUID(),
      callback = new URL("/api/paystack/callback", appOrigin()).toString();
    await database()
      .prepare(
        "INSERT INTO payments(id,full_name,email,phone,amount,status,created_at,completed,reference,mode,amount_kobo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        name,
        email,
        phone,
        amount / 100,
        "PENDING",
        new Date().toISOString(),
        0,
        reference,
        mode,
        amount,
      )
      .run();
    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount,
          currency: "NGN",
          reference,
          callback_url: callback,
          metadata: { paymentId: id },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = await response.json();
    if (
      !response.ok ||
      result?.status !== true ||
      !result.data?.authorization_url
    )
      throw new HttpError(
        "Paystack could not start checkout. Please try again.",
        502,
      );
    const url = new URL(result.data.authorization_url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com")
      throw new HttpError("Invalid checkout response", 502);
    await database()
      .prepare(
        "INSERT INTO checkout_links(payment_id,authorization_url) VALUES(?,?)",
      )
      .bind(id, url.toString())
      .run();
    return Response.json({ authorizationUrl: url.toString(), reference });
  } catch (e) {
    return errorResponse(e);
  }
}
