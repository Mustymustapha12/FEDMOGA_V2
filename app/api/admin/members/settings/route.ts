import { requireAdmin, errorResponse, putSetting } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import { transaction } from "../../../../../server/database";
import { plans } from "../../../../../server/calendar";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      input = await readJson(req);
    for (const plan of plans)
      if (
        !Number.isInteger(Number(input[plan])) ||
        Number(input[plan]) < 0 ||
        Number(input[plan]) > 10000000
      )
        throw new HttpError(
          "Each plan must be a whole naira amount between 0 and 10000000. Zero disables that plan.",
        );
    const grace = Number(input.graceDays);
    if (!Number.isInteger(grace) || grace < 0 || grace > 90)
      throw new HttpError("Grace period must be 0–90 days");
    await transaction(async (db) => {
      for (const plan of plans)
        await putSetting("dues_" + plan, String(Number(input[plan])), db);
      await putSetting("dues_grace_days", String(grace), db);
      await db
        .prepare(
          "INSERT INTO audit_logs(id,actor,action,target,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          admin.email,
          "dues.settings_updated",
          "",
          new Date().toISOString(),
        )
        .run();
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
