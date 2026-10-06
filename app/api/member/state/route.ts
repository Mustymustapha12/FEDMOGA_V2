import { database, errorResponse } from "../../../lib";
import { requireMember } from "../../../../server/member-auth";
import { duesConfig } from "../../../../server/dues";
import { membershipStatus, today } from "../../../../server/calendar";
export async function GET() {
  try {
    const m = await requireMember(),
      config = await duesConfig();
    const registration = await database()
      .prepare(
        "SELECT r.number,p.amount,p.reference,p.created_at FROM registrations r JOIN payments p ON p.id=r.payment_id WHERE r.id=?",
      )
      .bind(m.registration_id)
      .first();
    const payments = await database()
      .prepare(
        "SELECT id,reference,external_reference,plan,amount_kobo,charged_kobo,source,status,period_start,period_end,paid_at,created_at FROM dues_payments WHERE member_id=? ORDER BY created_at DESC LIMIT 500",
      )
      .bind(m.id)
      .all();
    return Response.json(
      {
        member: {
          id: m.id,
          name: m.name,
          email: m.email,
          phone: m.phone,
          mode: m.mode,
          preferredPlan: m.preferred_plan,
          paidUntil: m.paid_until,
          status: membershipStatus(
            m.paid_until,
            m.created_at,
            m.enabled,
            config.graceDays,
          ),
          emailVerified: true,
        },
        registration,
        payments: payments.results,
        config,
        today: today(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
