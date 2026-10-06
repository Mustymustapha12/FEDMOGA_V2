import { HttpError } from "./security";
// MySQL BIGINT values may be returned as strings by a hosting driver.
function kobo(value: unknown): bigint | null {
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
  if (
    typeof value === "string" &&
    /^[0-9]+$/.test(value) &&
    value.length <= 20
  ) {
    const amount = BigInt(value);
    return amount > BigInt(0) && amount <= BigInt(Number.MAX_SAFE_INTEGER)
      ? amount
      : null;
  }
  return null;
}
export function validateVerifiedPayment(
  result: any,
  expected: {
    reference: string;
    amount_kobo: unknown;
    email: string;
    mode: string;
  },
) {
  const data = result?.data;
  if (result?.status !== true || !data)
    throw new HttpError(
      "Paystack could not verify this payment. Please retry shortly.",
      502,
    );
  if (data.status !== "success") {
    if (["pending", "processing", "ongoing", "queued"].includes(data.status))
      throw new HttpError(
        "Paystack is still processing this payment. Please wait and verify again. Do not pay again.",
        409,
      );
    throw new HttpError(
      "Paystack has not confirmed a successful payment. Contact FEDMOGA with your reference if you were debited.",
      403,
    );
  }
  const mismatches: string[] = [];
  if (data.reference !== expected.reference) mismatches.push("reference");
  // Paystack can add customer-borne processing charges to the checkout total.
  // Require the full snapshotted registration fee; allow the verified surcharge.
  const actualAmount = kobo(data.amount),
    expectedAmount = kobo(expected.amount_kobo);
  if (
    actualAmount === null ||
    expectedAmount === null ||
    actualAmount < expectedAmount
  )
    mismatches.push("amount");
  if (data.currency !== "NGN") mismatches.push("currency");
  if (
    typeof data.customer?.email !== "string" ||
    data.customer.email.trim().toLowerCase() !==
      expected.email.trim().toLowerCase()
  )
    mismatches.push("payer email");
  if (data.domain !== expected.mode) mismatches.push("test/live mode");
  if (mismatches.length) {
    console.error("Paystack verification mismatch", { fields: mismatches });
    throw new HttpError(
      "Payment verification mismatch: " +
        mismatches.join(", ") +
        ". Contact FEDMOGA with your reference; do not pay again.",
      403,
    );
  }
}
