import { database, errorResponse } from "../../../lib";
import {
  bootstrapAdmin,
  startSession,
  type Admin,
} from "../../../../server/auth";
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
    const normalized = (email as string).trim().toLowerCase();
    await rateLimit("login:" + normalized, 10);
    await bootstrapAdmin();
    const admin = await database()
      .prepare(
        "SELECT id,email,role,active,auth_version,password_hash FROM admins WHERE email=?",
      )
      .bind(normalized)
      .first<Admin & { password_hash: string }>();
    // Run scrypt even for missing users to avoid a trivial account-existence timing leak.
    const dummy = "scrypt:00000000000000000000000000000000:" + "0".repeat(128);
    const valid = await verifyPassword(password, admin?.password_hash || dummy);
    if (!admin?.active || !valid)
      throw new HttpError("Invalid email or password", 401);
    await startSession(admin);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
