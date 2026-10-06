import { requireAdmin, errorResponse } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import { transaction } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(true),
      { id, confirmation } = await readJson(req);
    if (confirmation !== "DELETE MANUAL TEST ENTRY")
      throw new HttpError(
        "Confirm that this manual entry was practice data by typing DELETE MANUAL TEST ENTRY",
      );
    if (typeof id !== "string" || !id) throw new HttpError("Invalid payment");
    const result = await transaction(async (db) => {
      const p = await db
        .prepare(
          "SELECT p.id,p.mode FROM payments p JOIN manual_payments m ON m.payment_id=p.id WHERE p.id=? FOR UPDATE",
        )
        .bind(id)
        .first<{ id: string; mode: string }>();
      if (!p)
        throw new HttpError(
          "Manual entry not found. This action cannot delete Paystack payments.",
          404,
        );
      const registrations = (
        await db
          .prepare("DELETE FROM registrations WHERE payment_id=?")
          .bind(id)
          .run()
      ).meta.changes;
      await db.prepare("DELETE FROM payments WHERE id=?").bind(id).run();
      await db
        .prepare(
          "INSERT INTO audit_logs(id,actor,action,target,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          admin.email,
          "manual_test_entry.deleted",
          JSON.stringify({ id, originalMode: p.mode, registrations }),
          new Date().toISOString(),
        )
        .run();
      return { registrations };
    });
    return Response.json({
      message: `Deleted the manual practice payment and ${result.registrations} registrations. Its registration link is invalidated.`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
