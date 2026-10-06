import { setting, errorResponse } from "../../lib";
import { defaultSections } from "../../../server/form";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [fee, form, mode, key] = await Promise.all([
      setting("fee", "5000"),
      setting("form"),
      setting("paystack_mode", "test"),
      setting(
        "paystack_" + (await setting("paystack_mode", "test")) + "_secret",
      ),
    ]);
    return Response.json(
      {
        fee: Number(fee),
        form: form ? JSON.parse(form) : { sections: defaultSections },
        mode,
        checkoutReady:
          !!key &&
          (mode === "test" ||
            (mode === "live" &&
              process.env.ALLOW_LIVE_PAYMENTS === "true" &&
              !!process.env.SMTP_HOST &&
              !!process.env.SMTP_USER &&
              !!process.env.SMTP_PASSWORD &&
              !!process.env.SMTP_FROM)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
