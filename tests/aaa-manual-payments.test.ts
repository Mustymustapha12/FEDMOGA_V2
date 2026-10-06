import { test, after } from "node:test";
import assert from "node:assert/strict";
import { database, getPool } from "../server/database";
import {
  parseManualCsv,
  validateManualEntry,
  registrationToken,
} from "../server/manual-payments";
import { defaultSections } from "../server/form";
import { POST as register } from "../app/api/register/route";
import { POST as recover } from "../app/api/paystack/recover/route";
const base = process.env.FEDMOGA_APP_TEST_URL;
after(async () => {
  if (base) await getPool().end();
});
const entry = {
  name: "Already Paid Member",
  email: "manual@example.com",
  phone: "08012345678",
  amount: "5000",
  paidDate: "2026-01-01",
  externalReference: "BANK-TEST-001",
};
test("manual CSV parsing supports quoted commas, escaped quotes, BOM and CRLF and rejects invalid data", () => {
  const rows = parseManualCsv(
    '\uFEFFname,email,phone,amount,paid_date,reference\r\n"Member, ""Example""",manual@example.com,08012345678,5000,2026-01-01,BANK-001\r\n',
  );
  assert.equal((rows[0] as { name: string }).name, 'Member, "Example"');
  assert.equal(validateManualEntry(rows[0]).externalReference, "BANK-001");
  assert.throws(
    () =>
      parseManualCsv(
        'name,email,phone,amount,paid_date,reference\n"unfinished',
      ),
    /Unclosed/,
  );
  assert.throws(
    () =>
      parseManualCsv(
        'name,email,phone,amount,paid_date,reference\n"x"bad,e,p,5,d,r',
      ),
    /CSV/,
  );
  assert.throws(
    () => parseManualCsv("name,email,email,amount,paid_date,reference"),
    /columns/,
  );
  assert.throws(
    () => validateManualEntry({ ...entry, paidDate: "2026-02-30" }),
    /date/,
  );
  assert.throws(() => validateManualEntry({ ...entry, amount: "0" }), /amount/);
  assert.throws(
    () => validateManualEntry({ ...entry, externalReference: "=HYPERLINK(x)" }),
    /reference/,
  );
});
test(
  "HTTP/MySQL: approved manual payments, Super Admin CSV review, duplicates, private single-use links and test cleanup",
  { skip: !base },
  async () => {
    assert.match(process.env.DB_NAME || "", /_test$/);
    const origin = process.env.APP_URL!,
      db = database();
    const call = (
      path: string,
      body: unknown,
      cookie = "",
      requestOrigin = origin,
    ) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          origin: requestOrigin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify(body),
      });
    const rootLogin = await call("/api/auth/login", {
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    });
    assert.equal(rootLogin.status, 200);
    const root = rootLogin.headers.get("set-cookie")!.split(";")[0];
    const single = { action: "single", entry, mode: "live", confirmed: true };
    assert.equal(
      (await call("/api/admin/payments/manual", single)).status,
      401,
    );
    assert.equal(
      (
        await call(
          "/api/admin/payments/manual",
          single,
          root,
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/api/admin/payments/manual",
          { ...single, confirmed: false },
          root,
        )
      ).status,
      400,
    );
    const email = "manual-admin-" + crypto.randomUUID() + "@example.com",
      password = "Manual-admin-password-123";
    assert.equal(
      (await call("/api/admin/users", { email, password, role: "ADMIN" }, root))
        .status,
      200,
    );
    const regularLogin = await call("/api/auth/login", { email, password });
    const regular = regularLogin.headers.get("set-cookie")!.split(";")[0];
    const created = await call("/api/admin/payments/manual", single, regular);
    assert.equal(created.status, 200);
    assert.match(created.headers.get("cache-control") || "", /no-store/);
    const payment = (await created.json()).payments[0];
    const token = new URL(payment.registrationUrl).searchParams.get(
      "continue",
    )!;
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(await registrationToken(payment.reference), token);
    assert.equal(
      (
        await call(
          "/api/admin/payments/manual",
          {
            ...single,
            entry: {
              ...entry,
              externalReference: entry.externalReference.toLowerCase(),
            },
          },
          root,
        )
      ).status,
      409,
    );
    const csv =
      "name,email,phone,amount,paid_date,reference\nBulk One,bulk1@example.com,08012345678,5000,2026-01-01,BANK-BULK-001\nBulk Two,bulk2@example.com,08012345678,7000,2026-01-02,BANK-BULK-002\n";
    assert.equal(
      (
        await call(
          "/api/admin/payments/manual",
          { action: "preview", csv },
          regular,
        )
      ).status,
      403,
    );
    const previewRes = await call(
      "/api/admin/payments/manual",
      { action: "preview", csv },
      root,
    );
    assert.equal(previewRes.status, 200);
    const preview = (await previewRes.json()).entries;
    assert.equal(
      await db
        .prepare(
          "SELECT payment_id FROM manual_payments WHERE external_reference='BANK-BULK-001'",
        )
        .first(),
      null,
    );
    assert.equal(
      (
        await call(
          "/api/admin/payments/manual",
          { action: "bulk", entries: preview, confirmed: true, mode: "test" },
          regular,
        )
      ).status,
      403,
    );
    const batch = await call(
      "/api/admin/payments/manual",
      { action: "bulk", entries: preview, confirmed: true, mode: "test" },
      root,
    );
    assert.equal(batch.status, 200);
    assert.equal((await batch.json()).payments.length, 2);
    assert.equal(
      (
        await call(
          "/api/admin/payments/manual",
          {
            action: "bulk",
            entries: [{ ...entry, externalReference: "BANK-ROLLBACK" }, entry],
            confirmed: true,
            mode: "live",
          },
          root,
        )
      ).status,
      409,
    );
    assert.equal(
      await db
        .prepare(
          "SELECT payment_id FROM manual_payments WHERE external_reference='BANK-ROLLBACK'",
        )
        .first(),
      null,
    );
    const state = await (
      await fetch(base + "/api/admin/state", { headers: { cookie: root } })
    ).json();
    const record = state.payments.find((p: any) => p.id === payment.id);
    assert.equal(record.source, "Manual payment");
    assert.equal(record.approvedBy, email);
    assert.equal(record.externalReference, entry.externalReference);
    assert.equal("token_cipher" in record, false);
    const linked = await call(
      "/api/admin/payments/link",
      { id: payment.id },
      regular,
    );
    assert.equal(linked.status, 200);
    assert.equal(
      (await linked.json()).registrationUrl,
      payment.registrationUrl,
    );
    const request = (path: string, body: unknown) =>
      new Request(origin + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const recovery = await recover(
      request("/api/paystack/recover", {
        email: entry.email,
        reference: payment.reference,
      }),
    );
    assert.equal(recovery.status, 200);
    assert.equal((await recovery.json()).token, token);
    await db
      .prepare("UPDATE payments SET token_expires_at=? WHERE id=?")
      .bind("2000-01-01T00:00:00.000Z", payment.id)
      .run();
    const renewed = await registrationToken(payment.reference);
    assert.ok(renewed);
    assert.notEqual(renewed, token);
    const answers: Record<string, string | boolean> = {};
    for (const section of defaultSections)
      for (const field of section.fields)
        answers[field.id] =
          field.type === "checkbox"
            ? true
            : field.type === "email"
              ? entry.email
              : field.type === "date"
                ? "1990-01-01"
                : field.type === "number"
                  ? "2010"
                  : "Valid test answer";
    assert.equal(
      (
        await register(
          request("/api/register", { paymentId: payment.id, token, answers }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await register(
          request("/api/register", {
            paymentId: payment.id,
            token: renewed,
            answers,
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await register(
          request("/api/register", {
            paymentId: payment.id,
            token: renewed,
            answers,
          }),
        )
      ).status,
      403,
    );
    assert.equal(await registrationToken(payment.reference), null);

    const livePractice = await call(
      "/api/admin/payments/manual",
      {
        ...single,
        entry: { ...entry, externalReference: "BANK-LIVE-PRACTICE" },
      },
      root,
    );
    assert.equal(livePractice.status, 200);
    const practice = (await livePractice.json()).payments[0];
    const practiceRegistrationId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO registrations(id,payment_id,number,answers,created_at) VALUES(?,?,?,?,?)",
      )
      .bind(
        practiceRegistrationId,
        practice.id,
        "PRACTICE-" + crypto.randomUUID(),
        "{}",
        new Date().toISOString(),
      )
      .run();
    await db
      .prepare(
        "UPDATE payments SET completed=1,token_hash=NULL,token_cipher=NULL WHERE id=?",
      )
      .bind(practice.id)
      .run();
    const deleteBody = {
      id: practice.id,
      confirmation: "DELETE MANUAL TEST ENTRY",
    };
    assert.equal(
      (
        await call(
          "/api/admin/payments/delete-manual-test",
          deleteBody,
          regular,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/api/admin/payments/delete-manual-test",
          { ...deleteBody, confirmation: "wrong" },
          root,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("/api/admin/payments/delete-manual-test", deleteBody, root))
        .status,
      200,
    );
    assert.equal(
      await db
        .prepare("SELECT payment_id FROM manual_payments WHERE payment_id=?")
        .bind(practice.id)
        .first(),
      null,
    );
    assert.equal(
      await db
        .prepare("SELECT id FROM registrations WHERE id=?")
        .bind(practiceRegistrationId)
        .first(),
      null,
    );
    const paystackId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO payments(id,full_name,email,phone,amount,status,created_at,reference,mode,amount_kobo) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        paystackId,
        "Real payer",
        "real@example.com",
        "08012345678",
        5000,
        "SUCCESS",
        new Date().toISOString(),
        "FEDMOGA-" + crypto.randomUUID(),
        "live",
        500000,
      )
      .run();
    assert.equal(
      (
        await call(
          "/api/admin/payments/delete-manual-test",
          { id: paystackId, confirmation: "DELETE MANUAL TEST ENTRY" },
          root,
        )
      ).status,
      404,
    );
    assert.ok(
      await db
        .prepare("SELECT id FROM payments WHERE id=?")
        .bind(paystackId)
        .first(),
    );
    const cleared = await call(
      "/api/admin/test-data/clear",
      { confirmation: "DELETE TEST DATA" },
      root,
    );
    assert.equal(cleared.status, 200);
    assert.equal(
      await db
        .prepare(
          "SELECT payment_id FROM manual_payments WHERE external_reference='BANK-BULK-001'",
        )
        .first(),
      null,
    );
    assert.ok(
      await db
        .prepare("SELECT payment_id FROM manual_payments WHERE payment_id=?")
        .bind(payment.id)
        .first(),
    );
    assert.ok(
      await db
        .prepare(
          "SELECT id FROM audit_logs WHERE actor=? AND action='manual_payment.approved' AND target=?",
        )
        .bind(email, payment.id)
        .first(),
    );
  },
);
