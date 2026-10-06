import { errorResponse } from "../../../lib";
import { readJson } from "../../../../server/security";
import { endMemberSession } from "../../../../server/member-auth";
export async function POST(req: Request) {
  try {
    await readJson(req);
    await endMemberSession();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
