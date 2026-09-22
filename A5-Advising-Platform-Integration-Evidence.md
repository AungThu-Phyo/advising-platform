# A5 — Advising Platform × Campus Insights Integration Evidence

Evidence is intentionally limited to results actually obtained from this repository. Pending partner evidence is not represented as a successful integration.

## 1. Consumer Proof

- Partner URL: `https://campus-insight-b9mp.onrender.com/api/v1/lecturers`
- Advising Platform endpoint: `GET /api/campus-insights/lecturers/:email`
- Request parameter: `email=john.doe@mfu.ac.th`
- The former GitHub development URL was tested at `2026-09-22T10:25:04Z`; it returned HTTP `404` with an empty response body. The deployed Advising Platform proxy then returned HTTP `502` with:

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

Team 24 subsequently supplied the Render URL above and documented its required `x-api-key` authentication. At `2026-09-22T10:43:04Z`, the deployed proxy correctly returned HTTP `503` with `Campus Insights API key is not configured`, rather than sending an unauthenticated request. A successful consumer proof remains pending installation of `CAMPUS_INSIGHTS_API_KEY` and a real authenticated response.

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
- Target URL: `https://campus-insight-b9mp.onrender.com/api/v1/webhooks/advising-event`, configured only through `PARTNER_WEBHOOK_URL`.
- Authentication: Team 24 requires `x-signature`; its exact configured value is held in `PARTNER_WEBHOOK_SIGNATURE`. The supplied material did not state how to generate or rotate this value, so the application does not invent an HMAC/hash algorithm.
- Partner response and stored log: pending installation of `PARTNER_WEBHOOK_URL` and `PARTNER_WEBHOOK_SIGNATURE` as production secrets. Every configured send records timestamp, payload, HTTP status/body or controlled failure in `integration_events`.

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

For a missing target URL or `x-signature`, the sender returns a controlled `503`; for a failed configured send, it records a `failed` integration event and returns `502` with `fallback: true`. Recovery is **manual retry after the partner recovers**; no automatic retry is claimed. Real breakage timestamp, response, and recovery evidence are pending a production test against a configured Team 24 endpoint.

At `2026-09-22T10:25:04Z`, the configured lecturer consumer received the partner HTTP `404` above and returned controlled HTTP `502`. At the same time, `GET /api/campus-insights/availability/prof_101?date=2026-09-25` returned controlled HTTP `503` because no availability URL is configured. Both results confirm graceful degradation; neither represents automatic recovery.

## Local implementation verification

On 2026-09-22, `npm run typecheck` completed successfully and `wrangler deploy --dry-run` produced a valid Worker bundle. `npm test` passed local checks for health, missing-endpoint configuration fallback, invalid lecturer input, signed receiver acceptance, invalid-signature rejection, idempotency, mocked sender success, and sender network-failure fallback. Production deployment completed successfully at Worker version `f9596c60-8cea-4971-863b-f38e97cab816`; `GET /` and `GET /api/health` both returned HTTP `200`. These are local and public implementation tests, not Campus Insights webhook proof.
