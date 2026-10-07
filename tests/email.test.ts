import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { emailConfiguration, sendEmail } from "../server/email";
test("SMTP: missing settings, authentication errors and accepted messages", async () => {
  const names = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "APP_URL",
  ];
  const original = nodemailer.createTransport;
  const saved = names.map((name) => process.env[name]);
  try {
    names.forEach((name) => delete process.env[name]);
    assert.equal(emailConfiguration().configured, false);
    await assert.rejects(
      sendEmail("test@example.com", "test", "test"),
      /SMTP_HOST/,
    );
    names.forEach((name) => (process.env[name] = "fake@example.com"));
    process.env.APP_URL = "https://fedmoga.example";
    nodemailer.createTransport = (() => ({
      sendMail: async () => {
        throw { code: "EAUTH", message: "secret-password" };
      },
      close: () => {},
    })) as unknown as typeof nodemailer.createTransport;
    await assert.rejects(
      sendEmail("test@example.com", "test", "test"),
      (error) =>
        /authentication failed/.test(String(error)) &&
        !String(error).includes("secret-password"),
    );
    nodemailer.createTransport = (() => ({
      sendMail: async (mail: any) => {
        assert.match(mail.html, /cid:fedmoga-logo/);
        assert.match(mail.html, /Knowledge, Discipline and Unity/);
        assert.equal(mail.attachments[0].cid, "fedmoga-logo");
        assert.ok(mail.attachments[0].content.length > 0);
        return { accepted: ["test@example.com"], rejected: [] };
      },
      close: () => {},
    })) as unknown as typeof nodemailer.createTransport;
    await sendEmail("test@example.com", "test", "test");
  } finally {
    nodemailer.createTransport = original;
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    });
  }
});
