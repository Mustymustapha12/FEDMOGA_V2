import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, ConfigurationError } from "../server/diagnostics";
import { getPool } from "../server/database";
test("database failures provide actionable guidance without credentials or SQL", () => {
  const diagnostic = diagnose({
    code: "ER_ACCESS_DENIED_ERROR",
    message: "Access denied for private-user using private-password",
    sql: "private member SQL",
  });
  assert.equal(diagnostic.code, "ER_ACCESS_DENIED_ERROR");
  assert.match(diagnostic.error, /DB_USER/);
  assert.equal(JSON.stringify(diagnostic).includes("private-"), false);
  const unknown = diagnose({
    code: "UNKNOWN",
    message: "private-password",
    stack: "private stack",
  });
  assert.equal(unknown.code, "SERVER_ERROR");
  assert.equal(JSON.stringify(unknown).includes("private"), false);
});
test("missing runtime configuration names the absent variables without values", () => {
  const saved = {
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
  };
  try {
    delete process.env.DB_USER;
    delete process.env.DB_NAME;
    delete process.env.DB_PASSWORD;
    assert.throws(getPool, (e) => {
      assert.ok(e instanceof ConfigurationError);
      assert.deepEqual(diagnose(e).missing, [
        "DB_USER",
        "DB_NAME",
        "DB_PASSWORD",
      ]);
      return true;
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
