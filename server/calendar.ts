export type Plan = "monthly" | "quarterly" | "annually";
export const plans: Plan[] = ["monthly", "quarterly", "annually"];
export function validPlan(value: unknown): value is Plan {
  return plans.includes(value as Plan);
}
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function parse(date: string) {
  return new Date(date + "T12:00:00Z");
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
export function periodEnd(date: string, plan: Plan) {
  const d = parse(date),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  return iso(
    new Date(
      Date.UTC(
        y,
        plan === "monthly"
          ? m + 1
          : plan === "quarterly"
            ? (Math.floor(m / 3) + 1) * 3
            : 12,
        0,
        12,
      ),
    ),
  );
}
export function renewalPeriod(
  paidUntil: string | null,
  plan: Plan,
  date = today(),
) {
  const start = paidUntil && paidUntil >= date ? addDays(paidUntil, 1) : date;
  return { start, end: periodEnd(start, plan) };
}
export function membershipStatus(
  paidUntil: string | null,
  createdAt: string,
  enabled: number,
  graceDays: number,
  date = today(),
): "active" | "overdue" | "inactive" {
  if (!enabled) return "inactive";
  if (paidUntil && paidUntil >= date) return "active";
  const anchor = paidUntil ? addDays(paidUntil, 1) : createdAt.slice(0, 10);
  return date <= addDays(anchor, graceDays) ? "overdue" : "inactive";
}
