# Advising Platform — Mock Data Pack & Implementation Status

**Project:** Advising Platform
**Team:** Team 13Full — Pod 4 Student Support
**Backend:** Cloudflare Workers + Hono + TypeScript
**Database:** Cloudflare D1
**Production Worker:** `https://advising-platform.aron078.workers.dev`
**Status snapshot:** 7 November 2026

---

# Part 1 — Mock Data Pack

## 1. Important Notes

All data in this document is fictional and intended only for local development, frontend testing, API testing, and demonstrations.

Do not treat these records as real MFU students, lecturers, or advising appointments.

Use mock data until the final API contract and real database structure are agreed upon.

**Do not insert this mock data into the production database.**

---

## 2. Mock Students

```json
[
  {
    "studentId": "MFU650100001",
    "name": "Alex Johnson",
    "email": "alex.johnson@example.com",
    "program": "Software Engineering",
    "year": 3
  },
  {
    "studentId": "MFU650100002",
    "name": "Maya Chen",
    "email": "maya.chen@example.com",
    "program": "Software Engineering",
    "year": 2
  },
  {
    "studentId": "MFU650100003",
    "name": "Daniel Smith",
    "email": "daniel.smith@example.com",
    "program": "Computer Engineering",
    "year": 3
  }
]
```

---

## 3. Mock Lecturers

```json
[
  {
    "lecturerId": "LEC001",
    "name": "Dr. John Doe",
    "email": "john.doe@mfu.ac.th",
    "department": "Software Engineering",
    "specialization": ["Database Systems", "Software Engineering"]
  },
  {
    "lecturerId": "LEC002",
    "name": "Dr. Sarah Lee",
    "email": "sarah.lee@mfu.ac.th",
    "department": "Computer Engineering",
    "specialization": ["Artificial Intelligence", "Machine Learning"]
  },
  {
    "lecturerId": "LEC003",
    "name": "Dr. Michael Brown",
    "email": "michael.brown@mfu.ac.th",
    "department": "Software Engineering",
    "specialization": ["Web Development", "Cloud Computing"]
  }
]
```

---

## 4. Mock Advising Requests

These records cover different request statuses for frontend testing.

```json
[
  {
    "id": "REQ-1001",
    "studentId": "MFU650100001",
    "studentName": "Alex Johnson",
    "lecturerEmail": "john.doe@mfu.ac.th",
    "lecturerName": "Dr. John Doe",
    "preferredDate": "2026-11-10",
    "preferredTime": "10:00-11:00",
    "topic": "Database Design",
    "description": "I need help understanding database normalization.",
    "agenda": [
      "Review database normalization",
      "Understand 1NF, 2NF, and 3NF",
      "Discuss practical examples"
    ],
    "status": "PENDING",
    "decisionNote": null,
    "createdAt": "2026-11-07T08:00:00Z",
    "updatedAt": "2026-11-07T08:00:00Z"
  },
  {
    "id": "REQ-1002",
    "studentId": "MFU650100002",
    "studentName": "Maya Chen",
    "lecturerEmail": "sarah.lee@mfu.ac.th",
    "lecturerName": "Dr. Sarah Lee",
    "preferredDate": "2026-11-11",
    "preferredTime": "13:00-14:00",
    "topic": "Machine Learning",
    "description": "I want to understand overfitting and model evaluation.",
    "agenda": [
      "Explain overfitting",
      "Discuss training and validation data",
      "Review evaluation metrics"
    ],
    "status": "APPROVED",
    "decisionNote": "Your request is approved. Please prepare your model evaluation questions.",
    "createdAt": "2026-11-06T08:00:00Z",
    "updatedAt": "2026-11-07T09:00:00Z"
  },
  {
    "id": "REQ-1003",
    "studentId": "MFU650100003",
    "studentName": "Daniel Smith",
    "lecturerEmail": "michael.brown@mfu.ac.th",
    "lecturerName": "Dr. Michael Brown",
    "preferredDate": "2026-11-12",
    "preferredTime": "09:00-10:00",
    "topic": "Cloud Computing",
    "description": "I need help understanding Cloudflare Workers and serverless deployment.",
    "agenda": [
      "Explain serverless architecture",
      "Discuss Cloudflare Workers",
      "Review deployment workflow"
    ],
    "status": "REJECTED",
    "decisionNote": "The requested time is unavailable. Please submit another request.",
    "createdAt": "2026-11-06T10:00:00Z",
    "updatedAt": "2026-11-07T10:00:00Z"
  },
  {
    "id": "REQ-1004",
    "studentId": "MFU650100001",
    "studentName": "Alex Johnson",
    "lecturerEmail": "sarah.lee@mfu.ac.th",
    "lecturerName": "Dr. Sarah Lee",
    "preferredDate": "2026-11-14",
    "preferredTime": "14:00-15:00",
    "topic": "Neural Networks",
    "description": "I want to understand how neural networks learn.",
    "agenda": [
      "Explain neural network structure",
      "Discuss forward propagation",
      "Review backpropagation"
    ],
    "status": "PENDING",
    "decisionNote": null,
    "createdAt": "2026-11-07T11:00:00Z",
    "updatedAt": "2026-11-07T11:00:00Z"
  }
]
```

