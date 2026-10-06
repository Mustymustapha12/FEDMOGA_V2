import { POST as recover } from "../app/api/paystack/recover/route";
import { GET as callback } from "../app/api/paystack/callback/route";
import nodemailer from "nodemailer";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { database, getPool } from "../server/database";
import { putSetting, encryptSecret, decryptToken } from "../app/lib";
import { verifyPayment } from "../app/paystack";
import { POST as initialize } from "../app/api/paystack/initialize/route";
import { POST as webhook } from "../app/api/paystack/webhook/route";
import { POST as register } from "../app/api/register/route";
import { POST as continuePayment } from "../app/api/paystack/continue/route";
import { POST as simulate } from "../app/api/test-payment/route";
import { defaultSections } from "../server/form";
const enabled = process.env.FEDMOGA_RUN_DB_TESTS === "true";
after(async () => {
  if (enabled) await getPool().end();
});
test(
  "MySQL: verified checkout, webhook authentication, link recovery and atomic single-use registration",
  { skip: !enabled },
  async () => {
    assert.match(
      process.env.DB_NAME || "",
      /_test$/,
      "Use a dedicated database ending in _test",
    );
    process.env.APP_URL = "https://fedmoga.example";
    process.env.FEDMOGA_ENCRYPTION_KEY = "3a".repeat(32);
    process.env.ALLOW_LIVE_PAYMENTS = "false";
    const db = database(),
      email = "payment-" + crypto.randomUUID() + "@example.com",
      key = "sk_test_abcdefghij12345";
    await putSetting("paystack_test_secret", await encryptSecret(key));
    await putSetting("paystack_mode", "test");
    await putSetting("fee", "5000");
    const request = (path: string, body: unknown) =>
      new Request("https://fedmoga.example" + path, {
        method: "POST",
        headers: {
          origin: "https://fedmoga.example",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const mailOriginal = nodemailer.createTransport;
    for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"])
      process.env[name] = "fake@example.com";
    nodemailer.createTransport = (() => ({
      sendMail: async () => {
        throw new Error("Automatic verification must not send email");
      },
      close: () => {},
    })) as unknown as typeof nodemailer.createTransport;
    const original = globalThis.fetch;
    let reference = "";
    let mismatch: Record<string, unknown> = {};
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      assert.match(
        String(new Headers(options?.headers).get("Authorization")),
        /^Bearer sk_test_/,
      );
      if (url.endsWith("/initialize")) {
        const value = JSON.parse(String(options?.body));
        reference = value.reference;
        assert.equal(value.amount, 500000);
        assert.equal(
          value.callback_url,
          "https://fedmoga.example/api/paystack/callback",
        );
        return Response.json({
          status: true,
          data: { authorization_url: "https://checkout.paystack.com/test123" },
        });
      }
      return Response.json({
        status: true,
        data: {
          reference,
          amount: 500000,
          currency: "NGN",
          status: "success",
          customer: { email },
          domain: "test",
          ...mismatch,
        },
      });
    };
    try {
      assert.equal((await simulate()).status, 410);
      const init = await initialize(
        request("/api/paystack/initialize", {
          name: "Test Member",
          email,
          phone: "08012345678",
        }),
      );
      assert.equal(init.status, 200);
      assert.equal((await init.json()).reference, reference);
      const payment = await db
        .prepare("SELECT id,status FROM payments WHERE reference=?")
        .bind(reference)
        .first<{ id: string; status: string }>();
      assert.ok(payment);
      assert.equal(payment.status, "PENDING");
      for (const invalid of [
        { amount: 1 },
        { currency: "USD" },
        { domain: "live" },
        { reference: "FEDMOGA-wrong-reference" },
        { customer: { email: "someone@example.com" } },
      ]) {
        mismatch = invalid;
        await assert.rejects(verifyPayment(reference));
        assert.equal(
          (
            await db
              .prepare("SELECT status FROM payments WHERE id=?")
              .bind(payment.id)
              .first<{ status: string }>()
          )?.status,
          "PENDING",
        );
      }
      mismatch = { amount: 517767 };
      const event = JSON.stringify({
          event: "charge.success",
          data: { reference },
        }),
        signature = createHmac("sha512", key).update(event).digest("hex");
      const hook = (sig: string) =>
        new Request("https://fedmoga.example/api/paystack/webhook", {
          method: "POST",
          headers: { "x-paystack-signature": sig },
          body: event,
        });
      assert.equal((await webhook(hook("0".repeat(128)))).status, 401);
      assert.equal((await webhook(hook(signature))).status, 200);
      const row = await db
        .prepare("SELECT token_cipher,status FROM payments WHERE id=?")
        .bind(payment.id)
        .first<{ token_cipher: string; status: string }>();
      assert.equal(row?.status, "SUCCESS");
      assert.ok(row);
      const firstToken = await decryptToken(row.token_cipher);
      assert.equal(await verifyPayment(reference), firstToken);
      const recovered = await recover(
        request("/api/paystack/recover", { email, reference }),
      );
      assert.equal(recovered.status, 200);
      assert.equal((await recovered.json()).token, firstToken);
      assert.equal(
        (
          await recover(
            request("/api/paystack/recover", {
              email: "wrong@example.com",
              reference,
            }),
          )
        ).status,
        404,
      );
      const redirected = await callback(
        new Request(
          "https://fedmoga.example/api/paystack/callback?reference=" +
            reference,
        ),
      );
      assert.equal(redirected.status, 303);
      assert.equal(
        new URL(redirected.headers.get("location")!).searchParams.get(
          "continue",
        ),
        firstToken,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT email_sent_at FROM payments WHERE id=?")
            .bind(payment.id)
            .first<{ email_sent_at: string | null }>()
        )?.email_sent_at,
        null,
      );

      assert.equal((await webhook(hook(signature))).status, 200);
      await db
        .prepare("UPDATE payments SET token_expires_at=? WHERE id=?")
        .bind("2000-01-01T00:00:00.000Z", payment.id)
        .run();
      const token = await verifyPayment(reference);
      assert.ok(token);
      assert.notEqual(token, firstToken);
      assert.equal(
        (
          await continuePayment(
            request("/api/paystack/continue", { token: firstToken }),
          )
        ).status,
        403,
      );
      assert.equal(
        (await continuePayment(request("/api/paystack/continue", { token })))
          .status,
        200,
      );
      const answers: Record<string, string | boolean> = {};
      for (const f of defaultSections.flatMap((s) => s.fields))
        answers[f.id] =
          f.type === "checkbox"
            ? true
            : f.type === "date"
              ? "1990-01-01"
              : f.type === "number"
                ? "2008"
                : f.id === "email"
                  ? email
                  : "Example";
      assert.equal(
        (
          await register(
            request("/api/register", {
              paymentId: payment.id,
              answers,
              token: "0".repeat(64),
            }),
          )
        ).status,
        403,
      );
      const responses = await Promise.all([
        register(
          request("/api/register", { paymentId: payment.id, answers, token }),
        ),
        register(
          request("/api/register", { paymentId: payment.id, answers, token }),
        ),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 403]);
      const count = await db
        .prepare("SELECT count(*) AS n FROM registrations WHERE payment_id=?")
        .bind(payment.id)
        .first<{ n: number }>();
      assert.equal(count?.n, 1);
      assert.equal(
        (await continuePayment(request("/api/paystack/continue", { token })))
          .status,
        403,
      );
      assert.ok(
        await db
          .prepare("SELECT id FROM members WHERE email=? AND mode='test'")
          .bind(email)
          .first(),
      );
      assert.equal(await verifyPayment(reference), null);
      assert.equal(
        (await recover(request("/api/paystack/recover", { email, reference })))
          .status,
        404,
      );
      assert.equal((await webhook(hook(signature))).status, 200);
    } finally {
      globalThis.fetch = original;
      nodemailer.createTransport = mailOriginal;
    }
  },
);
