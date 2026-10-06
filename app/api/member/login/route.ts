import { database, errorResponse, setting } from "../../../lib";
import {
  readJson,
  rateLimit,
  validEmail,
  verifyPassword,
  HttpError,
} from "../../../../server/security";
import { startMemberSession } from "../../../../server/member-auth";
import { Member } from "../../../../server/members";
export async function POST(req: Request) {
  try {
    const { email, password } = await readJson(req);
    if (
      !validEmail(email) ||
      typeof password !== "string" ||
      password.length > 128
    )
      throw new HttpError("Enter your email and password");
    const normalized = String(email).trim().toLowerCase();
    await rateLimit("member-login:" + normalized, 10);
    const member = await database()
      .prepare("SELECT * FROM members WHERE email=? AND mode=?")
      .bind(normalized, await setting("paystack_mode", "test"))
      .first<Member>();
    if (
      !member?.password_hash ||
      !member.email_verified_at ||
      !member.enabled ||
      !(await verifyPassword(password, member.password_hash))
    )
      throw new HttpError(
        "Invalid email or password. Use Activate / reset account if you have not set your password.",
        401,
      );
    await startMemberSession(member);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
