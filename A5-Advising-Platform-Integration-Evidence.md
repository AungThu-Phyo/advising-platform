# A5 — Advising Platform × Campus Insights Integration Evidence

Evidence is intentionally limited to results actually obtained from this repository. Pending partner evidence is not represented as a successful integration.

## 1. Consumer Proof

- Partner URL: `https://obscure-potato-r46p4qgrgqxrhvvr-5001.app.github.dev/campus-insight-623f0/us-central/api/api/v1/lecturers`
- Advising Platform endpoint: `GET /api/campus-insights/lecturers/:email`
- Request parameter: `email=john.doe@mfu.ac.th`
- At `2026-09-22T10:25:04Z`, direct request to the documented shared URL returned HTTP `404` with an empty response body. The deployed Advising Platform proxy returned HTTP `502` with:

```json
{
  "success": false,
  "source": "campus-insights",
  "fallback": true,
  "error": "Campus Insights returned a non-success response",
  "partnerStatus": 404,
  "partnerResponse": ""
}
```

This is a real degradation result, not a successful consumer response.

## 2. Provider Proof

- Production endpoint: `https://advising-platform.aron078.workers.dev/api/integration/provider-test`
- Authentication: `X-Webhook-Signature` HMAC-SHA256 over the raw JSON body using `WEBHOOK_SECRET`.
- Internal log: verified requests are stored in `integration_events` with source `provider-test`.
- Campus Insights confirmation, timestamp, and status code: pending Team 24 sending a signed request (or agreeing on a safe test secret).

## 3. Webhook Receiver

- Endpoint: `POST https://advising-platform.aron078.workers.dev/api/webhooks/partner`
- Incoming contract: `eventId`, `eventType`, and the documented `slot_booked` fields.
- Verification result: valid signatures produce `signatureVerified: true`; missing/invalid signatures return `401` before payload trust.
- Stored log: a verified event is stored in `integration_events` with source `campus-insights`; no secret is stored.
- Timestamp and real incoming Campus Insights payload: pending a signed delivery from Team 24.

## 4. Webhook Sender

- Trigger: `POST /api/webhooks/send-test` with `studentId`, `lecturerEmail`, and `bookedSlot`.
- Outgoing contract: generated `eventId`, `eventType: slot_booked`, `studentId`, `bookedSlot`, `lecturerEmail`, and `serverTimestamp`.
- Target URL: `PARTNER_WEBHOOK_URL` only; the full Team 24 URL was not visible in shared material and is not guessed.
- Partner response and stored log: pending Team 24 providing its full webhook URL and authentication requirements. Every configured send records timestamp, payload, HTTP status/body or controlled failure in `integration_events`.

## 5. Idempotency Proof

Request 1 and Request 2 must use the same `eventId` (for example `evt-proof-001`) and valid HMAC signature. The first is inserted; the second returns `duplicate: true`. The unique `integration_events.event_id` constraint is the database proof that only one row can exist. A production signed test and its timestamp/DB query output remain pending because no secret is included in repository evidence.

## 6. Degradation Proof

For an unavailable Campus Insights API, consumer endpoints return controlled JSON such as:

```json
{
  "success": false,
  "source": "campus-insights",
  "fallback": true,
  "error": "Campus Insights request failed"
}
```

For a missing target URL, the sender returns a controlled `503`; for a failed configured send, it records a `failed` integration event and returns `502` with `fallback: true`. Recovery is **manual retry after the partner recovers**; no automatic retry is claimed. Real breakage timestamp, response, and recovery evidence are pending a production test against a configured Team 24 endpoint.

At `2026-09-22T10:25:04Z`, the configured lecturer consumer received the partner HTTP `404` above and returned controlled HTTP `502`. At the same time, `GET /api/campus-insights/availability/prof_101?date=2026-09-25` returned controlled HTTP `503` because no availability URL is configured. Both results confirm graceful degradation; neither represents automatic recovery.

## Local implementation verification

On 2026-09-22, `npm run typecheck` completed successfully and `wrangler deploy --dry-run` produced a valid Worker bundle. `npm test` passed local checks for health, missing-endpoint configuration fallback, invalid lecturer input, signed receiver acceptance, invalid-signature rejection, idempotency, mocked sender success, and sender network-failure fallback. Production deployment completed successfully at Worker version `f9596c60-8cea-4971-863b-f38e97cab816`; `GET /` and `GET /api/health` both returned HTTP `200`. These are local and public implementation tests, not Campus Insights webhook proof.
