import { database, requireAdmin, errorResponse } from "../../../../lib";
import { readJson } from "../../../../../server/security";
import { transaction, audit } from "../../../../../server/database";
import { createMemberForRegistration } from "../../../../../server/members";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(true);
    await readJson(req);
    const rows = await database()
      .prepare(
        "SELECT r.id FROM registrations r JOIN payments p ON p.id=r.payment_id LEFT JOIN members m ON m.registration_id=r.id LEFT JOIN members e ON e.email=p.email AND e.mode=p.mode WHERE m.id IS NULL AND e.id IS NULL ORDER BY r.created_at LIMIT 100",
      )
      .all<{ id: string }>();
    let created = 0,
      duplicates = 0;
    for (const row of rows.results) {
      const result = await transaction((db) =>
        createMemberForRegistration(row.id, db),
      );
      created += Number(result.created);
      duplicates += Number(result.duplicate);
    }
    await audit(
      admin.email,
      "members.migrated",
      JSON.stringify({ created, duplicates }),
    );
    return Response.json({
      created,
      duplicates,
      message: `Created ${created} accounts. ${duplicates} registrations share an existing member email/mode and were skipped. No registration or payment was repeated.`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
