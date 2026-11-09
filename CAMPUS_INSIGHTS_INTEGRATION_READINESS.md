# Campus Insights Integration Readiness Audit

Audit date: 2026-11-09

This audit covers the Advising Platform side only. No request was made to the
partner system, and no production Cloudflare resource was used.

## 1. Current integration architecture

```text
HTTP client
    |
    v
Cloudflare Worker + Hono
    |                         \
    v                          v
Cloudflare D1             Campus Insights client
    |                          |
    v                          v
integration_events        Configured external endpoint
```

- Worker entry point: `src/index.ts`
- Partner client: `src/integrations/campusInsights.ts`
- HMAC helper: `src/utils/signature.ts`
- Integration event store: `integration_events`
- Local configuration: `.dev.vars` (ignored); `.dev.vars.example` contains placeholders only.
- Local development now defaults to local D1. The Wrangler configuration no longer
  enables remote D1 for `wrangler dev`.

The partner client is disabled unless `CAMPUS_INSIGHTS_ENABLED=true`, and it has
no default URL. The base URL, endpoint paths, credentials, and webhook target
must be supplied after the partner provides its new contract.

## 2. Existing API endpoints

### Core and authentication

- `GET /`
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Advising data

- `POST /api/advising-requests`
- `GET /api/advising-requests`
- `GET /api/advising-requests/:id`
- `PATCH /api/advising-requests/:id`
- `DELETE /api/advising-requests/:id`
- `PATCH /api/advising-requests/:id/decision`
- `GET /api/student/advisor`
- `GET /api/student/advisor/availability`

### Integration

- `GET /api/campus-insights/lecturers/:email`
- `GET /api/campus-insights/lecturers/by-uid/:uid`
- `GET /api/campus-insights/availability/:lecturerId`
- `GET /api/campus-insights/ratings/:lecturerId`
- `GET /api/campus-insights/topics`
- `GET /api/campus-insights/booking-stats`
- `GET /api/webhooks/partner`
- `POST /api/webhooks/partner`
- `POST /api/integration/provider-test`
- `POST /api/webhooks/send-test`

### Partner read access

Campus Insights can retrieve Advising Platform lecturer data through the
API-key-protected partner routes:

- `GET /api/partner/lecturers`
- `GET /api/partner/lecturers/:uid`
- `GET /api/partner/lecturers/:uid/availability?date=YYYY-MM-DD`
- `GET /api/partner/availability?date=YYYY-MM-DD&durationMinutes=60`
- `GET /api/partner/availability/weekly`

Send the shared read key in the `x-api-key` header. Production should use the
`PARTNER_ACCESS_API_KEY` Worker secret. For backward compatibility, the
existing `ADVISING_PLATFORM_SECRET_KEY` is accepted when the dedicated secret
is not configured. These routes intentionally do not expose student identities,
appointment notes, or raw appointment records.

The live D1 database contains fictional recurring availability for 15 lecturers.
The partner availability response includes scheduled slots even when a lecturer
does not yet have a linked internal advisor account; those slots are marked
`bookable: false` until the account mapping is completed.

Use the aggregate availability endpoint when Campus Insights needs all lecturer
slots for one date. Use the UID-specific endpoint when it needs one lecturer.
Use the weekly endpoint when Campus Insights needs the recurring schedule for all
15 lecturers without choosing a date.

The live D1 database also contains dated 45-minute slots for all 15 fictional
lecturers from 2026-11-10 through 2026-11-30 in `lecturer_date_slots`.

## 3. Integration-related database tables

- `integration_events`: unique `event_id`, event type, source, status, payload,
  response metadata, and timestamp. The unique constraint provides database-level
  duplicate protection.
- `advising_requests`: student request, advisor assignment, preferred schedule,
  status, and decision note.
- `users`: student/advisor identity and advisor assignment.
- `appointments` and `advisor_slots`: structured appointment data from the MVP
  migration.
- `appointment_notes`: appointment notes with visibility control.
- `sessions`: hashed authentication session tokens.

The migration set contains two files with the `0003` prefix. Wrangler accepted
the migrations in the isolated local D1 apply, but the duplicate numbering is a
maintenance risk for future migration work and should be normalized only through
an approved migration plan.

## 4. What is working

- Hono Worker routes and D1 prepared statements are present.
- Parameterized SQL is used for application queries.
- Inbound webhook signatures are checked against the exact raw body with
  constant-time comparison before JSON is trusted.
- Missing/invalid signatures return `401`.
- Invalid JSON, missing event IDs/types, non-object payloads, and oversized
  webhook bodies return controlled errors.
- `integration_events.event_id` prevents duplicate inbound events.
- Outbound requests use a timeout and record sent/failed status.
- Outbound requests now support a caller-supplied event ID and suppress a
  duplicate before sending.
- API keys and webhook secrets are read from bindings, not source code.
- The mock fixtures contain fictional students, advisors, departments,
  appointments, advising sessions, and success/error response shapes.

## 5. Missing or changed readiness items

- The partner's new base URL, endpoint paths, authentication scheme, field
  contract, retry policy, and error contract are not available.
- No production partner call is enabled by default.
- There is no inbound domain-specific transformation or D1 upsert for student,
  advisor, department, appointment, or session records; the current webhook
  stores verified event envelopes only.
- No automatic outbound retry queue exists.
- Outbound delivery is currently exposed through the test-named route and needs
  a documented production trigger after the partner contract is approved.
- CORS is not explicitly configured. Browser access should remain same-origin or
  receive an explicit allowlist before cross-origin clients are introduced.
