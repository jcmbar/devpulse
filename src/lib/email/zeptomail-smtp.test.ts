import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  getZeptoMailSmtpConfig,
  getZeptoMailSmtpPublicStatus,
} from "./zeptomail-smtp-config.ts";

const ENV_KEYS = [
  "ZEPTOMAIL_SMTP_HOST",
  "ZEPTOMAIL_SMTP_PORT",
  "ZEPTOMAIL_SMTP_USER",
  "ZEPTOMAIL_SMTP_PASSWORD",
  "ZEPTOMAIL_SMTP_PASS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_PASS",
] as const;

describe("getZeptoMailSmtpConfig", () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("defaults host/port/user for ZeptoMail when password is set", () => {
    process.env.ZEPTOMAIL_SMTP_PASSWORD = "secret-token";
    const config = getZeptoMailSmtpConfig();
    assert.equal(config.host, "smtp.zeptomail.com");
    assert.equal(config.port, 587);
    assert.equal(config.user, "emailapikey");
    assert.equal(config.password, "secret-token");
    assert.equal(config.secure, false);
  });

  it("prefers ZEPTOMAIL_SMTP_PASSWORD over SMTP_PASS", () => {
    process.env.ZEPTOMAIL_SMTP_PASSWORD = "primary-secret";
    process.env.SMTP_PASS = "fallback-secret";
    const config = getZeptoMailSmtpConfig();
    assert.equal(config.password, "primary-secret");
  });

  it("accepts SMTP_PASS as temporary fallback", () => {
    process.env.SMTP_PASS = "alias-secret";
    const config = getZeptoMailSmtpConfig();
    assert.equal(config.password, "alias-secret");
  });

  it("unwraps quoted password values", () => {
    process.env.ZEPTOMAIL_SMTP_PASSWORD = '"quoted-secret"';
    const config = getZeptoMailSmtpConfig();
    assert.equal(config.password, "quoted-secret");
  });

  it("throws a clear hint when password is missing", () => {
    assert.throws(
      () => getZeptoMailSmtpConfig(),
      /Configure ZEPTOMAIL_SMTP_PASSWORD/,
    );
  });

  it("exposes public status without the password", () => {
    process.env.ZEPTOMAIL_SMTP_PASSWORD = "secret-token";
    const status = getZeptoMailSmtpPublicStatus();
    assert.equal(status.passwordConfigured, true);
    assert.equal(status.missingHint, null);
    assert.equal(status.host, "smtp.zeptomail.com");
    assert.ok(!("password" in status));
  });
});
