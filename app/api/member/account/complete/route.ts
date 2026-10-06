import { errorResponse } from "../../../../lib";
import {
  readJson,
  digest,
  hashPassword,
  HttpError,
} from "../../../../../server/security";
import { transaction } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const { token, password } = await readJson(req);
    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token) ||
      typeof password !== "string"
    )
      throw new HttpError("Invalid account link", 403);
    const passwordHash = await hashPassword(password);
    await transaction(async (db) => {
      const t = await db
        .prepare(
          "SELECT member_id,purpose,expires_at,used_at FROM member_tokens WHERE token_hash=?",
        )
        .bind(digest(token))
        .first<{
          member_id: string;
          purpose: string;
          expires_at: string;
          used_at: string | null;
        }>();
      if (!t || t.used_at || t.expires_at <= new Date().toISOString())
        throw new HttpError(
          "This account link is expired or already used. Request another link.",
          403,
        );
      const m = await db
        .prepare("SELECT enabled FROM members WHERE id=? FOR UPDATE")
        .bind(t.member_id)
        .first<{ enabled: number }>();
      if (!m?.enabled) throw new HttpError("Account is disabled", 403);
      const locked = await db
        .prepare(
          "SELECT used_at,expires_at FROM member_tokens WHERE token_hash=? FOR UPDATE",
        )
        .bind(digest(token))
        .first<{ used_at: string | null; expires_at: string }>();
      if (
        !locked ||
        locked.used_at ||
        locked.expires_at <= new Date().toISOString()
      )
        throw new HttpError(
          "This account link is expired or already used. Request another link.",
          403,
        );
      const now = new Date().toISOString();
      await db
        .prepare(
          "UPDATE members SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?),auth_version=auth_version+1 WHERE id=?",
        )
        .bind(passwordHash, now, t.member_id)
        .run();
      await db
        .prepare(
          "UPDATE member_tokens SET used_at=? WHERE member_id=? AND used_at IS NULL",
        )
        .bind(now, t.member_id)
        .run();
      await db
        .prepare("DELETE FROM member_sessions WHERE member_id=?")
        .bind(t.member_id)
        .run();
    });
    return Response.json({
      message: "Email verified and password saved. You can now sign in.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
