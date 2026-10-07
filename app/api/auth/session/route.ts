import { currentAdmin } from "../../../../server/auth";
import { requireMember } from "../../../../server/member-auth";
import { errorResponse } from "../../../lib";
import { HttpError } from "../../../../server/security";
export async function GET() {
  try {
    const admin = await currentAdmin();
    if (admin)
      return Response.json(
        { authenticated: true, role: admin.role, redirect: "/admin" },
        { headers: { "Cache-Control": "no-store" } },
      );
    try {
      await requireMember();
      return Response.json(
        { authenticated: true, role: "MEMBER", redirect: "/member" },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 401) throw e;
      return Response.json(
        { authenticated: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (e) {
    return errorResponse(e);
  }
}
