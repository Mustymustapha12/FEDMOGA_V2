import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { database } from "./database";
const scrypt = promisify(scryptCallback);
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new HttpError("Application URL is not configured", 503);
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  )
    throw new HttpError("APP_URL must be an HTTPS URL in production", 503);
  return url.origin;
}
export function assertSameOrigin(req: Request) {
  if (req.headers.get("origin") !== appOrigin())
    throw new HttpError("Request origin is not allowed", 403);
}
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  assertSameOrigin(req);
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError("JSON required", 415);
  if (Number(req.headers.get("content-length") || 0) > 65536)
    throw new HttpError("Request too large", 413);
  const body = await req.text();
  if (body.length > 65536) throw new HttpError("Request too large", 413);
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new HttpError("Invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError("Invalid request");
  return value;
}
export function validatePassword(
  password: unknown,
): asserts password is string {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    throw new HttpError("Use a password between 12 and 128 characters");
}
export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (password.length > 128) return false;
  const [algorithm, salt, hash] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function validEmail(value: unknown) {
  return (
    typeof value === "string" &&
    value.length <= 255 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
      value,
    )
  );
}
export async function rateLimit(
  key: string,
  limit = 10,
  windowMs = 15 * 60_000,
) {
  const id = digest(key),
    now = Date.now(),
    db = database();
  // Increment is atomic and shared across all app instances; clients cannot reset it.
  await db
    .prepare(
      "INSERT INTO rate_limits(id,attempts,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at<=?,1,attempts+1),expires_at=IF(expires_at<=?,VALUES(expires_at),expires_at)",
    )
    .bind(id, now + windowMs, now, now)
    .run();
  const row = await db
    .prepare("SELECT attempts FROM rate_limits WHERE id=?")
    .bind(id)
    .first<{ attempts: number }>();
  if ((row?.attempts || 0) > limit)
    throw new HttpError("Too many attempts. Please try again later.", 429);
}
