import { requireAdmin, errorResponse } from "../../../../lib";
import { readJson, HttpError } from "../../../../../server/security";
import {
  approveManualPayments,
  parseManualCsv,
  reviewManualEntries,
} from "../../../../../server/manual-payments";
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const input = await readJson(req);
    if (input.action === "preview") {
      if (admin.role !== "SUPER_ADMIN")
        throw new HttpError("Super Admin access required", 403);
      return Response.json(
        { entries: await reviewManualEntries(parseManualCsv(input.csv)) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (input.confirmed !== true)
      throw new HttpError(
        "Confirm that you checked the payment against the bank or Paystack records",
      );
    let entries: unknown[];
    if (input.action === "bulk") {
      if (admin.role !== "SUPER_ADMIN")
        throw new HttpError("Super Admin access required", 403);
      if (!Array.isArray(input.entries))
        throw new HttpError("Upload and review a valid CSV first");
      entries = input.entries;
    } else if (input.action === "single") entries = [input.entry];
    else throw new HttpError("Invalid manual payment action");
    return Response.json(
      {
        payments: await approveManualPayments(entries, admin.email, input.mode),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
