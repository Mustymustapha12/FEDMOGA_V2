import { randomBytes } from "node:crypto";
import { database, transaction } from "./database";
import { HttpError, validEmail, appOrigin } from "./security";
import { hashToken, encryptToken, decryptToken } from "../app/lib";
import { verifyPayment } from "../app/paystack";
export type ManualEntry = {
  name: string;
  email: string;
  phone: string;
  amount: string;
  paidDate: string;
  externalReference: string;
};
export function validateManualEntry(value: any): ManualEntry {
  const name = String(value?.name || "").trim(),
    email = String(value?.email || "")
      .trim()
      .toLowerCase(),
    phone = String(value?.phone || "").trim(),
    amount = String(value?.amount || "").trim(),
    paidDate = String(value?.paidDate || "").trim(),
    externalReference = String(value?.externalReference || "")
      .trim()
      .toUpperCase();
  if (
    name.length < 2 ||
    name.length > 160 ||
    !validEmail(email) ||
    phone.length < 7 ||
    phone.length > 30
  )
    throw new HttpError("Enter a valid name, email and phone number");
  // Whole naira keeps compatibility with the existing BIGINT amount column.
  if (
    !/^[0-9]{1,8}$/.test(amount) ||
    Number(amount) < 1 ||
    Number(amount) > 10000000
  )
    throw new HttpError(
      "Enter the amount actually paid, in whole naira between 1 and 10000000",
    );
  const parsed = new Date(paidDate + "T00:00:00.000Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(paidDate) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== paidDate ||
    paidDate > new Date().toISOString().slice(0, 10)
  )
    throw new HttpError("Enter a valid payment date that is not in the future");
  if (!/^[A-Z0-9][A-Z0-9._:/-]{2,99}$/.test(externalReference))
    throw new HttpError(
      "Enter a unique bank or payment reference (3–100 letters, numbers, dots, slashes, colons or hyphens)",
    );
  return {
    name,
    email,
    phone,
    amount: String(Number(amount)),
    paidDate,
    externalReference,
  };
}
async function checkDuplicate(entry: ManualEntry, db = database()) {
  if (
    (await db
      .prepare(
        "SELECT payment_id FROM manual_payments WHERE external_reference=?",
      )
      .bind(entry.externalReference)
      .first()) ||
    (await db
      .prepare("SELECT id FROM payments WHERE reference=?")
      .bind(entry.externalReference)
      .first())
  )
    throw new HttpError(
      "Payment reference already exists: " + entry.externalReference,
      409,
    );
}
export async function reviewManualEntries(values: unknown[]) {
  if (!Array.isArray(values) || !values.length || values.length > 100)
    throw new HttpError("Import between 1 and 100 payments at a time");
  const seen = new Set<string>();
  const entries: ManualEntry[] = [];
  for (let i = 0; i < values.length; i++) {
    try {
      const entry = validateManualEntry(values[i]);
      if (seen.has(entry.externalReference))
        throw new HttpError(
          "Duplicate reference in this import: " + entry.externalReference,
          409,
        );
      seen.add(entry.externalReference);
      await checkDuplicate(entry);
      entries.push(entry);
    } catch (e) {
      if (e instanceof HttpError)
        throw new HttpError(`Row ${i + 1}: ${e.message}`, e.status);
      throw e;
    }
  }
  return entries;
}
export async function approveManualPayments(
  values: unknown[],
  actor: string,
  mode: unknown,
) {
  if (mode !== "test" && mode !== "live")
    throw new HttpError("Choose test or live records");
  const entries = await reviewManualEntries(values);
  try {
    return await transaction(async (db) => {
      const results = [];
      for (const entry of entries) {
        await checkDuplicate(entry, db);
        const id = crypto.randomUUID(),
          reference = "FEDMOGA-MANUAL-" + crypto.randomUUID(),
          token = randomBytes(32).toString("hex"),
          now = new Date().toISOString();
        await db
          .prepare(
            "INSERT INTO payments(id,full_name,email,phone,amount,status,created_at,completed,reference,mode,amount_kobo,token_hash,token_cipher,token_expires_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            entry.name,
            entry.email,
            entry.phone,
            Number(entry.amount),
            "SUCCESS",
            now,
            0,
            reference,
            mode,
            Number(entry.amount) * 100,
            await hashToken(token),
            await encryptToken(token),
            new Date(Date.now() + 30 * 86400_000).toISOString(),
            entry.paidDate + "T00:00:00.000Z",
          )
          .run();
        await db
          .prepare(
            "INSERT INTO manual_payments(payment_id,external_reference,approved_by,approved_at) VALUES(?,?,?,?)",
          )
          .bind(id, entry.externalReference, actor, now)
          .run();
        await db
          .prepare(
            "INSERT INTO audit_logs(id,actor,action,target,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), actor, "manual_payment.approved", id, now)
          .run();
        results.push({
          ...entry,
          id,
          reference,
          registrationUrl: new URL(
            "/?continue=" + token,
            appOrigin(),
          ).toString(),
        });
      }
      return results;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY")
      throw new HttpError(
        "A payment reference was already imported. No payments in this batch were added.",
        409,
      );
    throw e;
  }
}
// Only an approved manual record bypasses external Paystack verification.
export async function registrationToken(
  reference: string,
): Promise<string | null> {
  const manual = await database()
    .prepare(
      "SELECT payment_id FROM manual_payments m JOIN payments p ON p.id=m.payment_id WHERE p.reference=?",
    )
    .bind(reference)
    .first();
  if (!manual) return verifyPayment(reference);
  return transaction(async (db) => {
    const p = await db
      .prepare(
        "SELECT id,completed,status,token_cipher,token_expires_at FROM payments WHERE reference=? FOR UPDATE",
      )
      .bind(reference)
      .first<{
        id: string;
        completed: number;
        status: string;
        token_cipher: string | null;
        token_expires_at: string | null;
      }>();
    if (!p || p.status !== "SUCCESS")
      throw new HttpError("Approved payment not found", 404);
    if (p.completed) return null;
    if (
      p.token_cipher &&
      p.token_expires_at &&
      new Date(p.token_expires_at) > new Date()
    )
      return decryptToken(p.token_cipher);
    const token = randomBytes(32).toString("hex");
    await db
      .prepare(
        "UPDATE payments SET token_hash=?,token_cipher=?,token_expires_at=?,email_sent_at=NULL WHERE id=?",
      )
      .bind(
        await hashToken(token),
        await encryptToken(token),
        new Date(Date.now() + 30 * 86400_000).toISOString(),
        p.id,
      )
      .run();
    return token;
  });
}
export function parseManualCsv(text: unknown): unknown[] {
  if (typeof text !== "string" || text.length > 60000)
    throw new HttpError("CSV must be smaller than 60 KB");
  const input = text.replace(/^\uFEFF/, ""),
    rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      if (field || closed) throw new HttpError("Invalid CSV quoting");
      quoted = true;
      continue;
    }
    if (ch === "," || ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (ch !== ",") {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (ch === "\r" && input[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closed) throw new HttpError("Invalid text after CSV quote");
    field += ch;
  }
  if (quoted) throw new HttpError("Unclosed CSV quote");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim().toLowerCase()),
    required = ["name", "email", "phone", "amount", "paid_date", "reference"];
  if (
    !headers ||
    headers.length !== 6 ||
    new Set(headers).size !== 6 ||
    required.some((h) => !headers.includes(h))
  )
    throw new HttpError(
      "CSV needs these six columns: name,email,phone,amount,paid_date,reference",
    );
  return rows.map((values, i) => {
    if (values.length !== 6)
      throw new HttpError(`CSV row ${i + 2} needs six columns`);
    const v = Object.fromEntries(headers.map((h, j) => [h, values[j]]));
    return {
      name: v.name,
      email: v.email,
      phone: v.phone,
      amount: v.amount,
      paidDate: v.paid_date,
      externalReference: v.reference,
    };
  });
}
