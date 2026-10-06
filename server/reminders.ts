import { database } from "./database";
import { Member } from "./members";
import { today, addDays, periodEnd, validPlan } from "./calendar";
import { brandedMail, enqueueMail } from "./mail-jobs";
export async function scheduleDuesReminders(date = today()) {
  let queued = 0;
  const rows = await database()
    .prepare(
      "SELECT * FROM members WHERE enabled=1 AND email_verified_at IS NOT NULL",
    )
    .all<Member>();
  for (const m of rows.results) {
    const plan = validPlan(m.preferred_plan) ? m.preferred_plan : "monthly",
      due = m.paid_until || periodEnd(m.created_at.slice(0, 10), plan);
    if (
      ![
        addDays(due, -7),
        addDays(due, -1),
        due,
        addDays(due, 1),
        addDays(due, 7),
        addDays(due, 30),
      ].includes(date)
    )
      continue;
    await enqueueMail(
      `dues-reminder:${m.id}:${due}:${date}`,
      brandedMail(m.email, "FEDMOGA dues reminder", "Your membership dues", [
        "Hello " + m.name + ".",
        "Your membership payment date is " + due + ".",
        date > due
          ? "Your membership dues are overdue. Sign in to renew."
          : "Sign in to renew before the due date.",
        "Choose monthly, quarterly or annual payment. There are no automatic deductions.",
      ]),
      database(),
      m.id,
    );
    queued++;
  }
  return { eligible: queued };
}
