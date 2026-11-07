# Advising Platform — Project Requirements & Shared Development Contract

**Project:** Advising Platform
**Team:** Team 13Full — Pod 4 Student Support
**Integration Partner:** Team 24 — Campus Insights
**Backend:** Cloudflare Workers + Hono + TypeScript
**Database:** Cloudflare D1
**Status:** Development baseline established; remaining features are under development.

---

## 1. Project Overview

The Advising Platform is a web-based system that allows students to request academic advising and lecturers to review those requests.

The system should allow students to:

- Submit an advising request.
- Select a lecturer.
- Provide a preferred date and time.
- Explain their advising topic or problem.
- Receive AI-assisted agenda suggestions.
- View and track their request status.

The system should allow lecturers to:

- View advising requests.
- Review student information and agenda details.
- Approve or reject requests.
- Provide a decision note.

The platform also integrates with Campus Insights to retrieve relevant lecturer information and exchange advising-related events.

### Important business rule

**Approving an advising request does not automatically reserve or book a lecturer's time slot.**

The system must keep request approval separate from actual slot booking.

AI-generated agendas are suggestions only. AI must never automatically approve or reject requests.

---

## 2. Main System Workflow

```text
Student
   |
   v
Submit Advising Request
   |
   v
AI Agenda Assistance (Optional)
   |
   v
Review and Edit Agenda
   |
   v
Submit Request
   |
   v
Request Status = PENDING
   |
   v
Lecturer Reviews Request
   |
   +----------------------+
   |                      |
   v                      v
Approve                 Reject
   |                      |
   v                      v
APPROVED                REJECTED
   |                      |
   v                      v
Student Receives        Student Receives
Decision                Decision
```

Approval does not mean that a slot has been reserved.

---

## 3. Technology Stack

| Part                 | Technology                              |
| -------------------- | --------------------------------------- |
| Frontend             | To be agreed by the team                |
| Backend              | TypeScript + Hono                       |
| Runtime              | Cloudflare Workers                      |
| Database             | Cloudflare D1                           |
| AI feature           | AI provider with deterministic fallback |
| External integration | Campus Insights                         |
| API style            | REST API                                |
| Version control      | Git + GitHub                            |
| Testing              | Automated tests and manual API testing  |

All team members must agree on the frontend framework and API contract before implementing dependent features.

---

## 4. Functional Requirements

### 4.1 Student Frontend

The frontend must provide these screens.

#### Screen 1: Request Advising

Students should be able to:

- Enter their student ID.
- Select a lecturer.
- Select a preferred date.
- Select a preferred time.
- Enter an advising topic.
- Describe their problem.
- Generate an agenda using AI.
- Edit the suggested agenda.
- Submit the request.

Required fields:

| Field               | Required              |
| ------------------- | --------------------- |
| Student ID          | Yes                   |
| Lecturer            | Yes                   |
| Preferred date      | Yes                   |
| Preferred time      | Yes                   |
| Topic               | Yes                   |
| Problem description | Yes                   |
| Agenda              | Yes before submission |

Validation:

- Required fields cannot be empty.
- Date must be valid.
- Date should not be in the past.
- User must review the agenda before submission.
- The request must be saved with `PENDING` status.

#### Screen 2: My Requests

Students should be able to:

- View their submitted requests.
- See request details.
- See the preferred date and time.
- See the current status.
- Read the lecturer's decision note.
- Identify whether the request is pending, approved, or rejected.

