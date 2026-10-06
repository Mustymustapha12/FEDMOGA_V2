import { test, after } from "node:test";
import assert from "node:assert/strict";
import { database, getPool } from "../server/database";
const base = process.env.FEDMOGA_APP_TEST_URL;
after(async () => {
  if (base) await getPool().end();
});
test(
  "HTTP/MySQL: test cleanup requires Super Admin, preserves live records and audits deletions",
  { skip: !base },
  async () => {
    assert.match(process.env.DB_NAME || "", /_test$/);
    const call = (path: string, body: unknown, cookie = "") =>
      fetch(base + path, {
        method: "POST",
        headers: {
          origin: process.env.APP_URL!,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify(body),
      });
    const login = await call("/api/auth/login", {
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (
        await call("/api/admin/test-data/clear", {
          confirmation: "DELETE TEST DATA",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          "/api/admin/test-data/clear",
          { confirmation: "wrong" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal((await call("/api/admin/email/test", {}, cookie)).status, 503);
    const db = database();
    const seed = async (mode: string) => {
      const id = crypto.randomUUID(),
        registrationId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO payments(id,full_name,email,phone,amount,status,created_at,completed,reference,mode,amount_kobo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          "Cleanup test",
          "cleanup@example.com",
          "08012345678",
          5000,
          "SUCCESS",
          new Date().toISOString(),
          1,
          crypto.randomUUID(),
          mode,
          500000,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO registrations(id,payment_id,number,answers,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          registrationId,
          id,
          crypto.randomUUID(),
          "{}",
          new Date().toISOString(),
        )
        .run();
      return { id, registrationId };
    };
    const live = await seed("live"),
      single = await seed("test"),
      bulk = await seed("test");
    const body = { confirmation: "DELETE TEST DATA" };
    assert.equal(
      (
        await call(
          "/api/admin/test-data/clear",
          { ...body, registrationId: live.registrationId },
          cookie,
        )
      ).status,
      403,
    );
    const singleResult = await call(
      "/api/admin/test-data/clear",
      { ...body, registrationId: single.registrationId },
      cookie,
    );
    assert.equal(singleResult.status, 200);
    assert.equal((await singleResult.json()).registrations, 1);
    assert.equal(
      await db
        .prepare("SELECT id FROM payments WHERE id=?")
        .bind(single.id)
        .first(),
      null,
    );
    const email = "cleanup-admin-" + crypto.randomUUID() + "@example.com",
      password = "Cleanup-admin-password-123";
    assert.equal(
      (
        await call(
          "/api/admin/users",
          { email, password, role: "ADMIN" },
          cookie,
        )
      ).status,
      200,
    );
    const regularLogin = await call("/api/auth/login", { email, password });
    const regular = regularLogin.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await call("/api/admin/test-data/clear", body, regular)).status,
      403,
    );
    assert.equal(
      (await call("/api/admin/email/test", {}, regular)).status,
      403,
    );
    const cleared = await call("/api/admin/test-data/clear", body, cookie);
    assert.equal(cleared.status, 200);
    assert.equal(
      await db
        .prepare("SELECT id FROM payments WHERE id=?")
        .bind(bulk.id)
        .first(),
      null,
    );
    assert.ok(
      await db
        .prepare("SELECT id FROM registrations WHERE id=?")
        .bind(live.registrationId)
        .first(),
    );
    assert.ok(
      await db
        .prepare("SELECT id FROM audit_logs WHERE action='test_data.deleted'")
        .first(),
    );
  },
);