---

## 5. Mock AI Agenda Data

### Test Case A — Database Design

Input:

```json
{
  "topic": "Database Design",
  "description": "I do not understand normalization and how to avoid duplicate data."
}
```

Expected output:

```json
{
  "success": true,
  "source": "ai",
  "agenda": [
    "Explain database normalization",
    "Understand first normal form",
    "Understand second and third normal forms",
    "Review practical examples",
    "Discuss how to avoid duplicate data"
  ]
}
```

### Test Case B — Machine Learning

Input:

```json
{
  "topic": "Machine Learning",
  "description": "I have difficulty understanding overfitting and underfitting."
}
```

Expected output:

```json
{
  "success": true,
  "source": "ai",
  "agenda": [
    "Explain overfitting and underfitting",
    "Discuss training and validation datasets",
    "Review regularization techniques",
    "Discuss model evaluation",
    "Create a practical learning plan"
  ]
}
```

### Test Case C — AI Provider Unavailable

Input:

```json
{
  "topic": "Software Engineering",
  "description": "I need help understanding software testing."
}
```

Expected fallback output:

```json
{
  "success": true,
  "source": "fallback",
  "agenda": [
    "Explain the main problem",
    "Review important concepts",
    "Discuss practical examples",
    "Identify possible solutions",
    "Plan the next learning steps"
  ]
}
```

---

## 6. Mock Campus Insights Data

Use this data to test the frontend and integration layer without depending on the actual partner service.

### Lecturer Information

```json
{
  "success": true,
  "source": "mock",
  "lecturer": {
    "lecturerId": "LEC001",
    "name": "Dr. John Doe",
    "email": "john.doe@mfu.ac.th",
    "department": "Software Engineering",
    "specialization": ["Database Systems", "Software Engineering"]
  }
}
```

### Lecturer Availability

```json
{
  "success": true,
  "source": "mock",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "availability": [
    {
      "date": "2026-11-10",
      "time": "09:00-10:00",
      "available": true
    },
    {
      "date": "2026-11-10",
      "time": "10:00-11:00",
      "available": false
    },
    {
      "date": "2026-11-10",
      "time": "13:00-14:00",
      "available": true
    }
  ]
}
```

### Lecturer Ratings

```json
{
  "success": true,
  "source": "mock",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "rating": 4.7,
  "totalReviews": 35
}
```

### Lecturer Topics

```json
{
  "success": true,
  "source": "mock",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "topics": ["Database Design", "Software Engineering", "System Analysis"]
}
```

**Important:** Mock availability is only sample data. It must not be interpreted as a real reservation or booking confirmation.

---

## 7. Mock Webhook Events

### Inbound Webhook Example

```json
{
  "eventId": "EVT-1001",
  "eventType": "slot_booked",
  "timestamp": "2026-11-07T10:00:00Z",
  "data": {
    "studentId": "MFU650100001",
    "lecturerEmail": "john.doe@mfu.ac.th",
    "bookedSlot": {
      "date": "2026-11-10",
      "time": "10:00-11:00"
    }
  }
}
```

### Duplicate Event Test

Send the same event ID twice.

Expected behavior:

- First event is processed.
- Second event is identified as a duplicate.
- The event must not be processed twice.

### Invalid Signature Test

Send an event with an invalid HMAC signature.

Expected result:

```json
{
  "success": false,
  "error": "Invalid webhook signature"
}
```

Expected HTTP status: `401`.

---

## 8. Mock Outbound Webhook Data

Use this payload only in a local test environment or an approved partner test environment.

```json
{
  "studentId": "MFU650100001",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "bookedSlot": {
    "date": "2026-11-10",
    "time": "10:00-11:00"
  }
}
```

Expected event information:

