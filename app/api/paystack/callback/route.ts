import { verifyPayment } from "../../../paystack";
import { appOrigin } from "../../../../server/security";
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("reference");
  try {
    if (!ref) throw Error("Missing reference");
    const token = await verifyPayment(ref);
    return Response.redirect(
      new URL(
        token
          ? "/?continue=" + encodeURIComponent(token)
          : "/?payment=complete",
        appOrigin(),
      ),
      303,
    );
  } catch {
    return Response.redirect(
      new URL(
        "/?payment=unverified&reference=" + encodeURIComponent(ref || ""),
        appOrigin(),
      ),
      303,
    );
  }
}
