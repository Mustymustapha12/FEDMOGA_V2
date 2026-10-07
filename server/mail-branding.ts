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
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f3;font-family:Arial,sans-serif;color:#203b2b"><table role="presentation" width="100%" cellpadding="24"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:white;border-radius:16px;overflow:hidden" cellpadding="28"><tr><td style="background:#125333;color:white"><img src="cid:fedmoga-logo" alt="FEDMOGA logo" width="80" height="80" style="display:block;border-radius:12px;background:white;margin-bottom:14px"><strong style="font-size:25px">FEDMOGA</strong><br>Federal Government Girls College Minjibir Old Girls Association<br>Knowledge, Discipline and Unity</td></tr><tr><td><h1 style="font-size:25px">${escapeHtml(title)}</h1>${lines.map((line) => `<p style="line-height:1.6">${escapeHtml(line)}</p>`).join("")}<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#125333;color:white;padding:14px 22px;text-decoration:none;border-radius:8px;display:inline-block">${escapeHtml(button)}</a></p><p style="font-size:12px;color:#68756c">This email relates to your FEDMOGA registration or membership. Keep private account links confidential.</p></td></tr></table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}
