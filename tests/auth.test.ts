import { defaultSections } from "../server/form";
import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.FEDMOGA_APP_TEST_URL;
test(
  "HTTP: password login, origin enforcement, Super Admin-only writes and session revocation",
  { skip: !base },
  async () => {
    assert.match(process.env.DB_NAME || "", /_test$/);
    const origin = process.env.APP_URL || "https://fedmoga.example",
      rootEmail = process.env.SUPER_ADMIN_EMAIL,
      rootPassword = process.env.SUPER_ADMIN_PASSWORD;
    assert.ok(rootEmail && rootPassword);
    const call = (
      path: string,
      body?: unknown,
      cookie = "",
      extra: Record<string, string> = {},
    ) =>
      fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...extra,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "manual",
      });
    const login = async (email: string, password: string) => {
      const res = await call("/api/auth/login", { email, password });
      assert.equal(res.status, 200);
      const signedIn = await res.json();
      assert.ok(["ADMIN", "SUPER_ADMIN"].includes(signedIn.role));
      assert.equal(signedIn.redirect, "/admin");
      const header = res.headers.get("set-cookie") || "";
      assert.match(header, /HttpOnly/i);
      assert.match(header, /Secure/i);
      assert.match(header, /SameSite=lax/i);
      return header.split(";")[0];
    };
    assert.equal((await call("/api/admin/state")).status, 401);
    assert.equal(
      (
        await call("/api/admin/state", undefined, "", {
          "oai-authenticated-user-email": rootEmail,
          "oai-authenticated-user-id": "forged",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          "/api/auth/login",
          { email: rootEmail, password: rootPassword },
          "",
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("/api/auth/login", { email: rootEmail, password: "wrong" }))
        .status,
      401,
    );
    const root = await login(rootEmail, rootPassword);
    const state = await (
      await call("/api/admin/state", undefined, root)
    ).json();
    assert.equal(state.admin.role, "SUPER_ADMIN");
    assert.equal("password_hash" in state.admin, false);
    const demote = await fetch(base + "/api/admin/users", {
      method: "PATCH",
      headers: { origin, "content-type": "application/json", cookie: root },
      body: JSON.stringify({ id: state.admin.id, role: "ADMIN", active: true }),
    });
    assert.equal(demote.status, 400);
    const email = "admin-" + crypto.randomUUID() + "@example.com",
      password = "Test-admin-unique-password";
    assert.equal(
      (await call("/api/admin/users", { email, password, role: "ADMIN" }, root))
        .status,
      200,
    );
    let admin = await login(email, password);
    const limited = await (
      await call("/api/admin/state", undefined, admin)
    ).json();
    assert.deepEqual(limited.admins, []);
    const revised = structuredClone(defaultSections);
    revised[0].title = "Personal details";
    assert.equal(
      (
        await call(
          "/api/admin/settings",
          { kind: "form", form: { sections: revised } },
          admin,
        )
      ).status,
      200,
    );
    const config = await (await call("/api/config")).json();
    assert.equal(config.form.sections[0].title, "Personal details");
    assert.equal(
      (
        await call(
          "/api/admin/settings",
          { kind: "form", form: { sections: [] } },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("/api/admin/settings", { kind: "fee", fee: 0 }, admin))
        .status,
      400,
    );
    assert.equal(
      (
        await call(
          "/api/admin/settings",
          {
            kind: "paystack",
            mode: "test",
            publicKey: "pk_test_forbidden123",
            secretKey: "sk_test_forbidden123",
            activate: true,
          },
          admin,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call("/api/admin/settings", { kind: "unexpected" }, admin)).status,
      403,
    );

    assert.equal(
      (await call("/api/admin/settings", { kind: "fee", fee: 6000 }, admin))
        .status,
      200,
    );
    assert.equal(
      (
        await call(
          "/api/admin/users",
          { email: "forbidden@example.com", password, role: "SUPER_ADMIN" },
          admin,
        )
      ).status,
      403,
    );
    assert.equal((await (await call("/api/config")).json()).fee, 6000);
    assert.equal(
      (await call("/api/admin/settings", { kind: "fee", fee: 6000 }, root))
        .status,
      200,
    );
    assert.equal(
      (
        await call(
          "/api/admin/settings",
          {
            kind: "paystack",
            mode: "live",
            publicKey: "pk_live_abcdefghij12345",
            secretKey: "sk_live_abcdefghij12345",
            activate: true,
          },
          root,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/api/admin/settings",
          {
            kind: "paystack",
            mode: "test",
            publicKey: "pk_test_abcdefghij12345",
            secretKey: "sk_test_abcdefghij12345",
            activate: true,
          },
          root,
        )
      ).status,
      200,
    );
    const safe = await (await call("/api/admin/state", undefined, root)).json();
    assert.equal(safe.testSecretSaved, true);
    assert.equal(JSON.stringify(safe).includes("sk_test_"), false);
    const user = safe.admins.find((a: { email: string }) => a.email === email);
    assert.ok(user);
    const patch = (active: boolean, password?: string) =>
      fetch(base + "/api/admin/users", {
        method: "PATCH",
        headers: { origin, "content-type": "application/json", cookie: root },
        body: JSON.stringify({
          id: user.id,
          role: "ADMIN",
          active,
          ...(password ? { password } : {}),
        }),
      });
    assert.equal((await patch(false)).status, 200);
    assert.equal(
      (await call("/api/admin/state", undefined, admin)).status,
      401,
    );
    assert.equal(
      (await call("/api/auth/login", { email, password })).status,
      401,
    );
    assert.equal((await patch(true)).status, 200);
    admin = await login(email, password);
    assert.equal((await patch(true, "Reset-unique-password")).status, 200);
    assert.equal(
      (await call("/api/admin/state", undefined, admin)).status,
      401,
    );
    admin = await login(email, "Reset-unique-password");
    assert.equal(
      (
        await call(
          "/api/auth/password",
          { currentPassword: "wrong", newPassword: "Changed-unique-password" },
          admin,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/api/auth/password",
          {
            currentPassword: "Reset-unique-password",
            newPassword: "Changed-unique-password",
          },
          admin,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/api/admin/state", undefined, admin)).status,
      401,
    );
    admin = await login(email, "Changed-unique-password");
    assert.equal((await call("/api/auth/logout", {}, admin)).status, 200);
    assert.equal(
      (await call("/api/admin/state", undefined, admin)).status,
      401,
    );
  },
);
