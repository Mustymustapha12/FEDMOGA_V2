import { timingSafeEqual } from "node:crypto";
import { digest, HttpError } from "../../../../server/security";
import { errorResponse } from "../../../lib";
import { scheduleDuesReminders } from "../../../../server/reminders";
import { processMailJobs } from "../../../../server/mail-jobs";
export async function POST(req: Request) {
  try {
    const expected = process.env.JOB_SECRET;
    const actual = req.headers.get("authorization") || "";
    if (
      !expected ||
      expected.length < 32 ||
      !timingSafeEqual(
        Buffer.from(digest(actual)),
        Buffer.from(digest("Bearer " + expected)),
      )
    )
      throw new HttpError("Unauthorized scheduler", 401);
    const scheduled = await scheduleDuesReminders();
    return Response.json({ ...scheduled, ...(await processMailJobs(5)) });
  } catch (e) {
    return errorResponse(e);
  }
}