```json
{
  "eventType": "slot_booked",
  "studentId": "MFU650100001",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "bookedSlot": {
    "date": "2026-11-10",
    "time": "10:00-11:00"
  }
}
```

Do not repeatedly call the production outbound webhook test endpoint. It can send real requests to the partner.

---

# Part 2 — Current Implementation Status

## 9. Overall Project Progress

The current baseline is a working backend foundation, not a completed advising platform.

The backend, authenticated frontend, and Campus Insights integration have meaningful implementation and test coverage. The main missing areas are the AI agenda workflow, expanded authentication-flow tests, and final end-to-end integration.

| Project Part             | Current Status              | Remaining Work                             |
| ------------------------ | --------------------------- | ------------------------------------------ |
| Git/GitHub baseline      | Done                        | Continue feature branches and PRs          |
| Cloudflare Worker setup  | Done                        | Maintain deployment                        |
| Hono backend foundation  | Done                        | Complete required operations               |
| D1 connection            | Done                        | Confirm final schema                       |
| Advising CRUD            | Partially done              | Align fields, validation, and behavior     |
| Frontend                 | Implemented for student/advisor portal | Expand feature coverage and browser tests |
| AI agenda generation     | Not implemented in baseline | Add AI and fallback                        |
| Campus Insights          | Partially done              | Verify partner behavior                    |
| Inbound webhook          | Partially done              | More tests and final security review       |
| Outbound webhook         | Implemented with API-key protection | Verify delivery and retry behavior       |
| Authentication           | Implemented on auth branch | Expand flow tests and operational controls  |
| Automated tests          | Partially done              | Add tests for all major features           |
| Final end-to-end testing | Not done                    | Connect frontend, backend, and integration |

---

## 10. Git and Deployment

**Status: Completed baseline**

What has been done:

- Main branch synchronized with GitHub.
- PR #2 merged for central Cloudflare account configuration.
- PR #3 merged for Campus Insights rate-limit handling.
- Main branch deployed successfully.
- Production Worker responds to health checks.
- Deployment dry run passed.
- Automated tests passed after deployment.
- TypeScript type checking passed.

Current main commit:

```text
0654385
Merge pull request #3 from AungThu-Phyo/fix/campus-insights-rate-limit
```

Production deployment:

```text
https://advising-platform.aron078.workers.dev
```

Current deployed Worker version:

```text
2bb800ad-29a1-47af-96a9-b57f41e7f975
```

Next steps:

- Keep `main` as the stable baseline.
- Let team members work on separate feature branches.
- Merge only tested changes.
- Deploy again only after reviewing the changes.

---

## 11. Backend Implementation

**Status: Partially completed**

What has been done:

- Hono + TypeScript backend.
- Cloudflare Worker deployment.
- D1 database binding.
- Advising request CRUD route foundation.
- Campus Insights integration routes.
- Webhook receiver.
- Outbound webhook test route.
- Error handling for several integration failures.

Current advising CRUD routes include:

```text
POST   /api/advising-requests
GET    /api/advising-requests
GET    /api/advising-requests/:id
PATCH  /api/advising-requests/:id
DELETE /api/advising-requests/:id
```

Remaining work:

- Confirm the final D1 schema.
- Confirm the request and response formats.
- Validate every request field.
- Confirm lecturer approval/rejection behavior against the final contract.
- Add the final agenda generation endpoint.
- Make status transitions consistent.
- Authentication and ownership checks are implemented on the authentication
  branch; add dedicated flow tests.
- Test all CRUD operations against local/mock data.

Do not assume the proposed `/agenda` and `/decision` routes already exist.

---

## 12. Frontend Implementation

**Status: Implemented on the authentication branch; broader browser coverage remains**

Implemented screens:

### Screen 1 — Request Advising

To do:

- Build student request form.
- Add lecturer selection.
- Add date and time selection.
- Add topic and description fields.
- Connect AI agenda generation.
- Allow agenda editing.
- Submit request to backend.
- Show success and error messages.

### Screen 2 — My Requests

To do:

- Display student requests.
- Display request details.
- Show status badges.
- Show lecturer decision notes.
- Add loading, empty, and error states.

### Screen 3 — Lecturer Request Management

To do:

- Display incoming requests.
- Filter by status.
- Show request details.
- Add approve action.
- Add reject action.
- Add decision note.
- Update the displayed request after a decision.

Frontend testing should use the mock requests in Part 1 and cover session
restore, sign-out, expired sessions, and both student/advisor views.

