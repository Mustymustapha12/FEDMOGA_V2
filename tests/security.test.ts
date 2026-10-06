import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  assertSameOrigin,
} from "../server/security";
import { validateForm, validateAnswers, defaultSections } from "../server/form";
import { encryptSecret, decryptSecret } from "../app/lib";
test("password hashes are salted and incorrect passwords are rejected", async () => {
  const a = await hashPassword("A-private-test-password"),
    b = await hashPassword("A-private-test-password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("A-private-test-password", a), true);
  assert.equal(await verifyPassword("incorrect", a), false);
  await assert.rejects(hashPassword("short"));
});
test("requests require the configured origin, regardless of forwarded headers", () => {
  process.env.APP_URL = "https://fedmoga.example";
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://localhost/api", {
        headers: { origin: "https://fedmoga.example" },
      }),
    ),
  );
  assert.throws(() =>
    assertSameOrigin(
      new Request("http://localhost/api", {
        headers: {
          origin: "https://attacker.example",
          "x-forwarded-host": "fedmoga.example",
        },
      }),
    ),
  );
  assert.throws(() => assertSameOrigin(new Request("http://localhost/api")));
});
test("encrypted credentials reject tampering", async () => {
  process.env.FEDMOGA_ENCRYPTION_KEY = "3a".repeat(32);
  const cipher = await encryptSecret("sk_test_private");
  assert.equal(await decryptSecret(cipher), "sk_test_private");
  const bytes = Buffer.from(cipher, "base64");
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(decryptSecret(bytes.toString("base64")));
});
test("form publishing cannot remove consent or required payment identity", () => {
  assert.doesNotThrow(() => validateForm({ sections: defaultSections }));
  const invalid = structuredClone(defaultSections);
  invalid[4].fields = [];
  assert.throws(() => validateForm({ sections: invalid }));
  const duplicate = structuredClone(defaultSections);
  duplicate[0].fields.push(duplicate[0].fields[0]);
  assert.throws(() => validateForm({ sections: duplicate }));
});
test("registration validation applies defaults and binds the payment email", () => {
  assert.throws(() =>
    validateAnswers(defaultSections, { consent: true }, "paid@example.com"),
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
              ? "other@example.com"
              : "Example";
  assert.throws(() =>
    validateAnswers(defaultSections, answers, "paid@example.com"),
  );
  answers.email = "paid@example.com";
  assert.equal(
    validateAnswers(defaultSections, answers, "paid@example.com").consent,
    true,
  );
});
