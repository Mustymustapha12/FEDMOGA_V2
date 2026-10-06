import { database, errorResponse, setting } from "../../../../lib";
import {
  readJson,
  validEmail,
  rateLimit,
  HttpError,
} from "../../../../../server/security";
import { transaction } from "../../../../../server/database";
import {
  Member,
  issueAccountLink,
  createMemberForRegistration,
} from "../../../../../server/members";
export async function POST(req: Request) {
  try {
    const { email } = await readJson(req);
    if (!validEmail(email))
      throw new HttpError("Enter your registration email");
    const normalized = String(email).trim().toLowerCase();
    await rateLimit("member-reset:" + normalized, 3, 3600000);
    const mode = await setting("paystack_mode", "test");
    await transaction(async (db) => {
      let member = await db
        .prepare("SELECT * FROM members WHERE email=? AND mode=? FOR UPDATE")
        .bind(normalized, mode)
        .first<Member>();
      if (!member) {
        const r = await db
          .prepare(
            "SELECT r.id FROM registrations r JOIN payments p ON p.id=r.payment_id WHERE p.email=? AND p.mode=? ORDER BY r.created_at LIMIT 1",
          )
          .bind(normalized, mode)
          .first<{ id: string }>();
        if (r) {
          await createMemberForRegistration(r.id, db);
          return;
        }
      }
      if (member?.enabled)
        await issueAccountLink(
          member,
          member.email_verified_at ? "reset" : "activation",
          db,
        );
    });
    return Response.json({
      message:
        "If an eligible account matches, a private activation or password-reset email will be sent. Check your inbox and spam folder.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
