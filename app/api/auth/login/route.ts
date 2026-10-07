import { cookies } from "next/headers";
import { database, errorResponse, setting } from "../../../lib";
import {
  bootstrapAdmin,
  startSession,
  endSession,
  type Admin,
  SESSION_COOKIE,
} from "../../../../server/auth";
import {
  startMemberSession,
  endMemberSession,
} from "../../../../server/member-auth";
import { type Member } from "../../../../server/members";
import {
  HttpError,
  readJson,
  rateLimit,
  validEmail,
  verifyPassword,
} from "../../../../server/security";
export async function POST(req: Request) {
  try {
    const { email, password } = await readJson(req);
    if (
      !validEmail(email) ||
      typeof password !== "string" ||
      password.length > 128
    )
      throw new HttpError("Invalid email or password", 401);
    const normalized = String(email).trim().toLowerCase();
    await rateLimit("login:" + normalized, 10);
    await bootstrapAdmin();
    const [admin, member] = await Promise.all([
      database()
        .prepare(
          "SELECT id,email,role,active,auth_version,password_hash FROM admins WHERE email=?",
        )
        .bind(normalized)
        .first<Admin & { password_hash: string }>(),
      database()
        .prepare("SELECT * FROM members WHERE email=? AND mode=?")
        .bind(normalized, await setting("paystack_mode", "test"))
        .first<Member>(),
    ]);
    const dummy = "scrypt:00000000000000000000000000000000:" + "0".repeat(128);
    const [adminValid, memberValid] = await Promise.all([
      verifyPassword(password, admin?.password_hash || dummy),
      verifyPassword(password, member?.password_hash || dummy),
    ]);
    const jar = await cookies();
    if (admin?.active && adminValid) {
      await startSession(admin);
      if (jar.get("fedmoga_member_session")?.value) await endMemberSession();
      return Response.json({ ok: true, role: admin.role, redirect: "/admin" });
    }
    if (
      member?.enabled &&
      member.email_verified_at &&
      member.password_hash &&
      memberValid
    ) {
      await startMemberSession(member);
      if (jar.get(SESSION_COOKIE)?.value) await endSession();
      return Response.json({ ok: true, role: "MEMBER", redirect: "/member" });
    }
    throw new HttpError(
      "Invalid email or password. If you are a member, use Activate / reset account to activate your account.",
      401,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
