import { requireAdmin, errorResponse } from "../../../../lib";
import { readJson, rateLimit } from "../../../../../server/security";
import { sendEmail } from "../../../../../server/email";
import { audit } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(true);
    await readJson(req);
    await rateLimit("email-test:" + admin.id, 3, 60 * 60 * 1000);
    await sendEmail(
      admin.email,
      "FEDMOGA email delivery test",
      "Your FEDMOGA SMTP settings are working. This is a test email.",
    );
    await audit(admin.email, "email.test_sent");
    return Response.json({
      message:
        "Email accepted by the mail server for " +
        admin.email +
        ". Check your inbox and spam folder.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
