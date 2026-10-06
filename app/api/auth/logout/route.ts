import { endSession } from "../../../../server/auth";
import { assertSameOrigin } from "../../../../server/security";
import { errorResponse } from "../../../lib";
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await endSession();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
