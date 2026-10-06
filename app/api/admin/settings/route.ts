import {
  encryptSecret,
  errorResponse,
  requireAdmin,
  setting,
  putSetting,
} from "../../../lib";
import { readJson, HttpError, appOrigin } from "../../../../server/security";
import { audit, transaction } from "../../../../server/database";
import { validateForm } from "../../../../server/form";
export async function POST(req: Request) {
  try {
    const actor = await requireAdmin(),
      body = await readJson(req);
    if (
      actor.role !== "SUPER_ADMIN" &&
      body.kind !== "fee" &&
      body.kind !== "form"
    )
      throw new HttpError("Super Admin access required for this setting", 403);
    if (body.kind === "fee") {
      const fee = Number(body.fee);
      if (!Number.isInteger(fee) || fee < 1 || fee > 10000000)
        throw new HttpError("Enter a fee between 1 and 10,000,000 naira");
      await putSetting("fee", String(fee));
    } else if (body.kind === "paystack") {
      const mode = body.mode;
      if (mode !== "test" && mode !== "live")
        throw new HttpError("Choose test or live");
      const pub = String(body.publicKey || "").trim(),
        secret = String(body.secretKey || "").trim();
      if (pub && !new RegExp("^pk_" + mode + "_[A-Za-z0-9]{10,200}$").test(pub))
        throw new HttpError("Public key does not match mode");
      if (
        secret &&
        !new RegExp("^sk_" + mode + "_[A-Za-z0-9]{10,200}$").test(secret)
      )
        throw new HttpError("Secret key does not match mode");
      const encrypted = secret ? await encryptSecret(secret) : "";
      if (body.activate === true) {
        if (
          !(pub || (await setting("paystack_" + mode + "_public"))) ||
          !(encrypted || (await setting("paystack_" + mode + "_secret")))
        )
          throw new HttpError("Save both keys before activating checkout");
        if (
          mode === "live" &&
          (process.env.ALLOW_LIVE_PAYMENTS !== "true" ||
            !appOrigin().startsWith("https://") ||
            !process.env.SMTP_HOST ||
            !process.env.SMTP_USER ||
            !process.env.SMTP_PASSWORD ||
            !process.env.SMTP_FROM)
        )
          throw new HttpError(
            "Live checkout requires HTTPS, SMTP and ALLOW_LIVE_PAYMENTS=true after testing",
          );
      }
      await transaction(async (db) => {
        if (pub) await putSetting("paystack_" + mode + "_public", pub, db);
        if (encrypted)
          await putSetting("paystack_" + mode + "_secret", encrypted, db);
        if (body.activate === true) await putSetting("paystack_mode", mode, db);
      });
    } else if (body.kind === "form") {
      await putSetting("form", JSON.stringify(validateForm(body.form)));
    } else throw new HttpError("Unknown setting");
    await audit(actor.email, "settings." + String(body.kind));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
