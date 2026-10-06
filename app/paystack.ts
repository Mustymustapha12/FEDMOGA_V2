import { validateVerifiedPayment } from "../server/payment-validation";
import {
  database,
  paystackKey,
  hashToken,
  encryptToken,
  decryptToken,
} from "./lib";
import { HttpError } from "../server/security";
type Payment = {
  id: string;
  reference: string;
  mode: "test" | "live";
  amount_kobo: number | string;
  email: string;
  status: string;
  token_cipher: string | null;
  completed: number;
  token_expires_at: string | null;
};
export async function verifyPayment(reference: string): Promise<string | null> {
  if (!/^FEDMOGA-[A-Za-z0-9-]{12,80}$/.test(reference))
    throw new HttpError("Invalid reference");
  const db = database(),
    p = await db
      .prepare(
        "SELECT id,reference,mode,amount_kobo,email,status,token_cipher,completed,token_expires_at FROM payments WHERE reference=?",
      )
      .bind(reference)
      .first<Payment>();
  if (!p || !["test", "live"].includes(p.mode))
    throw new HttpError("Unknown payment", 404);
  const response = await fetch(
    "https://api.paystack.co/transaction/verify/" +
      encodeURIComponent(reference),
    {
      headers: { Authorization: "Bearer " + (await paystackKey(p.mode)) },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new HttpError("Paystack verification unavailable", 502);
  const result = await response.json();
  validateVerifiedPayment(result, p);
  if (p.completed) return null;
  if (
    p.status === "SUCCESS" &&
    p.token_cipher &&
    p.token_expires_at &&
    new Date(p.token_expires_at) > new Date()
  )
    return decryptToken(p.token_cipher);
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const update = await db
    .prepare(
      "UPDATE payments SET status='SUCCESS',paid_at=?,token_hash=?,token_cipher=?,token_expires_at=?,email_sent_at=NULL WHERE id=? AND (status='PENDING' OR (status='SUCCESS' AND token_expires_at<=?)) AND completed=0",
    )
    .bind(
      new Date().toISOString(),
      await hashToken(raw),
      await encryptToken(raw),
      new Date(Date.now() + 30 * 86400_000).toISOString(),
      p.id,
      new Date().toISOString(),
    )
    .run();
  if (!update.meta.changes) {
    const latest = await db
      .prepare(
        "SELECT token_cipher,completed,token_expires_at FROM payments WHERE id=?",
      )
      .bind(p.id)
      .first<{ token_cipher: string | null; completed: number }>();
    if (latest?.completed) return null;
    if (latest?.token_cipher) return decryptToken(latest.token_cipher);
    throw new HttpError("Payment state could not be updated", 409);
  }
  return raw;
}
