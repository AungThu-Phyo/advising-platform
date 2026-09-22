# Advising Platform × Campus Insights (Team 24)

## Confirmed, configured integration

The Team 24 provider endpoint is:

`GET https://campus-insight-b9mp.onrender.com/api/v1/lecturers?email={lecturerEmail}`

It requires the `x-api-key` header. Advising Platform uses the Cloudflare secret `CAMPUS_INSIGHTS_API_KEY` for its value and exposes the result through:

`GET /api/campus-insights/lecturers/:email`

The partner response is preserved under `data`, without fabricated or remapped lecturer fields. The documented response includes `id`, `email`, `name`, `school`, `major`, `rating`, `reviewCount`, `officeHours`, and `createdAt`.

Campus Insights' booking-event receiver is:

`POST https://campus-insight-b9mp.onrender.com/api/v1/webhooks/advising-event`

Advising Platform sends the agreed booking event through `POST /api/webhooks/send-test`. Set these Cloudflare secrets before using it:

| Secret | Purpose |
| --- | --- |
| `PARTNER_WEBHOOK_URL` | The complete Team 24 receiver URL above. |
| `CAMPUS_INSIGHTS_API_KEY` | The Team 24 shared key. It is sent as `x-api-key` to lecturer lookup and as `x-signature` to their booking webhook, as Team 24 confirmed. |

Team 24 confirmed that one shared key is used for all calls. Advising Platform therefore sends `CAMPUS_INSIGHTS_API_KEY` exactly in the `x-signature` header for booking events; it does not invent an HMAC/hash algorithm for that endpoint.

The outgoing payload is:

```json
{
  "eventId": "slot-booked-<generated UUID>",
  "eventType": "slot_booked",
  "studentId": "<student ID>",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "bookedSlot": {
    "date": "YYYY-MM-DD",
    "time": "HH:MM-HH:MM"
  },
  "serverTimestamp": "ISO-8601 timestamp"
}
```

## Requested / not yet confirmed

Availability, ratings/review summary, common advising topics, and booking statistics remain requested data requirements, not confirmed Team 24 endpoints. Their future URL templates can be configured with `CAMPUS_INSIGHTS_AVAILABILITY_URL`, `CAMPUS_INSIGHTS_RATINGS_URL`, `CAMPUS_INSIGHTS_TOPICS_URL`, and `CAMPUS_INSIGHTS_BOOKING_STATS_URL`; `{lecturerId}`, `{date}`, and `{period}` are URL encoded. Until configured, their Advising Platform endpoints return controlled `503` JSON with `fallback: true` and never invent data.

## Advising Platform inbound webhook

Campus Insights can send events to:

`POST https://advising-platform.aron078.workers.dev/api/webhooks/partner`

Required header: `X-Webhook-Signature`, containing an HMAC-SHA256 of the exact raw JSON body using the shared `WEBHOOK_SECRET`. Our receiver validates the signature before parsing JSON, requires `eventId` and `eventType`, and uses the unique `integration_events.event_id` constraint for idempotency.

## Secret management

Use Wrangler secrets in production, never committed files:

```sh
wrangler secret put CAMPUS_INSIGHTS_API_KEY
wrangler secret put PARTNER_WEBHOOK_URL
wrangler secret put WEBHOOK_SECRET
```

`.dev.vars` is ignored. Do not share, commit, log, or paste actual secret values into chat or documentation. Any secret previously shared outside its intended secure channel should be rotated.
