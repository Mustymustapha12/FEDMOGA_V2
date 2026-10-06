import { database, transaction } from "./database";
import { HttpError, appOrigin } from "./security";
import { setting, paystackKey } from "../app/lib";
import { validateVerifiedPayment } from "./payment-validation";
import { renewalPeriod, plans, validPlan, today } from "./calendar";
import { brandedMail, enqueueMail } from "./mail-jobs";
import { Member } from "./members";
export async function duesConfig() {
  const prices = Object.fromEntries(
    await Promise.all(
      plans.map(async (plan) => [
        plan,
        Number(await setting("dues_" + plan, "0")),
      ]),
    ),
  );
  return { prices, graceDays: Number(await setting("dues_grace_days", "30")) };
}
export type DuesPayment = {
  id: string;
  member_id: string;
  reference: string;
  plan: "monthly" | "quarterly" | "annually";
  amount_kobo: number | string;
  mode: "test" | "live";
  source: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};
export async function finalizeDues(
  id: string,
  date = today(),
  executor?: ReturnType<typeof database>,
  chargedKobo?: number,
) {
  const work = async (db: ReturnType<typeof database>) => {
    const existing = await db
      .prepare("SELECT member_id FROM dues_payments WHERE id=?")
      .bind(id)
      .first<{ member_id: string }>();
    if (!existing) throw new HttpError("Dues payment not found", 404);
    // Every renewal locks the member first, then the payment, so concurrent payments extend once each.
    const member = await db
      .prepare("SELECT * FROM members WHERE id=? FOR UPDATE")
      .bind(existing.member_id)
      .first<Member>();
    if (!member) throw new HttpError("Member not found", 404);
    const p = await db
      .prepare("SELECT * FROM dues_payments WHERE id=? FOR UPDATE")
      .bind(id)
      .first<DuesPayment>();
    if (!p) throw new HttpError("Payment not found", 404);
    if (p.status === "SUCCESS") return p;
    if (p.status !== "PENDING")
      throw new HttpError("Payment is not eligible", 409);
    const period = renewalPeriod(member.paid_until, p.plan, date),
      now = new Date().toISOString();
    await db
      .prepare(
        "UPDATE dues_payments SET status='SUCCESS',paid_at=?,period_start=?,period_end=?,charged_kobo=? WHERE id=?",
      )
      .bind(
        now,
        period.start,
        period.end,
        chargedKobo || Number(p.amount_kobo),
        id,
      )
      .run();
    await db
      .prepare("UPDATE members SET paid_until=?,preferred_plan=? WHERE id=?")
      .bind(period.end, p.plan, member.id)
      .run();
    await enqueueMail(
      "dues-receipt:" + id,
      brandedMail(
        member.email,
        "FEDMOGA dues receipt — " + p.reference,
        "Payment received",
        [
          "Hello " + member.name + ".",
          "Reference: " + p.reference,
          "Dues fee: ₦" + (Number(p.amount_kobo) / 100).toLocaleString("en-NG"),
          "Total paid including any customer-borne fees: ₦" +
            ((chargedKobo || Number(p.amount_kobo)) / 100).toLocaleString(
              "en-NG",
            ),
          "Plan: " + p.plan,
          "Coverage: " + period.start + " to " + period.end,
          "Next payment due: " + period.end,
          "Thank you for supporting the FEDMOGA community.",
        ],
      ),
      db,
      member.id,
    );
    return {
      ...p,
      status: "SUCCESS",
      period_start: period.start,
      period_end: period.end,
    };
  };
  return executor ? work(executor) : transaction(work);
}
export async function verifyDues(reference: string) {
  const p = await database()
    .prepare(
      "SELECT d.*,m.email FROM dues_payments d JOIN members m ON m.id=d.member_id WHERE d.reference=?",
    )
    .bind(reference)
    .first<DuesPayment & { email: string }>();
  if (!p || p.source !== "Paystack")
    throw new HttpError("Paystack dues payment not found", 404);
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
  const verified = await response.json();
  validateVerifiedPayment(verified, p);
  return finalizeDues(p.id, today(), undefined, Number(verified.data.amount));
}
export async function initializeDues(member: Member, plan: unknown) {
  if (!validPlan(plan))
    throw new HttpError("Choose monthly, quarterly or annual dues");
  const amount = Number(await setting("dues_" + plan, "0")) * 100;
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000000)
    throw new HttpError("This dues plan is not configured", 503);
  if (member.mode !== (await setting("paystack_mode", "test")))
    throw new HttpError(
      "Your account's payment mode is not the current checkout mode. Contact FEDMOGA.",
      409,
    );
  if (member.mode === "live" && process.env.ALLOW_LIVE_PAYMENTS !== "true")
    throw new HttpError("Live payments are disabled", 503);
  const id = crypto.randomUUID(),
    reference = "FEDMOGA-DUES-" + crypto.randomUUID();
  await database()
    .prepare(
      "INSERT INTO dues_payments(id,member_id,reference,plan,amount_kobo,mode,source,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      member.id,
      reference,
      plan,
      amount,
      member.mode,
      "Paystack",
      "PENDING",
      new Date().toISOString(),
    )
    .run();
  const response = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (await paystackKey(member.mode)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: member.email,
        amount,
        currency: "NGN",
        reference,
        callback_url: appOrigin() + "/api/dues/callback",
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await response.json();
  if (!response.ok || result.status !== true)
    throw new HttpError("Paystack could not start checkout", 502);
  const url = new URL(result.data.authorization_url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com")
    throw new HttpError("Invalid checkout response", 502);
  return { reference, authorizationUrl: url.toString() };
}
