import { database, transaction } from "./database";
import { encryptToken, decryptToken } from "../app/lib";
import { sendEmail } from "./email";
import { appOrigin } from "./security";
export type Mail = { to: string; subject: string; text: string; html: string };
export function escapeHtml(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function brandedMail(
  to: string,
  subject: string,
  title: string,
  lines: string[],
  link = appOrigin() + "/member",
  button = "Open my account",
): Mail {
  const text = [
    title,
    ...lines,
    link,
    "FEDMOGA · Knowledge, Discipline and Unity",
  ].join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,sans-serif;color:#203b2b"><table role="presentation" width="100%" cellpadding="24"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:white;border-radius:16px;overflow:hidden" cellpadding="28"><tr><td style="background:#125333;color:white"><strong style="font-size:25px">FEDMOGA</strong><br>Knowledge, Discipline and Unity</td></tr><tr><td><h1 style="font-size:25px">${escapeHtml(title)}</h1>${lines.map((line) => `<p style="line-height:1.6">${escapeHtml(line)}</p>`).join("")}<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#125333;color:white;padding:14px 22px;text-decoration:none;border-radius:8px;display:inline-block">${escapeHtml(button)}</a></p><p style="font-size:12px;color:#68756c">This email relates to your FEDMOGA registration or membership. Keep private account links confidential.</p></td></tr></table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}
export async function enqueueMail(
  key: string,
  mail: Mail,
  db = database(),
  memberId: string | null = null,
  paymentId: string | null = null,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT IGNORE INTO email_jobs(id,dedupe_key,member_id,payment_id,payload_cipher,available_at,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      key,
      memberId,
      paymentId,
      await encryptToken(JSON.stringify(mail)),
      now,
      now,
    )
    .run();
}
export async function processMailJobs(limit = 5) {
  const counts = { sent: 0, failed: 0 };
  for (let i = 0; i < Math.min(limit, 10); i++) {
    const job = await transaction(async (db) => {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          "SELECT id,payload_cipher,attempts FROM email_jobs WHERE available_at<=? AND (status='PENDING' OR (status='PROCESSING' AND locked_until<=?)) ORDER BY created_at LIMIT 1 FOR UPDATE",
        )
        .bind(now, now)
        .first<{ id: string; payload_cipher: string; attempts: number }>();
      if (!row) return null;
      await db
        .prepare(
          "UPDATE email_jobs SET status='PROCESSING',locked_until=?,attempts=attempts+1 WHERE id=?",
        )
        .bind(new Date(Date.now() + 5 * 60000).toISOString(), row.id)
        .run();
      return row;
    });
    if (!job) break;
    try {
      const mail = JSON.parse(await decryptToken(job.payload_cipher)) as Mail;
      await sendEmail(mail.to, mail.subject, mail.text, mail.html);
      await database()
        .prepare(
          "UPDATE email_jobs SET status='SENT',sent_at=?,locked_until=NULL,last_error=NULL WHERE id=?",
        )
        .bind(new Date().toISOString(), job.id)
        .run();
      counts.sent++;
    } catch {
      await database()
        .prepare(
          "UPDATE email_jobs SET status=?,available_at=?,locked_until=NULL,last_error=? WHERE id=?",
        )
        .bind(
          job.attempts >= 9 ? "FAILED" : "PENDING",
          new Date(
            Date.now() + Math.min(60, 2 ** job.attempts) * 60000,
          ).toISOString(),
          "Email delivery failed. Check SMTP configuration and provider logs.",
          job.id,
        )
        .run();
      counts.failed++;
    }
  }
  return counts;
}
