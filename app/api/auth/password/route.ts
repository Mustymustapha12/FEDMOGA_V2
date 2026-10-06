import { database, errorResponse, requireAdmin } from "../../../lib";
import {
  readJson,
  validatePassword,
  verifyPassword,
  hashPassword,
  HttpError,
} from "../../../../server/security";
import { audit } from "../../../../server/database";
import { endSession } from "../../../../server/auth";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(),
      { currentPassword, newPassword } = await readJson(req);
    validatePassword(newPassword);
    const row = await database()
      .prepare("SELECT password_hash FROM admins WHERE id=?")
      .bind(admin.id)
      .first<{ password_hash: string }>();
    if (
      typeof currentPassword !== "string" ||
      !row ||
      !(await verifyPassword(currentPassword, row.password_hash))
    )
      throw new HttpError("Current password is incorrect", 403);
    await database()
      .prepare(
        "UPDATE admins SET password_hash=?,auth_version=auth_version+1 WHERE id=?",
      )
      .bind(await hashPassword(newPassword), admin.id)
      .run();
    await audit(admin.email, "password.changed", admin.id);
    await endSession();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
