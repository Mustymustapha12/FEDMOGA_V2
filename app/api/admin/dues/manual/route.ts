import { requireAdmin, errorResponse, setting } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import { transaction } from "../../../../../server/database";
import { validPlan, today } from "../../../../../server/calendar";
import { finalizeDues } from "../../../../../server/dues";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      input = await readJson(req);
    if (input.confirmed !== true)
      throw new HttpError("Confirm the bank payment was received");
    if (typeof input.memberId !== "string" || !validPlan(input.plan))
      throw new HttpError("Choose a member and plan");
    const amount = String(input.amount || ""),
      date = String(input.paidDate || ""),
      external = String(input.reference || "")
        .trim()
        .toUpperCase();
    if (
      !/^\d{1,8}(\.\d{1,2})?$/.test(amount) ||
      !Number.isSafeInteger(Math.round(Number(amount) * 100)) ||
      Number(amount) <= 0 ||
      Number(amount) > 10000000
    )
      throw new HttpError("Enter a valid amount in naira");
    const parsed = new Date(date + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      date > today()
    )
      throw new HttpError("Enter a valid payment date");
    if (!/^[A-Z0-9][A-Z0-9._:/-]{2,99}$/.test(external))
      throw new HttpError("Enter a unique bank reference");
    const fee = Number(await setting("dues_" + input.plan, "0"));
    if (fee <= 0 || Number(amount) < fee)
      throw new HttpError(
        "The payment must cover the configured dues for this plan",
      );
    const result = await transaction(async (db) => {
      const m = await db
        .prepare(
          "SELECT id,mode FROM members WHERE id=? AND enabled=1 FOR UPDATE",
        )
        .bind(input.memberId)
        .first<{ id: string; mode: string }>();
      if (!m) throw new HttpError("Enabled member not found", 404);
      const duplicate =
        (await db
          .prepare(
            "SELECT payment_id FROM manual_payments WHERE external_reference=?",
          )
          .bind(external)
          .first()) ||
        (await db
          .prepare(
            "SELECT id FROM dues_payments WHERE external_reference=? OR reference=?",
          )
          .bind(external, external)
          .first()) ||
        (await db
          .prepare("SELECT id FROM payments WHERE reference=?")
          .bind(external)
          .first());
      if (duplicate)
        throw new HttpError("Payment reference already exists", 409);
      const id = crypto.randomUUID(),
        reference = "FEDMOGA-DUES-" + crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO dues_payments(id,member_id,reference,external_reference,plan,amount_kobo,mode,source,status,approved_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          m.id,
          reference,
          external,
          input.plan,
          Math.round(Number(amount) * 100),
          m.mode,
          "Manual",
          "PENDING",
          admin.email,
          new Date().toISOString(),
        )
        .run();
      const payment = await finalizeDues(id, date, db);
      await db
        .prepare("UPDATE dues_payments SET paid_at=? WHERE id=?")
        .bind(date + "T00:00:00.000Z", id)
        .run();
      await db
        .prepare(
          "INSERT INTO audit_logs(id,actor,action,target,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          admin.email,
          "dues.manual_approved",
          id,
          new Date().toISOString(),
        )
        .run();
      return payment;
    });
    return Response.json({
      message: "Bank payment approved; membership renewed and receipt queued.",
      payment: result,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY")
      return errorResponse(
        new HttpError("Payment reference already exists", 409),
      );
    return errorResponse(e);
  }
}
