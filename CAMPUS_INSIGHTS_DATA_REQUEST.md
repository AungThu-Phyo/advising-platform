# Advising Platform × Campus Insights (Team 24)

## Confirmed contract

Campus Insights has confirmed this lecturer lookup endpoint. Its shared development deployment may be unavailable, so Advising Platform allows it to be overridden with `CAMPUS_INSIGHTS_LECTURER_URL`.

`GET https://obscure-potato-r46p4qgrgqxrhvvr-5001.app.github.dev/campus-insight-623f0/us-central/api/api/v1/lecturers?email={email}`

The documented response has a `status` and a `data` object with `id`, `email`, `name`, `school`, `major`, `rating`, `reviewCount`, `officeHours`, and `createdAt`. Our API preserves that partner response inside `data` rather than remapping fields.

Campus Insights also showed this inbound webhook payload:

```json
{
  "eventId": "evt_test_101",
  "eventType": "slot_booked",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "bookedSlot": { "date": "2026-09-25", "time": "10:00-11:00" },
  "serverTimestamp": "2025-07-14T08:00:00.000Z"
}
```

The documented response example is `{ "status": "Webhook received and logged successfully" }`. The full Campus Insights webhook URL and its authentication requirements were not supplied, so they are not guessed or committed.

## Requested / not yet confirmed

These are data requirements, not confirmed Campus Insights endpoints: lecturer availability, ratings/review summary, common advising topics, and appointment/booking statistics. Team 24 must supply each exact URL, required authentication, request parameters, and response schema.

When supplied, configure these non-secret URL templates. Template placeholders are URL encoded: `{lecturerId}`, `{date}`, and `{period}`.

| Need | Advising Platform endpoint | Configuration |
| --- | --- | --- |
| Lecturer lookup | `GET /api/campus-insights/lecturers/:email` | `CAMPUS_INSIGHTS_LECTURER_URL` (optional override) |
| Availability | `GET /api/campus-insights/availability/:lecturerId?date=YYYY-MM-DD` | `CAMPUS_INSIGHTS_AVAILABILITY_URL` |
| Ratings | `GET /api/campus-insights/ratings/:lecturerId` | `CAMPUS_INSIGHTS_RATINGS_URL` |
| Topics | `GET /api/campus-insights/topics?period=YYYY-MM` | `CAMPUS_INSIGHTS_TOPICS_URL` |
| Booking statistics | `GET /api/campus-insights/booking-stats?period=YYYY-MM` | `CAMPUS_INSIGHTS_BOOKING_STATS_URL` |

An unconfigured endpoint returns a controlled `503` response with `fallback: true`; it never returns invented data.

## Webhook flow and security

`POST /api/webhooks/partner` receives Campus Insights events. It reads the raw body, verifies an HMAC-SHA256 signature in `X-Webhook-Signature` using `WEBHOOK_SECRET`, then validates `eventId` and `eventType`. `integration_events.event_id` is unique, so repeated deliveries return `duplicate: true` without another event record.

`POST /api/webhooks/send-test` sends the agreed `slot_booked` contract after validating `studentId`, `lecturerEmail`, and `bookedSlot`. It serializes once, signs with HMAC-SHA256 using `PARTNER_WEBHOOK_SECRET`, sends the same header, and records the response in `integration_events`. Its target is only `PARTNER_WEBHOOK_URL`; this must be set after Team 24 gives the complete URL.

All secrets must be set with Wrangler secrets, for example `wrangler secret put WEBHOOK_SECRET`. Do not commit `.dev.vars`, `.dev.vars*`, credentials, or signatures. Partner timeouts/network failures return controlled fallback JSON and are logged for manual retry; there is no automatic retry.
