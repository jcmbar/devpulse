import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  OPERATIONAL_EMAIL_FROM_EMAIL_DEFAULT,
  OPERATIONAL_EMAIL_FROM_NAME_DEFAULT,
  OPERATIONAL_EMAIL_REPLY_TO_DEFAULT,
  resolveOperationalEmailEnvelope,
} from "./defaults.ts";

const ENV_KEYS = [
  "OPERATIONAL_EMAIL_FROM_NAME",
  "OPERATIONAL_EMAIL_FROM_EMAIL",
  "OPERATIONAL_EMAIL_REPLY_TO",
] as const;

describe("resolveOperationalEmailEnvelope", () => {
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

  it("uses Athos Labs + contato@athoslabs.com.br + jefferson reply-to by default", () => {
    const envelope = resolveOperationalEmailEnvelope();
    assert.equal(envelope.fromName, OPERATIONAL_EMAIL_FROM_NAME_DEFAULT);
    assert.equal(envelope.fromEmail, OPERATIONAL_EMAIL_FROM_EMAIL_DEFAULT);
    assert.equal(envelope.replyTo, OPERATIONAL_EMAIL_REPLY_TO_DEFAULT);
    assert.equal(
      envelope.from,
      "Athos Labs <contato@athoslabs.com.br>",
    );
    assert.equal(envelope.replyTo, "jefferson@athoslabs.com.br");
  });

  it("allows env overrides for from and reply-to", () => {
    process.env.OPERATIONAL_EMAIL_FROM_NAME = "Ops";
    process.env.OPERATIONAL_EMAIL_FROM_EMAIL = "ops@athoslabs.com.br";
    process.env.OPERATIONAL_EMAIL_REPLY_TO = "reply@athoslabs.com.br";
    const envelope = resolveOperationalEmailEnvelope();
    assert.equal(envelope.from, "Ops <ops@athoslabs.com.br>");
    assert.equal(envelope.replyTo, "reply@athoslabs.com.br");
  });
});
