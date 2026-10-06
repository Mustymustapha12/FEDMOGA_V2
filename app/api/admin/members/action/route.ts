import { database, requireAdmin, errorResponse } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import { transaction, audit } from "../../../../../server/database";
import { Member, issueAccountLink } from "../../../../../server/members";
import { enqueueMail, brandedMail } from "../../../../../server/mail-jobs";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      { id, action, enabled } = await readJson(req);
    if (typeof id !== "string") throw new HttpError("Invalid member");
    const m = await database()
      .prepare("SELECT * FROM members WHERE id=?")
      .bind(id)
      .first<Member>();
    if (!m) throw new HttpError("Member not found", 404);
    if (action === "activation")
      await transaction((db) =>
        issueAccountLink(m, m.email_verified_at ? "reset" : "activation", db),
      );
    else if (action === "reminder")
      await enqueueMail(
        "admin-dues:" + m.id + ":" + crypto.randomUUID(),
        brandedMail(
          m.email,
          "FEDMOGA membership dues reminder",
          "Membership reminder",
          [
            "Hello " + m.name + ".",
            m.paid_until
              ? "Your paid-through date is " + m.paid_until + "."
              : "Your registration is complete, but membership dues have not been paid.",
            "Sign in to review your dues and choose monthly, quarterly or annual payment.",
          ],
        ),
        database(),
        m.id,
      );
    else if (action === "enabled") {
      if (admin.role !== "SUPER_ADMIN" || typeof enabled !== "boolean")
        throw new HttpError("Super Admin access required", 403);
      await database()
        .prepare(
          "UPDATE members SET enabled=?,auth_version=auth_version+1 WHERE id=?",
        )
        .bind(enabled ? 1 : 0, m.id)
        .run();
    } else throw new HttpError("Unknown action");
    await audit(admin.email, "member." + action, m.id);
    return Response.json({
      message:
        action === "enabled"
          ? "Member access updated"
          : "Email queued for delivery",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
