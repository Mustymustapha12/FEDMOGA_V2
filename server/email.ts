import nodemailer from "nodemailer";
import { readFile } from "node:fs/promises";
import { brandedMail } from "./mail-branding";
import { appOrigin, HttpError } from "./security";
import { database } from "./database";
export async function sendContinuation(
  reference: string,
  token: string,
  force = false,
) {
  const p = await database()
    .prepare(
      "SELECT email,email_sent_at,completed FROM payments WHERE reference=?",
    )
    .bind(reference)
    .first<{
      email: string;
      email_sent_at: string | null;
      completed: number;
    }>();
  if (!p || p.completed || (!force && p.email_sent_at)) return;
  const mail = brandedMail(
    p.email,
    "Complete your FEDMOGA registration",
    "Your registration payment is confirmed",
    [
      "Complete your registration using this private, single-use link.",
      "Reference: " + reference,
      "This link expires after 30 days. Do not share it.",
    ],
    appOrigin() + "/?continue=" + encodeURIComponent(token),
    "Complete registration",
  );
  await sendEmail(
    p.email,
    "Complete your FEDMOGA registration",
    `Your payment has been verified.\n\nComplete your registration using this private, single-use link:\n${appOrigin()}/?continue=${encodeURIComponent(token)}\n\nReference: ${reference}\nThe link expires after 30 days. Do not share it.\n\nFEDMOGA — Knowledge, Discipline and Unity`,
    mail.html,
  );
  await database()
    .prepare("UPDATE payments SET email_sent_at=? WHERE reference=?")
    .bind(new Date().toISOString(), reference)
    .run();
}

export function emailConfiguration() {
  const missing = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ].filter((name) => !process.env[name]?.trim());
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    missing.push("SMTP_PORT");
  return { configured: missing.length === 0, missing };
}
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
) {
  const config = emailConfiguration();
  if (!config.configured)
    throw new HttpError(
      "Configure email delivery in Hostinger: " + config.missing.join(", "),
      503,
    );
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    let brandedHtml =
      html || brandedMail(to, subject, subject, text.split("\n\n")).html;
    if (!brandedHtml.includes("cid:fedmoga-logo"))
      brandedHtml = brandedHtml.replace(
        /<body([^>]*)>/i,
        '<body$1><div style="padding:24px;background:#125333"><img src="cid:fedmoga-logo" width="80" height="80" alt="FEDMOGA logo"></div>',
      );
    const logo = await readFile(process.cwd() + "/public/logo.jpg");
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html: brandedHtml,
      attachments: [
        {
          filename: "fedmoga-logo.jpg",
          content: logo,
          contentType: "image/jpeg",
          cid: "fedmoga-logo",
          contentDisposition: "inline",
        },
      ],
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new HttpError(
        "The email server rejected the recipient. Check the mailbox and sender settings.",
        503,
      );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = (error as { code?: string }).code;
    throw new HttpError(
      code === "EAUTH"
        ? "Email authentication failed. Check SMTP_USER and SMTP_PASSWORD."
        : code === "EENVELOPE"
          ? "Email sender or recipient was rejected. Check SMTP_FROM and the mailbox."
          : "Unable to send email. Check the SMTP host, port, TLS settings and mailbox credentials.",
      503,
    );
  } finally {
    transport.close();
  }
}
