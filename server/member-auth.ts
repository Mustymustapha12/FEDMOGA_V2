import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { database } from "./database";
import { digest, HttpError } from "./security";
import { Member } from "./members";
const COOKIE = "fedmoga_member_session";
export async function requireMember() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) throw new HttpError("Sign in to your member account", 401);
  const member = await database()
    .prepare(
      "SELECT m.* FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.auth_version=m.auth_version AND s.expires_at>? AND m.enabled=1 AND m.email_verified_at IS NOT NULL",
    )
    .bind(digest(token), new Date().toISOString())
    .first<Member>();
  if (!member)
    throw new HttpError("Your session expired. Please sign in again.", 401);
  return member;
}
export async function startMemberSession(member: Member) {
  const token = randomBytes(32).toString("hex"),
    expires = new Date(Date.now() + 8 * 3600000);
  await database()
    .prepare(
      "INSERT INTO member_sessions(token_hash,member_id,auth_version,expires_at) VALUES(?,?,?,?)",
    )
    .bind(digest(token), member.id, member.auth_version, expires.toISOString())
    .run();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}
export async function endMemberSession() {
  const jar = await cookies(),
    token = jar.get(COOKIE)?.value;
  if (token)
    await database()
      .prepare("DELETE FROM member_sessions WHERE token_hash=?")
      .bind(digest(token))
      .run();
  jar.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