---

## 13. AI Agenda Feature

**Status: Not implemented in the current main baseline**

To do:

- Choose an AI provider.
- Create the agenda-generation service.
- Define the input schema.
- Define the output schema.
- Generate agenda suggestions.
- Validate AI output.
- Allow students to edit suggestions.
- Save the accepted agenda.
- Implement deterministic fallback.
- Test AI provider failure.
- Display whether the agenda came from AI or fallback.

Minimum acceptance criteria:

- A student can enter a topic and description.
- The system returns useful agenda suggestions.
- The student can edit the suggestions.
- The system still works when the AI provider is unavailable.
- AI cannot make approval decisions.

---

## 14. Campus Insights Integration

**Status: Partially completed**

What has been done:

- Lecturer information integration.
- Availability integration route.
- Ratings integration route.
- Topics integration route.
- Booking statistics integration route.
- Missing API key handling.
- Partner timeout handling.
- Partner error handling.
- HTTP 429 rate-limit preservation.
- Local tests for success, missing key, rate limit, server error, and timeout.

Manual production test results:

| Test                      | Result                            |
| ------------------------- | --------------------------------- |
| Worker health             | Passed — HTTP 200                 |
| Get advising requests     | Passed — HTTP 200                 |
| Invalid lecturer email    | Passed — HTTP 400                 |
| Valid lecturer lookup     | Timed out — HTTP 504              |
| Webhook receiver status   | Passed — HTTP 200                 |
| Invalid inbound signature | Passed — HTTP 401                 |
| Outbound empty payload    | Passed validation — HTTP 400      |
| Outbound valid payload    | Partner request failed — HTTP 502 |

Important:

- Production lecturer lookup timed out.
- Successful outbound partner delivery has not been verified.
- Do not keep repeating outbound production tests because they may send real partner requests.
- Local tests already verify the 429 mapping.
- The production timeout does not necessarily mean the Worker implementation is incorrect; the external partner may be unavailable or slow.

Remaining work:

- Coordinate with Campus Insights.
- Confirm partner API availability.
- Confirm successful integration in an approved test environment.
- Verify the expected webhook payload.
- Document integration failure behavior.

---

## 15. Webhook Implementation

**Status: Partially completed**

What has been done:

- Inbound webhook receiver.
- HMAC signature verification.
- Invalid signature rejection.
- Event ID / duplicate handling.
- Outbound webhook sender.
- Basic payload validation.
- Partner error handling.
- `x-api-key` protection using `PARTNER_ACCESS_API_KEY` or the legacy
  `ADVISING_PLATFORM_SECRET_KEY`.

Remaining work:

- Verify successful outbound delivery with the partner.
- Verify duplicate event behavior.
- Add tests for malformed payloads.
- Confirm event storage and processing status.
- Document retry and failure handling.

---

## 16. Database Implementation

**Status: Partially completed**

What has been done:

- Cloudflare D1 connected to the Worker.
- Central database configured.
- Existing advising request table and migration foundation.
- Integration event table exists in the central database.

Remaining work:

- Inspect the actual current schema.
- Agree on the final advising request fields.
- Confirm agenda storage format.
- Confirm status and decision note fields.
- Add migrations only after agreement.
- Test database operations with mock data.
- Avoid changing production schema without approval.

The mock data in this document is logical application data, not a confirmed SQL schema.

---

## 17. Authentication and Security

**Status: Implemented on the authentication branch**

Completed:

- D1-backed email/password registration and login.
- PBKDF2-SHA-256 password hashing with per-user salts.
- Hashed random session tokens with expiry and revocation.
- `HttpOnly`, `Secure`, `SameSite=Lax` session cookies.
- Student, advisor, and admin role checks.
- Student ownership checks for advising requests.
- Advisor/admin checks for decisions and lecturer management.
- Protected request update and deletion routes.
- API-key protection for the outbound webhook sender.
- Migration `0008_create_auth_tables.sql`, which upgrades the existing
  `users` schema and preserves existing records.

Remaining hardening:

- Add dedicated registration/login/logout/session integration tests.
- Add edge rate limiting for public authentication routes.
- Verify production migration state before deployment.
- Complete the security review and end-to-end workflow test.

---

## 18. Automated Testing

**Status: Partially completed**

Current testing foundation:

- `test/a5-local-check.mjs`
- `npm test`
- `npm run typecheck`
- `git diff --check`

The current test script covers important backend and integration behaviors, including:

