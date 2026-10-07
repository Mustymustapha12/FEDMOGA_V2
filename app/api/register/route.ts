import { processMailJobs } from "../../../server/mail-jobs";
import { emailConfiguration } from "../../../server/email";
import { createMemberForRegistration } from "../../../server/members";
import { errorResponse, setting, hashToken } from "../../lib";
import { readJson, HttpError } from "../../../server/security";
import { transaction } from "../../../server/database";
import { defaultSections, validateAnswers } from "../../../server/form";
export async function POST(req: Request) {
  try {
    const { paymentId, answers, token } = await readJson(req);
    if (
      typeof paymentId !== "string" ||
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token)
    )
      throw new HttpError("A verified payment link is required", 403);
    const raw = await setting("form"),
      sections = raw ? JSON.parse(raw).sections : defaultSections;
    const result = await transaction(async (db) => {
      const p = await db
        .prepare(
          "SELECT id,full_name,phone,email,completed,token_hash,token_expires_at,status,mode FROM payments WHERE id=? FOR UPDATE",
        )
        .bind(paymentId)
        .first<{
          id: string;
          email: string;
          full_name: string;
          phone: string;
          completed: number;
          token_hash: string | null;
          token_expires_at: string | null;
          status: string;
          mode: string;
        }>();
      if (
        !p ||
        p.completed ||
        p.status !== "SUCCESS" ||
        !p.token_hash ||
        (await hashToken(token)) !== p.token_hash ||
        !p.token_expires_at ||
        new Date(p.token_expires_at) <= new Date()
      )
        throw new HttpError(
          "This payment link is invalid, expired or already used",
          403,
        );
      const clean = validateAnswers(
          sections,
          {
            ...(answers &&
            typeof answers === "object" &&
            !Array.isArray(answers)
              ? answers
              : {}),
            fullName: p.full_name,
            email: p.email,
            phone: p.phone,
          },
          p.email,
        ),
        id = crypto.randomUUID(),
        number =
          "FEDMOGA-" +
          (p.mode === "test" ? "TEST-" : "") +
          new Date().getUTCFullYear() +
          "-" +
          crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
      await db
        .prepare(
          "INSERT INTO registrations(id,payment_id,number,answers,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          id,
          paymentId,
          number,
          JSON.stringify(clean),
          new Date().toISOString(),
        )
        .run();
      await createMemberForRegistration(id, db);
      await db
        .prepare(
          "UPDATE payments SET completed=1,token_hash=NULL,token_cipher=NULL,token_expires_at=NULL WHERE id=?",
        )
        .bind(paymentId)
        .run();
      return { id, number };
    });
    if (emailConfiguration().configured) {
      try {
        await processMailJobs(1);
      } catch {
        console.error("Account email queued for retry");
      }
    }
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
