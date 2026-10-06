import { database, errorResponse } from "../../../lib";
import {
  readJson,
  rateLimit,
  validEmail,
  HttpError,
} from "../../../../server/security";
import { registrationToken } from "../../../../server/manual-payments";
export async function POST(req: Request) {
  try {
    const { email, reference } = await readJson(req);
    if (
      !validEmail(email) ||
      typeof reference !== "string" ||
      !/^FEDMOGA-[A-Za-z0-9-]{12,80}$/.test(reference)
    )
      throw new HttpError("Enter your payment email and reference");
    const normalized = (email as string).trim().toLowerCase();
    await rateLimit("recover:" + normalized, 10, 3600_000);
    const p = await database()
      .prepare(
        "SELECT id FROM payments WHERE email=? AND reference=? AND completed=0",
      )
      .bind(normalized, reference)
      .first();
    if (!p)
      throw new HttpError(
        "No unfinished payment matches that email and reference. Check your details or contact FEDMOGA.",
        404,
      );
    const token = await registrationToken(reference);
    if (!token)
      throw new HttpError(
        "This payment has already been used to register",
        409,
      );
    return Response.json(
      { ok: true, token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
