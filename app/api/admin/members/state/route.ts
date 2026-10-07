import {
  database,
  requireAdmin,
  errorResponse,
  setting,
} from "../../../../lib";
import { duesConfig } from "../../../../../server/dues";
import {
  membershipStatus,
  renewalPeriod,
  validPlan,
} from "../../../../../server/calendar";
import { Member } from "../../../../../server/members";
export async function GET() {
  try {
    await requireAdmin();
    const db = database(),
      config = await duesConfig(),
      mode = await setting("paystack_mode", "test");
    const rows = await db
      .prepare(
        "SELECT m.*,r.number,r.answers FROM members m JOIN registrations r ON r.id=m.registration_id WHERE m.mode=? ORDER BY m.created_at DESC",
      )
      .bind(mode)
      .all<Member & { number: string; answers: string }>();
    const members = rows.results.map((m) => ({
      id: m.id,
      date: m.created_at,
      answers: m.answers,
      name: m.name,
      email: m.email,
      phone: m.phone,
      mode: m.mode,
      number: m.number,
      enabled: !!m.enabled,
      emailVerified: !!m.email_verified_at,
      preferredPlan: m.preferred_plan,
      paidUntil: m.paid_until,
      status: membershipStatus(
        m.paid_until,
        m.created_at,
        m.enabled,
        config.graceDays,
      ),
      nextAmount:
        config.prices[
          validPlan(m.preferred_plan) ? m.preferred_plan : "monthly"
        ],
    }));
    const payments = await db
      .prepare(
        "SELECT d.*,m.name,m.email FROM dues_payments d JOIN members m ON m.id=d.member_id WHERE d.mode=? ORDER BY d.created_at DESC",
      )
      .bind(mode)
      .all();
    const collections = payments.results
      .filter((p) => p.status === "SUCCESS")
      .reduce((sum, p) => sum + Number(p.amount_kobo) / 100, 0);
    const overdue = members.filter((m) => m.enabled && m.status !== "active");
    const mail = await db
      .prepare(
        "SELECT status,COUNT(*) as total FROM email_jobs GROUP BY status",
      )
      .all();
    const pending = await db
      .prepare(
        "SELECT id,full_name as name,email,phone,amount,reference,mode,created_at as date FROM payments WHERE status='PENDING' AND mode=? ORDER BY created_at DESC",
      )
      .bind(mode)
      .all();
    const unmigrated = await db
      .prepare(
        "SELECT COUNT(*) as total FROM registrations r JOIN payments p ON p.id=r.payment_id LEFT JOIN members m ON m.registration_id=r.id WHERE m.id IS NULL AND p.mode=?",
      )
      .bind(mode)
      .first<{ total: number }>();
    return Response.json(
      {
        mode,
        members,
        payments: payments.results,
        config,
        pending: pending.results,
        mail: mail.results,
        unmigrated: unmigrated?.total || 0,
        report: {
          total: members.length,
          active: members.filter((m) => m.status === "active").length,
          overdue: members.filter((m) => m.status === "overdue").length,
          inactive: members.filter((m) => m.status === "inactive").length,
          collections,
          outstanding: overdue.reduce((sum, m) => sum + m.nextAmount, 0),
          outstandingNote:
            "One next renewal at current configured prices per unpaid member; historical arrears are not charged.",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
