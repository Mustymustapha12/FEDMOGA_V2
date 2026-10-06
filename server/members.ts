import { randomBytes } from "node:crypto";
import { database } from "./database";
import { appOrigin, digest } from "./security";
import { brandedMail, enqueueMail } from "./mail-jobs";
export type Member = {
  id: string;
  registration_id: string;
  email: string;
  name: string;
  phone: string;
  mode: "test" | "live";
  password_hash: string | null;
  email_verified_at: string | null;
  enabled: number;
  auth_version: number;
  preferred_plan: string;
  paid_until: string | null;
  created_at: string;
};
export async function issueAccountLink(
  member: Member,
  purpose: "activation" | "reset",
  db = database(),
) {
  const token = randomBytes(32).toString("hex"),
    now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE member_tokens SET used_at=? WHERE member_id=? AND purpose=? AND used_at IS NULL",
    )
    .bind(now, member.id, purpose)
    .run();
  await db
    .prepare(
      "INSERT INTO member_tokens(token_hash,member_id,purpose,expires_at) VALUES(?,?,?,?)",
    )
    .bind(
      digest(token),
      member.id,
      purpose,
      new Date(Date.now() + 24 * 3600000).toISOString(),
    )
    .run();
  const url = appOrigin() + "/member?account=" + token;
  await enqueueMail(
    purpose + ":" + digest(token),
    brandedMail(
      member.email,
      purpose === "reset"
        ? "Reset your FEDMOGA password"
        : "Welcome to FEDMOGA — activate your account",
      purpose === "reset"
        ? "Reset your password"
        : "Your member account is ready",
      [
        "Hello " + member.name + ".",
        purpose === "reset"
          ? "Use this private link to choose a new password."
          : "Your registration is complete. Verify your email and set your password to access your account, pay dues and track receipts.",
        "This single-use link expires in 24 hours. If you did not request it, ignore this email.",
      ],
      url,
      "Set my password",
    ),
    db,
    member.id,
  );
  return token;
}
export async function createMemberForRegistration(
  registrationId: string,
  db = database(),
) {
  const row = await db
    .prepare(
      "SELECT r.id,r.created_at,p.email,p.full_name as name,p.phone,p.mode FROM registrations r JOIN payments p ON p.id=r.payment_id WHERE r.id=?",
    )
    .bind(registrationId)
    .first<{
      id: string;
      created_at: string;
      email: string;
      name: string;
      phone: string;
      mode: "test" | "live";
    }>();
  if (!row) return { created: false, duplicate: false };
  if (
    await db
      .prepare("SELECT id FROM members WHERE registration_id=?")
      .bind(row.id)
      .first()
  )
    return { created: false, duplicate: false };
  if (
    await db
      .prepare("SELECT id FROM members WHERE email=? AND mode=?")
      .bind(row.email, row.mode)
      .first()
  )
    return { created: false, duplicate: true };
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO members(id,registration_id,email,name,phone,mode,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(id, row.id, row.email, row.name, row.phone, row.mode, row.created_at)
    .run();
  const member = await db
    .prepare("SELECT * FROM members WHERE id=?")
    .bind(id)
    .first<Member>();
  await issueAccountLink(member!, "activation", db);
  return { created: true, duplicate: false };
}
