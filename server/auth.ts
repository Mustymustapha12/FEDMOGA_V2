import { ConfigurationError } from "./diagnostics";
import type { RowDataPacket } from "mysql2/promise";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { database, ensureDatabase, getPool } from "./database";
import { digest, hashPassword, HttpError, validEmail } from "./security";
export type Admin = {
  id: string;
  email: string;
  role: "ADMIN" | "SUPER_ADMIN";
  active: number;
  auth_version: number;
};
export const SESSION_COOKIE = "fedmoga_session";
export async function bootstrapAdmin() {
  await ensureDatabase();
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    const count = await database()
      .prepare("SELECT count(*) AS n FROM admins")
      .first<{ n: number }>();
    if (count?.n === 0) {
      const missing = ["SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD"].filter(
        (name) => !process.env[name],
      );
      throw new ConfigurationError(
        "SUPER_ADMIN_CONFIG_MISSING",
        "Initial Super Admin credentials are missing. Set " +
          missing.join(", ") +
          " in Hostinger and restart.",
        missing,
      );
    }
    return;
  }
  const connection = await getPool().getConnection();
  try {
    const [[lock]] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?,10) AS acquired",
      ["fedmoga-bootstrap:" + digest(process.env.DB_NAME || "").slice(0, 32)],
    );
    if (!(lock as { acquired: number }).acquired)
      throw new HttpError("Setup is busy. Try again.", 503);
    const [[count]] = await connection.query<RowDataPacket[]>(
      "SELECT count(*) AS n FROM admins",
    );
    if ((count as { n: number }).n === 0) {
      if (!validEmail(email))
        throw new HttpError("Initial Super Admin email is invalid", 503);
      const hashed = await hashPassword(password);
      await connection.execute(
        "INSERT INTO admins(id,email,password_hash,role,active,created_at) VALUES(?,?,?,'SUPER_ADMIN',1,?)",
        [crypto.randomUUID(), email, hashed, new Date().toISOString()],
      );
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [
      "fedmoga-bootstrap:" + digest(process.env.DB_NAME || "").slice(0, 32),
    ]);
    connection.release();
  }
}
export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return database()
    .prepare(
      "SELECT a.id,a.email,a.role,a.active,a.auth_version FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1 AND s.auth_version=a.auth_version",
    )
    .bind(digest(token), new Date().toISOString())
    .first<Admin>();
}
export async function requireAdmin(superOnly = false) {
  const admin = await currentAdmin();
  if (!admin) throw new HttpError("Please sign in", 401);
  if (superOnly && admin.role !== "SUPER_ADMIN")
    throw new HttpError("Super Admin access required", 403);
  return admin;
}
export async function startSession(admin: Admin) {
  const token = randomBytes(32).toString("hex"),
    expires = new Date(Date.now() + 8 * 3600_000);
  await database()
    .prepare(
      "INSERT INTO sessions(token_hash,admin_id,auth_version,expires_at) VALUES(?,?,?,?)",
    )
    .bind(digest(token), admin.id, admin.auth_version, expires.toISOString())
    .run();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}
export async function endSession() {
  const jar = await cookies(),
    token = jar.get(SESSION_COOKIE)?.value;
  if (token)
    await database()
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(digest(token))
      .run();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
