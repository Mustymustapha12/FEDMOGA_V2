import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { database, getPool } from "../server/database";
import { Member } from "../server/members";
import { digest } from "../server/security";
import { decryptToken, putSetting, encryptSecret } from "../app/lib";
import { initializeDues, verifyDues, finalizeDues } from "../server/dues";
import { periodEnd, today, renewalPeriod } from "../server/calendar";
import { scheduleDuesReminders } from "../server/reminders";
import { processMailJobs } from "../server/mail-jobs";
import { POST as webhook } from "../app/api/paystack/webhook/route";
const base = process.env.FEDMOGA_APP_TEST_URL;
after(async () => {
  if (base) await getPool().end();
});
test(
  "V2: migration, activation, member isolation, renewals, manual dues, receipts, reminders and session revocation",
  { skip: !base },
  async () => {
    assert.match(process.env.DB_NAME || "", /_test$/);
    const db = database(),
      origin = process.env.APP_URL!,
      realFetch = globalThis.fetch;
    const call = (path: string, body?: unknown, cookie = "") =>
      realFetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { origin, "content-type": "application/json", cookie },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const rootRes = await call("/api/auth/login", {
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    });
    assert.equal(rootRes.status, 200);
    const root = rootRes.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await call("/api/jobs/run", {})).status, 401);
    const email = "v2-member@example.com";
    const seed = async (memberEmail: string) => {
      const payment = crypto.randomUUID(),
        registration = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO payments(id,full_name,email,phone,amount,status,created_at,completed,reference,mode,amount_kobo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          payment,
          "V2 Member",
          memberEmail,
          "08012345678",
          5000,
          "SUCCESS",
          new Date().toISOString(),
          1,
          "FEDMOGA-" + crypto.randomUUID(),
          "test",
          500000,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO registrations(id,payment_id,number,answers,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          registration,
          payment,
          "FEDMOGA-TEST-" + crypto.randomUUID(),
          "{}",
          new Date().toISOString(),
        )
        .run();
      return registration;
    };
    await seed(email);
    await seed(email);
    await seed("other-v2@example.com");
    assert.equal((await call("/api/admin/members/migrate", {})).status, 401);
    const migration = await call("/api/admin/members/migrate", {}, root);
    assert.equal(migration.status, 200);
    assert.ok((await migration.json()).duplicates >= 1);
    const m = await db
      .prepare("SELECT * FROM members WHERE email=? AND mode='test'")
      .bind(email)
      .first<Member>();
    assert.ok(m);
    assert.equal(m.password_hash, null);
    const job = await db
      .prepare(
        "SELECT payload_cipher FROM email_jobs WHERE member_id=? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(m.id)
      .first<{ payload_cipher: string }>();
    assert.ok(job);
    const mail = JSON.parse(await decryptToken(job.payload_cipher));
    assert.match(mail.html, /FEDMOGA/);
    const token = mail.text.match(/account=([a-f0-9]{64})/)[1];
    const password = "Member-password-12345";
    assert.equal(
      (await call("/api/member/login", { email, password })).status,
      401,
    );
    assert.equal(
      (await call("/api/member/account/complete", { token, password: "weak" }))
        .status,
      400,
    );
    assert.equal(
      (await call("/api/member/account/complete", { token, password })).status,
      200,
    );
    assert.equal(
      (await call("/api/member/account/complete", { token, password })).status,
      403,
    );
    const login = await call("/api/member/login", { email, password });
    assert.equal(login.status, 200);
    const memberCookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const memberState = await (
      await call("/api/member/state", undefined, memberCookie)
    ).json();
    assert.equal(memberState.member.email, email);
    assert.equal("password_hash" in memberState.member, false);
    assert.equal(
      (await call("/api/admin/members/state", undefined, memberCookie)).status,
      401,
    );
    const pendingId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO payments(id,full_name,email,phone,amount,status,created_at,completed,reference,mode,amount_kobo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        pendingId,
        "Pending <Member>",
        "pending-v2@example.com",
        "08098765432",
        5000,
        "PENDING",
        new Date().toISOString(),
        0,
        "PENDING-" + pendingId,
        "test",
        500000,
      )
      .run();
    assert.equal(
      (
        await call(
          "/api/admin/payments/remind",
          { id: pendingId },
          memberCookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (await call("/api/admin/payments/remind", { id: pendingId }, root))
        .status,
      200,
    );
    const pendingJob = await db
      .prepare("SELECT payload_cipher FROM email_jobs WHERE payment_id=?")
      .bind(pendingId)
      .first<{ payload_cipher: string }>();
    assert.ok(pendingJob);
    const pendingMail = JSON.parse(
      await decryptToken(pendingJob.payload_cipher),
    );
    assert.equal(pendingMail.to, "pending-v2@example.com");
    assert.match(pendingMail.html, /Pending &lt;Member&gt;/);
    assert.match(pendingMail.text, /\/api\/paystack\/resume\?token=/);
    const pendingState = await (
      await call("/api/admin/members/state", undefined, root)
    ).json();
    const payer = pendingState.pending.find(
      (entry: { id: string }) => entry.id === pendingId,
    );
    assert.equal(payer.email, "pending-v2@example.com");
    assert.equal(payer.phone, "08098765432");
    const other = await db
      .prepare("SELECT id FROM members WHERE email='other-v2@example.com'")
      .first<{ id: string }>();
    assert.ok(other);
    assert.equal(
      (await call("/api/dues/verify", { reference: "not-owned" }, memberCookie))
        .status,
      404,
    );
    assert.equal(
      (
        await call(
          "/api/admin/members/settings",
          { monthly: 1000, quarterly: 2800, annually: 10000, graceDays: 30 },
          root,
        )
      ).status,
      200,
    );
    await putSetting(
      "paystack_test_secret",
      await encryptSecret("sk_test_v2test123456789"),
    );
    await putSetting("paystack_mode", "test");
    let reference = "",
      amount = 100000,
      mismatch: Record<string, unknown> = {};
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (url.endsWith("/initialize")) {
        const body = JSON.parse(String(options?.body));
        reference = body.reference;
        amount = body.amount;
        assert.equal(body.callback_url, origin + "/api/dues/callback");
        return Response.json({
          status: true,
          data: { authorization_url: "https://checkout.paystack.com/v2test" },
        });
      }
      return Response.json({
        status: true,
        data: {
          reference,
          amount: amount + 10000,
          currency: "NGN",
          domain: "test",
          status: "success",
          customer: { email },
          ...mismatch,
        },
      });
    };
    try {
      const fresh = await db
        .prepare("SELECT * FROM members WHERE id=?")
        .bind(m.id)
        .first<Member>();
      assert.ok(fresh);
      const init = await initializeDues(fresh, "monthly");
      assert.equal(init.reference, reference);
      for (const invalid of [
        { amount: 1 },
        { customer: { email: "attacker@example.com" } },
        { domain: "live" },
        { currency: "USD" },
      ]) {
        mismatch = invalid;
        await assert.rejects(verifyDues(reference));
      }
      mismatch = {};
      const [a, b] = await Promise.all([
        verifyDues(reference),
        verifyDues(reference),
      ]);
      assert.equal(a.period_end, b.period_end);
      assert.equal(a.period_end, periodEnd(today(), "monthly"));
      const one = await db
        .prepare("SELECT COUNT(*) as total FROM email_jobs WHERE dedupe_key=?")
        .bind("dues-receipt:" + a.id)
        .first<{ total: number }>();
      assert.equal(one?.total, 1);
      const event = JSON.stringify({
          event: "charge.success",
          data: { reference },
        }),
        key = "sk_test_v2test123456789";
      const hook = (signature: string) =>
        new Request(origin + "/api/paystack/webhook", {
          method: "POST",
          headers: { "x-paystack-signature": signature },
          body: event,
        });
      assert.equal((await webhook(hook("0".repeat(128)))).status, 401);
      assert.equal(
        (
          await webhook(
            hook(createHmac("sha512", key).update(event).digest("hex")),
          )
        ).status,
        200,
      );
      const after = await db
        .prepare("SELECT paid_until FROM members WHERE id=?")
        .bind(m.id)
        .first<{ paid_until: string }>();
      assert.equal(after?.paid_until, a.period_end);
      await initializeDues(fresh, "monthly");
      const early = await verifyDues(reference);
      assert.equal(
        early.period_end,
        renewalPeriod(a.period_end!, "monthly").end,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
    const manual = {
      memberId: m.id,
      plan: "quarterly",
      amount: "2800",
      paidDate: today(),
      reference: "V2-BANK-001",
      confirmed: true,
    };
    assert.equal(
      (
        await call(
          "/api/admin/dues/manual",
          { ...manual, confirmed: false },
          root,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("/api/admin/dues/manual", manual, root)).status,
      200,
    );
    assert.equal(
      (await call("/api/admin/dues/manual", manual, root)).status,
      409,
    );
    const state = await (
      await call("/api/member/state", undefined, memberCookie)
    ).json();
    assert.equal(state.member.status, "active");
    assert.equal(state.payments.length, 3);
    assert.ok(state.payments.every((p: any) => p.status === "SUCCESS"));
    const adminState = await (
      await call("/api/admin/members/state", undefined, root)
    ).json();
    assert.ok(adminState.report.collections >= 4800);
    assert.ok(adminState.report.outstanding > 0);
    await db
      .prepare("UPDATE members SET paid_until='2026-10-31' WHERE id=?")
      .bind(m.id)
      .run();
    await scheduleDuesReminders("2026-10-24");
    await scheduleDuesReminders("2026-10-24");
    const reminder = await db
      .prepare("SELECT COUNT(*) as total FROM email_jobs WHERE dedupe_key=?")
      .bind(`dues-reminder:${m.id}:2026-10-31:2026-10-24`)
      .first<{ total: number }>();
    assert.equal(reminder?.total, 1);
    const oldTransport = nodemailer.createTransport;
    let sent = 0;
    for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"])
      process.env[name] = "test@example.com";
    nodemailer.createTransport = (() => ({
      sendMail: async (options: any) => {
        sent++;
        assert.ok(options.html.includes("FEDMOGA"));
        return { accepted: [options.to], rejected: [] };
      },
      close: () => {},
    })) as unknown as typeof nodemailer.createTransport;
    try {
      await processMailJobs(10);
      assert.ok(sent > 0);
    } finally {
      nodemailer.createTransport = oldTransport;
    }
    await call("/api/member/account/request", { email });
    const expiredJob = await db
      .prepare(
        "SELECT payload_cipher FROM email_jobs WHERE member_id=? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(m.id)
      .first<{ payload_cipher: string }>();
    const expiredToken = JSON.parse(
      await decryptToken(expiredJob!.payload_cipher),
    ).text.match(/account=([a-f0-9]{64})/)[1];
    await db
      .prepare(
        "UPDATE member_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
      )
      .bind(digest(expiredToken))
      .run();
    assert.equal(
      (
        await call("/api/member/account/complete", {
          token: expiredToken,
          password: "Expired-password-123",
        })
      ).status,
      403,
    );
    assert.equal(
      (await call("/api/member/account/request", { email })).status,
      200,
    );
    const resetJob = await db
      .prepare(
        "SELECT payload_cipher FROM email_jobs WHERE member_id=? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(m.id)
      .first<{ payload_cipher: string }>();
    const resetMail = JSON.parse(await decryptToken(resetJob!.payload_cipher));
    const resetToken = resetMail.text.match(/account=([a-f0-9]{64})/)[1];
    assert.equal(
      (
        await call("/api/member/account/complete", {
          token: resetToken,
          password: "New-member-password-123",
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("/api/member/state", undefined, memberCookie)).status,
      401,
    );
    assert.equal(
      (
        await call("/api/member/account/request", {
          email: "nobody@example.com",
        })
      ).status,
      200,
    );
  },
);