- The test harness uses an in-memory D1 double. A full local D1 API exercise
  should be added when the schema/migration numbering is cleaned up.

## 6. Security findings and fixes

### Fixed in this audit

1. Removed the partner client's hardcoded legacy fallback URL. Missing endpoint
   configuration now returns `503`.
2. Added an explicit disabled-by-default integration gate.
3. Changed local Wrangler D1 configuration from remote to local.
4. Stopped returning or storing arbitrary partner response bodies for outbound
   delivery logs, reducing accidental student-data exposure.
5. Added response and webhook payload size limits.
6. Added JSON-object validation for webhook payloads.
7. Added explicit outbound event-ID duplicate suppression.

### Remaining security work

- `npm install` reported four high-severity dependency advisories. They were not
  auto-fixed because that could change the existing dependency graph; review and
  upgrade them in a separate dependency-maintenance change.
- Obtain and document the new authentication contract without placing secrets
  in source control.
- Add an allowlisted CORS policy only if a cross-origin client is required.
- Define retention/redaction requirements for `integration_events.payload`.
- Add rate limiting at the edge for public webhook and authentication routes.
- Review role/status validation for all future partner-to-D1 transformations.

No secret values were included in this report.

## 7. Mock integration environment

Mock-only data is under `mock/campus-insights/`:

- `students.json`
- `advisors.json`
- `departments.json`
- `appointments.json`
- `advising-sessions.json`
- `responses.json`

These fixtures are not connected to production routes and do not claim to
represent the partner's real API schema.

## 8. Lecturer availability feature

Migration `0007_create_lecturer_availability.sql` adds `lecturer_profiles`,
`lecturer_weekly_availability`, and `lecturer_availability_overrides`.
Profiles are keyed by Campus Insights `uid`; synchronization updates only
profile fields and does not overwrite availability or appointment data.

New routes include:

- `GET /api/schools`
- `GET /api/schools/:schoolId/lecturers`
- `GET /api/lecturers/:uid`
- `GET /api/lecturers/:uid/availability?date=YYYY-MM-DD&durationMinutes=60`
- `GET /api/availability?schoolId=...&department=...&date=YYYY-MM-DD`
- Weekly availability `POST`, `PATCH`, and `DELETE` routes.
- Date override `PUT` and `DELETE` routes.
- Admin-only mock profile sync: `POST /api/lecturers/:uid/sync`.
- Student booking: `POST /api/lecturers/:uid/appointments`.

Slots are generated rather than permanently stored. Booking verifies the
generated slot, maps the lecturer email to an active advisor account, and then
uses the existing `advisor_slots` and `appointments` booking logic. A lecturer
without an active linked advisor account is not bookable.

## 9. Tests executed

| Command | Result |
| --- | --- |
| `npm install` | Passed; installed declared dependencies |
| `npm test` | Passed; health/auth guards, mock retrieval, HMAC webhook verification, inbound idempotency, outbound success/failure, and outbound duplicate suppression |
| `npm run typecheck` | Passed |
| `git diff --check` | Passed |
| `npx wrangler d1 migrations apply advising-db --local --persist-to /tmp/advising-platform-d1-local` | Applied against isolated local D1; no remote flag used |

No external partner URL was requested by the test suite.

## 10. Files modified or created

Modified:

- `.dev.vars.example`
- `wrangler.jsonc`
- `src/index.ts`
- `src/services/booking.ts`
- `src/integrations/campusInsights.ts`
- `package.json`
- `test/a5-local-check.mjs`
- `test/lecturer-availability.mjs`

Created:

- `migrations/0007_create_lecturer_availability.sql`
- `src/services/lecturerAvailability.ts`
- `mock/campus-insights/students.json`
- `mock/campus-insights/lecturers.json`
- `mock/campus-insights/advisors.json`
- `mock/campus-insights/departments.json`
- `mock/campus-insights/appointments.json`
- `mock/campus-insights/advising-sessions.json`
- `mock/campus-insights/responses.json`
- `CAMPUS_INSIGHTS_INTEGRATION_READINESS.md`

No existing endpoint or database table was removed.

## Campus Insights Integration Readiness Checklist

| Item | Status |
| --- | --- |
| Worker/Hono route structure | READY |
| D1 binding and parameterized queries | READY |
| Local development uses local D1 by default | READY |
| Receive JSON and validate required webhook fields | READY |
| Authenticate inbound webhook with HMAC | READY |
| Reject invalid signatures and malformed payloads | READY |
| Prevent duplicate inbound events | READY |
| Retrieve advising data from D1 for a future sender | NEEDS FIX |
| Reusable outbound HTTP client | NEEDS FIX |
| Timeout and failed-request handling | READY |
| Lecturer directory and school filtering | READY |
| Recurring and date-specific availability | READY |
| Generated bookable slots and existing booking integration | READY |
| Outbound duplicate suppression when event ID is supplied | READY |
| Safe integration event logging | READY |
| Explicit CORS policy | NEEDS FIX |
| Domain-specific inbound persistence/upsert | NOT IMPLEMENTED |
| Automatic retry/outbox processing | NOT IMPLEMENTED |
| Partner base URL and endpoint contract | WAITING FOR PARTNER |
| Partner authentication format and credentials | WAITING FOR PARTNER |
| Partner payload/response/error schemas | WAITING FOR PARTNER |
| Production integration enablement | WAITING FOR PARTNER |
| Mock data and response fixtures | READY |
| Local automated integration checks | READY |
