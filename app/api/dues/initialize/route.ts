import { errorResponse } from "../../../lib";
import { requireMember } from "../../../../server/member-auth";
import { readJson, rateLimit } from "../../../../server/security";
import { initializeDues } from "../../../../server/dues";
export async function POST(req: Request) {
  try {
    const m = await requireMember(),
      { plan } = await readJson(req);
    await rateLimit("dues-checkout:" + m.id, 10);
    return Response.json(await initializeDues(m, plan));
  } catch (e) {
    return errorResponse(e);
  }
}
