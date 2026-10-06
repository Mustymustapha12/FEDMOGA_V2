import { database, hashToken, errorResponse } from "../../../lib";
import { readJson, HttpError } from "../../../../server/security";
export async function POST(req: Request) {
  try {
    const { token } = await readJson(req);
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new HttpError("Invalid link", 403);
    const p = await database()
      .prepare(
        "SELECT id,full_name as name,email,phone FROM payments WHERE token_hash=? AND status='SUCCESS' AND completed=0 AND token_expires_at>?",
      )
      .bind(await hashToken(token), new Date().toISOString())
      .first();
    if (!p) throw new HttpError("Expired or used link", 403);
    return Response.json(p, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