Request statuses:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED` (optional, if supported by the final design)

#### Screen 3: Lecturer Request Management

Lecturers should be able to:

- View incoming requests.
- Filter requests by status.
- View student request details.
- Read the student's agenda.
- Approve requests.
- Reject requests.
- Add a decision note.

Lecturers must not approve or reject a request without a valid request ID.

---

### 4.2 Backend Requirements

The backend is responsible for:

- Receiving student requests.
- Validating request data.
- Saving requests in D1.
- Retrieving requests.
- Updating request status.
- Deleting or cancelling requests according to agreed rules.
- Providing data to the frontend.
- Integrating with Campus Insights.
- Handling webhook events.
- Returning consistent API responses.

#### Target REST API Contract

These are the target endpoints for the completed project. They are not all implemented in the current baseline. Before adding them, inspect the existing routes and database schema to avoid duplicates or breaking existing behavior.

| Method | Endpoint                              | Purpose                   |
| ------ | ------------------------------------- | ------------------------- |
| POST   | `/api/advising-requests`              | Create request            |
| GET    | `/api/advising-requests`              | Get requests              |
| GET    | `/api/advising-requests/:id`          | Get one request           |
| PATCH  | `/api/advising-requests/:id`          | Update request            |
| DELETE | `/api/advising-requests/:id`          | Delete/cancel request     |
| POST   | `/api/advising-requests/:id/agenda`   | Generate agenda           |
| PATCH  | `/api/advising-requests/:id/decision` | Approve or reject request |

**Important:** The current baseline already has some advising CRUD routes. The team must reconcile the target contract with the actual implementation before changing route names or request formats.

#### Suggested Request Data Structure

```json
{
  "studentId": "MFU650100001",
  "lecturerEmail": "john.doe@mfu.ac.th",
  "preferredDate": "2026-11-10",
  "preferredTime": "10:00-11:00",
  "topic": "Database Design",
  "description": "I need help understanding database normalization.",
  "agenda": [
    "Review database normalization",
    "Understand first, second, and third normal forms",
    "Discuss practical examples"
  ]
}
```

The backend owner must confirm the final field names and data types against the existing D1 schema.

#### Suggested Response Format

```json
{
  "success": true,
  "data": {
    "id": "REQ-1001",
    "studentId": "MFU650100001",
    "status": "PENDING"
  },
  "message": "Advising request created successfully"
}
```

Errors should return a consistent structure:

```json
{
  "success": false,
  "error": "Invalid request data"
}
```

---

### 4.3 AI Features

The AI feature helps students prepare a clear advising agenda.

#### Expected workflow

1. Student selects a lecturer.
2. Student enters an advising topic.
3. Student explains their problem.
4. Backend sends the information to the AI provider.
5. AI generates suggested agenda items.
6. Student reviews and edits the suggestions.
7. Student accepts the agenda.
8. The accepted agenda is saved with the advising request.

#### AI Input Example

```json
{
  "topic": "Database Design",
  "description": "I do not understand database normalization and how to apply it."
}
```

#### Expected AI Output

```json
{
  "success": true,
  "agenda": [
    "Explain the purpose of database normalization",
    "Understand 1NF, 2NF, and 3NF",
    "Review practical database examples",
    "Discuss common normalization mistakes"
  ],
  "source": "ai"
}
```

#### Deterministic Fallback

If the AI provider is unavailable, the system must still provide a usable fallback.

Example:

```json
{
  "success": true,
  "agenda": [
    "Explain the main problem",
    "Review the relevant course concepts",
    "Discuss possible solutions",
    "Plan the next learning steps"
  ],
  "source": "fallback"
}
```

Requirements:

- AI must not approve or reject requests.
- AI output must be editable.
- AI output must be validated before saving.
- Fallback must work without an AI API key.
- The system must identify whether the result came from AI or fallback.

---

### 4.4 Campus Insights Integration

Campus Insights is the external integration partner.

The platform should use the integration to retrieve lecturer-related information and support advising workflows.

Current integration-related routes include:

- Lecturer information.
- Lecturer availability.
- Lecturer ratings.
- Lecturer topics.
- Lecturer booking statistics.
- Partner webhook receiver.
- Outbound webhook test.

Requirements:

- Handle successful responses.
- Handle missing API keys.
- Handle partner rate limits (`429`).
- Handle partner server errors.
- Handle timeouts.
- Return useful error messages.
- Do not expose API keys or secrets.
- Do not repeatedly send the same webhook event without an agreed retry policy.

#### Webhook Security

Inbound webhook requests must be authenticated using HMAC signature verification.

Webhook events should be checked for duplicate event IDs.

Outbound webhook endpoints must be protected from unauthorized public use before final submission.

---

## 5. Database Requirements

The database must store advising request information and integration event information.

### Suggested advising request fields

| Field          | Purpose                  |
| -------------- | ------------------------ |
| id             | Unique request ID        |
| student_id     | Student identifier       |
| lecturer_email | Selected lecturer        |
| preferred_date | Requested date           |
| preferred_time | Requested time           |
| topic          | Advising topic           |
| description    | Student's problem        |
| agenda         | Accepted agenda          |
| status         | Request status           |
| decision_note  | Lecturer's decision note |
| created_at     | Creation timestamp       |
| updated_at     | Last update timestamp    |

### Suggested integration event fields

| Field        | Purpose              |
| ------------ | -------------------- |
| id           | Unique event ID      |
| event_type   | Event type           |
| payload      | Event data           |
| received_at  | Event timestamp      |
| processed_at | Processing timestamp |
| status       | Processing result    |

These are suggested logical fields. They must be mapped to the existing database tables before implementing migrations.

---

## 6. Security Requirements

Before final submission:

- Add authentication.
- Add role-based access for students and lecturers.
- Students must only access their own requests.
- Lecturers must only perform authorized lecturer actions.
- Protect PATCH and DELETE operations.
- Protect outbound webhook sender endpoints.
- Validate all incoming data.
- Avoid exposing private student information.
- Store API keys and webhook secrets as Worker secrets.
- Never commit secrets to GitHub.

The current baseline does not yet have complete authentication and authorization. This is a known remaining requirement.

---

## 7. Testing Requirements

The project must have at least seven meaningful automated tests.

Recommended test cases:

1. Health endpoint returns success.
2. Create advising request with valid data.
3. Reject invalid advising request data.
4. Retrieve advising requests.
5. Retrieve one request by ID.
6. Update a request.
7. Reject invalid request status.
8. Generate an AI agenda.
9. Generate a fallback agenda when AI is unavailable.
10. Approve a request.
11. Reject a request.
12. Reject invalid webhook signature.
13. Prevent duplicate webhook events.
14. Handle Campus Insights rate limiting.
15. Handle Campus Insights timeout.

Manual testing should also cover the three frontend screens.

---

## 8. Shared Development Rules

All team members must follow these rules.

### Git rules

- Do not directly modify `main`.
- Create a feature branch for each task.
- Commit related changes with clear messages.
- Push the feature branch.
- Create a Pull Request.
- Test before merging.
- Do not overwrite another member's work.

### API contract rules

- Agree on field names before frontend implementation.
- Do not independently invent different request formats.
- Keep response formats consistent.
- Inform the backend owner before changing API behavior.
- Use mock data while the real data structure is being finalized.

### Database rules

- Do not independently modify production database schemas.
- Agree on migrations before applying them.
- Use local/mock data for development.
- Do not insert fictional test data into production without approval.

### Secrets rules

- Never share API keys in source code.
- Never commit `.dev.vars` or secret files.
- Use Cloudflare Worker secrets for production.

---

## 9. Definition of Done

A feature is complete only when:

- It follows the agreed requirements.
- It uses the shared API contract.
- It validates its input.
- It handles errors.
- It works with mock data.
- It passes relevant tests.
- It does not break existing features.
- It has been reviewed and merged through a Pull Request.

The final project should demonstrate:

- Three core frontend screens.
- Working advising request management.
- AI-assisted agenda generation.
- Deterministic fallback.
- Campus Insights integration.
- Secure webhook handling.
- At least seven automated tests.
- Documentation and demonstration evidence.

---

## 10. Final Team Agreement

Before implementation, the team must agree on:

1. Frontend framework.
2. Final API request and response formats.
3. Final D1 schema.
4. AI provider and fallback behavior.
5. Authentication and user roles.
6. Which member owns each feature.
7. Integration testing and final deployment responsibilities.

**This document describes the target requirements. It does not mean every feature is already implemented in the current baseline.**
