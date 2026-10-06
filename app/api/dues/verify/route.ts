import { database, errorResponse } from "../../../lib";
import { requireMember } from "../../../../server/member-auth";
import { readJson, HttpError, rateLimit } from "../../../../server/security";
import { verifyDues } from "../../../../server/dues";
export async function POST(req: Request) {
  try {
    const m = await requireMember(),
      { reference } = await readJson(req);
    if (typeof reference !== "string") throw new HttpError("Invalid reference");
    await rateLimit("dues-verify:" + m.id, 20);
    if (
      !(await database()
        .prepare(
          "SELECT id FROM dues_payments WHERE reference=? AND member_id=?",
        )
        .bind(reference, m.id)
        .first())
    )
      throw new HttpError("Payment not found", 404);
    return Response.json(await verifyDues(reference));
  } catch (e) {
    return errorResponse(e);
  }
}
