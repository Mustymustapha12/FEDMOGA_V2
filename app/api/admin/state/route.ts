import { emailConfiguration } from "../../../../server/email";
import { database, requireAdmin, errorResponse, setting } from "../../../lib";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const admin = await requireAdmin(),
      db = database();
    const [
      payments,
      registrations,
      admins,
      fee,
      testPub,
      livePub,
      testSaved,
      liveSaved,
      mode,
    ] = await Promise.all([
      db
        .prepare(
          "SELECT p.id,p.reference,p.mode,p.full_name as name,p.email,p.phone,p.amount,p.status,p.created_at as date,p.completed,CASE WHEN m.payment_id IS NULL THEN 'Paystack' ELSE 'Manual payment' END as source,m.external_reference as externalReference,m.approved_by as approvedBy,p.paid_at as paidAt FROM payments p LEFT JOIN manual_payments m ON m.payment_id=p.id ORDER BY p.created_at DESC LIMIT 500",
        )
        .all(),
      db
        .prepare(
          "SELECT r.id,r.number,r.payment_id as paymentId,r.answers,r.created_at as date,p.full_name as name,p.email,p.phone,p.amount,p.mode FROM registrations r JOIN payments p ON p.id=r.payment_id ORDER BY r.created_at DESC",
        )
        .all(),
      admin.role === "SUPER_ADMIN"
        ? db
            .prepare(
              "SELECT id,email,role,active,created_at as createdAt FROM admins ORDER BY created_at",
            )
            .all()
        : Promise.resolve({ results: [] }),
      setting("fee", "5000"),
      setting("paystack_test_public"),
      setting("paystack_live_public"),
      setting("paystack_test_secret"),
      setting("paystack_live_secret"),
      setting("paystack_mode", "test"),
    ]);
    return Response.json(
      {
        admin,
        emailDelivery:
          admin.role === "SUPER_ADMIN" ? emailConfiguration() : undefined,
        payments: payments.results,
        registrations: registrations.results,
        admins: admins.results,
        fee: Number(fee),
        paystackTestPublicKey: testPub,
        paystackLivePublicKey: livePub,
        testSecretSaved: !!testSaved,
        liveSecretSaved: !!liveSaved,
        paystackMode: mode,
        liveAllowed: process.env.ALLOW_LIVE_PAYMENTS === "true",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
