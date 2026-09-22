import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("/private/tmp/advising-platform-test", { recursive: true });
buildSync({ entryPoints: ["src/index.ts"], bundle: true, platform: "node", format: "esm", outfile: "/private/tmp/advising-platform-test/worker.mjs" });
const { default: app } = await import("file:///private/tmp/advising-platform-test/worker.mjs");

const events = [];
const db = {
  prepare() {
    return {
      bind(eventId, eventType, source, status, payload, response) {
        return {
          async run() {
            if (events.some((event) => event.eventId === eventId)) throw new Error("UNIQUE constraint failed: integration_events.event_id");
            events.push({ eventId, eventType, source, status, payload, response });
          },
        };
      },
    };
  },
};
const encoder = new TextEncoder();
async function signature(body, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))).map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function request(path, init = {}, env = {}) {
  return app.fetch(new Request(`http://local${path}`, init), { advising_db: db, ASSETS: {}, ...env });
}

assert.equal((await request("/api/health")).status, 200);
assert.equal((await request("/api/webhooks/partner")).status, 200);
assert.equal((await request("/api/campus-insights/availability/prof_101?date=2026-09-25")).status, 503);
assert.equal((await request("/api/campus-insights/lecturers/not-an-email")).status, 400);
assert.equal((await request("/api/webhooks/send-test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 503);

const body = JSON.stringify({ eventId: "evt-local-1", eventType: "slot_booked" });
const valid = await signature(body, "receiver-secret");
const webhookEnv = { WEBHOOK_SECRET: "receiver-secret" };
assert.equal((await request("/api/webhooks/partner", { method: "POST", body, headers: { "X-Webhook-Signature": valid } }, webhookEnv)).status, 200);
const duplicate = await request("/api/webhooks/partner", { method: "POST", body, headers: { "X-Webhook-Signature": valid } }, webhookEnv);
assert.equal(duplicate.status, 200);
assert.equal((await duplicate.json()).duplicate, true);
assert.equal(events.length, 1);
assert.equal((await request("/api/webhooks/partner", { method: "POST", body, headers: { "X-Webhook-Signature": "invalid" } }, webhookEnv)).status, 401);

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{"status":"Webhook received and logged successfully"}', { status: 200 });
const sender = await request("/api/webhooks/send-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: "student-1", lecturerEmail: "john.doe@mfu.ac.th", bookedSlot: { date: "2026-09-25", time: "10:00-11:00" } }) }, { CAMPUS_INSIGHTS_API_KEY: "test-key", PARTNER_WEBHOOK_URL: "https://example.invalid/webhook" });
assert.equal(sender.status, 200);
globalThis.fetch = async () => { throw new TypeError("network unavailable"); };
const degraded = await request("/api/webhooks/send-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: "student-2", lecturerEmail: "john.doe@mfu.ac.th", bookedSlot: { date: "2026-09-25", time: "10:00-11:00" } }) }, { CAMPUS_INSIGHTS_API_KEY: "test-key", PARTNER_WEBHOOK_URL: "https://example.invalid/webhook" });
assert.equal(degraded.status, 502);
assert.equal((await degraded.json()).fallback, true);
globalThis.fetch = originalFetch;

console.log("A5 local checks passed (health, configuration fallback, HMAC, idempotency, sender success, sender degradation).");
