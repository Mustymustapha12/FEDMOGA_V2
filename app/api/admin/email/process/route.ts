import { requireAdmin, errorResponse } from "../../../../lib";
import { readJson } from "../../../../../server/security";
import { database, audit } from "../../../../../server/database";
import { processMailJobs } from "../../../../../server/mail-jobs";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(true);
    const body = await readJson(req);
    if (body.retryFailed === true) {
      await database()
        .prepare(
          "UPDATE email_jobs SET status='PENDING',attempts=0,available_at=?,locked_until=NULL WHERE status='FAILED'",
        )
        .bind(new Date().toISOString())
        .run();
      await audit(admin.email, "email_jobs.retry_failed");
    }
    return Response.json(await processMailJobs(5));
  } catch (e) {
    return errorResponse(e);
  }
}
