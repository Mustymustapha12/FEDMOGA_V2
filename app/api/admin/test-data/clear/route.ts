import { requireAdmin, errorResponse } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import { transaction } from "../../../../../server/database";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(true);
    const { confirmation, registrationId } = await readJson(req);
    if (confirmation !== "DELETE TEST DATA")
      throw new HttpError("Type DELETE TEST DATA to confirm");
    if (registrationId !== undefined && typeof registrationId !== "string")
      throw new HttpError("Invalid registration");
    const result = await transaction(async (db) => {
      let ids: string[];
      if (registrationId) {
        const row = await db
          .prepare(
            "SELECT p.id,p.mode FROM payments p JOIN registrations r ON r.payment_id=p.id WHERE r.id=? FOR UPDATE",
          )
          .bind(registrationId)
          .first<{ id: string; mode: string }>();
        if (!row) throw new HttpError("Registration not found", 404);
        if (row.mode !== "test")
          throw new HttpError(
            "Only test registrations can be deleted with this tool",
            403,
          );
        ids = [row.id];
      } else {
        const rows = await db
          .prepare(
            "SELECT id FROM payments WHERE mode='test' ORDER BY id FOR UPDATE",
          )
          .all<{ id: string }>();
        ids = rows.results.map((row) => row.id);
      }
      let registrations = 0,
        payments = 0;
      for (const id of ids) {
        registrations += (
          await db
            .prepare("DELETE FROM registrations WHERE payment_id=?")
            .bind(id)
            .run()
        ).meta.changes;
        payments += (
          await db
            .prepare("DELETE FROM payments WHERE id=? AND mode='test'")
            .bind(id)
            .run()
        ).meta.changes;
      }
      await db
        .prepare(
          "INSERT INTO audit_logs(id,actor,action,target,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          admin.email,
          "test_data.deleted",
          JSON.stringify({
            registrations,
            payments,
            registrationId: registrationId || null,
          }),
          new Date().toISOString(),
        )
        .run();
      return { registrations, payments };
    });
    return Response.json({
      message: `Deleted ${result.registrations} test registrations and ${result.payments} test payments.`,
      ...result,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