- Health.
- Configuration fallback.
- HMAC verification.
- Idempotency.
- Outbound sender success/degradation paths.
- Lecturer integration success.
- Missing API key.
- HTTP 429.
- HTTP 500.
- Timeout.

Remaining tests:

- Advising request creation.
- Invalid request validation.
- Advising request retrieval.
- Request update and deletion.
- Agenda generation.
- AI fallback.
- Lecturer approval.
- Lecturer rejection.
- Registration, login, logout, session restoration, and ownership checks.
- Frontend end-to-end workflow.

The project requirement is at least seven meaningful automated tests. More coverage is recommended.

---

# Part 3 — Recommended Implementation Order

## 19. What Should Happen Next?

Recommended order:

### Priority 1 — Agree on the shared contract

- Confirm frontend framework.
- Confirm final request JSON.
- Confirm final response JSON.
- Confirm database fields.
- Confirm API endpoint ownership.

### Priority 2 — Build the frontend

- Request Advising.
- My Requests.
- Lecturer Request Management.
- Use mock data first.
- Connect the frontend to the backend after the API contract is stable.

### Priority 3 — Complete backend requirements

- Confirm CRUD behavior.
- Add missing decision functionality.
- Add agenda generation endpoint.
- Improve validation and errors.
- Test with mock data.

### Priority 4 — Implement AI agenda assistance

- Add AI provider.
- Add deterministic fallback.
- Add editable agenda.
- Test both AI and fallback paths.

### Priority 5 — Harden security and complete integration

- Add authentication-flow tests and edge rate limiting.
- Verify migration `0008_create_auth_tables.sql` on the target D1 database.
- Review role and ownership enforcement on sensitive endpoints.
- Keep sensitive endpoints protected.
- Coordinate with Campus Insights.
- Verify webhook delivery.
- Verify duplicate-event handling.

### Priority 6 — Final testing and demonstration

- Run automated tests.
- Test all three screens.
- Test student-to-lecturer workflow.
- Check error handling.
- Review security.
- Prepare screenshots and demonstration steps.

---

# Part 4 — Team Progress Tracking

## 20. Feature Checklist

Use this checklist during team meetings.

### Project foundation

- [x] GitHub main baseline established.
- [x] Cloudflare Worker deployed.
- [x] D1 binding configured.
- [x] Backend health check working.
- [x] TypeScript typecheck passing.
- [x] Existing automated tests passing.

### Backend

- [x] Advising CRUD route foundation.
- [x] Campus Insights route foundation.
- [x] Inbound webhook receiver.
- [x] HMAC verification.
- [ ] Final API contract confirmed.
- [ ] Final database schema confirmed.
- [ ] Approval/rejection workflow.
- [ ] Agenda generation endpoint.
- [x] Authentication and authorization on the authentication branch.
- [ ] Complete validation and error handling.

### Frontend

- [ ] Request Advising screen.
- [ ] My Requests screen.
- [ ] Lecturer Request Management screen.
- [ ] API integration.
- [ ] Loading and error states.
- [ ] Frontend testing.

### AI

- [ ] AI provider selected.
- [ ] Agenda generation.
- [ ] Output validation.
- [ ] Agenda editing.
- [ ] Deterministic fallback.
- [ ] AI failure testing.

### Integration

- [x] Campus Insights route foundation.
- [x] Rate-limit error handling.
- [x] Inbound HMAC verification.
- [ ] Successful partner lookup verified.
- [ ] Successful outbound delivery verified.
- [x] Outbound endpoint protected with an API key.
- [ ] Full integration testing.

### Final delivery

- [ ] Seven or more meaningful automated tests.
- [ ] End-to-end workflow tested.
- [ ] Security review completed.
- [ ] README updated.
- [ ] Screenshots prepared.
- [ ] Final demonstration ready.

---

## 21. Final Status Summary

The project currently has a deployed backend foundation with advising CRUD routes, D1 connectivity, Campus Insights integration routes, and webhook handling.

The biggest remaining implementation areas are:

1. Frontend — three required screens.
2. AI — agenda generation and deterministic fallback.
3. Backend — final contract alignment and decision workflow.
4. Security — authentication-flow tests, rate limiting, authorization review,
   and outbound delivery verification.
5. Integration — successful partner delivery verification.
6. Testing — complete feature and end-to-end coverage.

**The current production deployment should be treated as a stable development baseline, not as the finished project.**

Team members should build missing features in separate branches, use mock data during development, and merge only after testing.
