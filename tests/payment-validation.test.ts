import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVerifiedPayment } from "../server/payment-validation";
const expected = {
  reference: "FEDMOGA-reference-123",
  amount_kobo: 500000,
  email: "member@example.com",
  mode: "test",
};
const verified = {
  status: true,
  data: {
    reference: expected.reference,
    amount: 500000,
    currency: "NGN",
    customer: { email: expected.email },
    status: "success",
    domain: "test",
  },
};
test("payment amounts compare by exact integer value across MySQL strings and Paystack numbers", () => {
  validateVerifiedPayment(verified, { ...expected, amount_kobo: "500000" });
  validateVerifiedPayment(
    {
      ...verified,
      data: {
        ...verified.data,
        amount: "500000",
        customer: { email: " MEMBER@example.com " },
      },
    },
    expected,
  );
  for (const amount of [
    null,
    "",
    true,
    "5e5",
    "500000.0",
    500000.5,
    1,
    "90071992547409930000",
  ])
    assert.throws(
      () =>
        validateVerifiedPayment(
          { ...verified, data: { ...verified.data, amount } },
          expected,
        ),
      /amount/,
    );
});
test("verification identifies mismatched fields and distinguishes pending payments", () => {
  for (const [field, value, label] of [
    ["reference", "other", "reference"],
    ["currency", "USD", "currency"],
    ["domain", "live", "test\/live mode"],
    ["customer", { email: "other@example.com" }, "payer email"],
  ] as const)
    assert.throws(
      () =>
        validateVerifiedPayment(
          { ...verified, data: { ...verified.data, [field]: value } },
          expected,
        ),
      new RegExp(label),
    );
  assert.throws(
    () =>
      validateVerifiedPayment(
        { ...verified, data: { ...verified.data, status: "pending" } },
        expected,
      ),
    /still processing/,
  );
});

test("customer-borne charges are accepted but underpayments are rejected in test and live mode", () => {
  for (const mode of ["test", "live"]) {
    for (const amount of [500000, 517767, "517767", 700000]) {
      validateVerifiedPayment(
        { ...verified, data: { ...verified.data, domain: mode, amount } },
        { ...expected, mode, amount_kobo: "500000" },
      );
    }
    for (const amount of [499999, "499999", 0, -1])
      assert.throws(
        () =>
          validateVerifiedPayment(
            { ...verified, data: { ...verified.data, domain: mode, amount } },
            { ...expected, mode },
          ),
        /amount/,
      );
  }
});
