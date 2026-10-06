import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { database } from "../server/database";
import { logFailure } from "../server/diagnostics";
import { HttpError, digest } from "../server/security";
export { database };
export { currentAdmin, requireAdmin } from "../server/auth";
export async function setting(key: string, fallback = "") {
  const row = await database()
    .prepare("SELECT value FROM settings WHERE `key`=?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? fallback;
}
export async function putSetting(key: string, value: string, db = database()) {
  await db
    .prepare(
      "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    )
    .bind(key, value)
    .run();
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  return Response.json(logFailure(e), {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}
function encryptionKey() {
  const raw = process.env.FEDMOGA_ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-f]{64}$/i.test(raw))
    throw new HttpError("Encryption is not configured", 503);
  return Buffer.from(raw, "hex");
}
export async function encryptSecret(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export async function decryptSecret(value: string) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function paystackKey(mode: "test" | "live") {
  const encrypted = await setting("paystack_" + mode + "_secret", "");
  if (!encrypted)
    throw new HttpError(`${mode} Paystack secret key is not configured`, 503);
  return decryptSecret(encrypted);
}
export const hashToken = async (token: string) => digest(token);
export const encryptToken = encryptSecret;
export const decryptToken = decryptSecret;
