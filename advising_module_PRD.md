# Product Requirements Document

## 1. Product Overview

### Product Name
University Digital Campus — Advising Module

### Problem Statement
Students struggle to secure timely, productive academic advising due to fragmented advisor availability, manual booking friction, and a lack of pre-appointment agenda alignment. Consequently, advising sessions frequently devolve into administrative alignment rather than high-value academic guidance.

### Target Users
* **Students:** Undergraduates/graduates seeking degree planning, course overrides, academic recovery, or career guidance.
* **Academic Advisors:** Faculty or dedicated staff managing packed schedules, student caseloads, and session records.
* **Advising Administrators:** Department heads managing staff rosters, oversight, and escalated student cases.

### Product Goal
Provide a streamlined web platform that allows students to discover advisor availability, book slots with prepared agendas, and enable advisors to manage appointments and private session notes securely.

---

## 2. Scope

### In Scope
* Advisor availability slot management (create, view, delete).
* Slot discovery and filtering by advisor, department, or date.
* Atomic appointment booking with agenda submission (structured fields or raw text).
* AI agenda summarization with automatic fallback to structured/raw form text.
* Appointment cancellation workflow with slot release/update.
* Appointment history and private/shared session notes management.
* Restricted attendance flag visibility for assigned advisors.
* Publishing event payloads (`advising.booked`, `advising.reminder`, `advising.cancelled`) to a Notification Hub.
* Database-level privacy isolation for advisor private notes.

### Out of Scope
* Two-way calendar synchronizations (Google Calendar, Outlook Exchange).
* Automatic video room creation (Zoom, Webex, Teams).
* In-app real-time messaging, chat, or direct video streaming.
* Native mobile applications (iOS/Android).
* Advanced predictive drop-out forecasting analytics.

---

## 3. User Roles

### User (Student)
Can browse open slots, submit booking requests with agendas, cancel own appointments, and view own appointment history and shared notes. **Assumption:** Student identity is provided via external SSO/Auth tokens.

### User (Advisor)
Can manage own available time slots, view assigned appointments and agendas, view student attendance flags for assigned sessions, complete appointments, and write private/shared session notes.

### Admin (Advising Administrator)
Can manage staff rosters, view department-wide availability and appointment history, and override slot/appointment management when escalated.

---

## 4. User Journey

### Main Journey
1. **View Advisor Availability:** Student searches open, unexpired slots filtered by advisor, department, or date range.
2. **Select Open Slot:** Student picks an available slot and fills out the pre-appointment agenda (structured fields or raw text).
3. **Submit Request & Agenda:** System atomically locks the slot, runs AI agenda summarization (or fallback), creates the appointment record, and emits `advising.booked`.
4. **Complete Session & Manage Notes:** Advisor conducts session, views student attendance flags, completes appointment, and writes private/shared notes.

---

## 5. Functional Requirements

### FR-01: Advisor Availability Management
Advisors must be able to create, view, and delete available appointment time slots. System must prevent creation of overlapping slots for the same advisor.

### FR-02: Slot Discovery & Search
Students must be able to browse and filter open, unexpired slots by advisor name, department, or date range.

### FR-03: Appointment Booking & Agenda Submission
Students must select an open slot and submit an appointment request requiring an agenda (raw text or structured topic/goal inputs).

### FR-04: Atomic Booking & Clash Prevention
System must enforce atomic transactions during booking to prevent double-booking of a single slot ID or overlapping bookings for the same student.

### FR-05: AI Agenda Processing & Fallback
System must process student-submitted raw text agendas into a structured summary for the advisor, falling back automatically to raw text or structured form input if processing fails.

### FR-06: Status Lifecycle & Cancellation
Students and advisors must be able to cancel an upcoming appointment. Cancellation updates appointment status to `CANCELLED`, frees/updates slot availability, and emits `advising.cancelled`.

### FR-07: Appointment History & Notes Management
Advisors must be able to attach private notes and outcome summaries to a completed appointment. Students can view past history and shared notes, but **never** advisor private notes.

### FR-08: Asynchronous Notification Events
System must publish asynchronous event triggers (`advising.booked`, `advising.reminder`, `advising.cancelled`) to a mock or external Notification Hub payload handler.

---

## 6. Non-Functional Requirements

### NFR-01 Performance
Read queries (slot listing, history retrieval) must respond in under 500ms under standard loads (< 50 concurrent users).

### NFR-02 Security
Private notes (`isPrivate == true`) must be isolated at the database security level (Firestore Security Rules) so they are unreadable by student client queries or general analytics queries.

### NFR-03 Availability
System must support baseline availability on free-tier hosting infrastructure, maintaining operational stability for demo and testing scenarios.

### NFR-04 Cost
**Total deployment cost must be 0 THB.** Infrastructure and third-party integrations must operate strictly within perpetual free-tier quotas.

---

## 7. Business Rules

### BR-01: Booking Lead Time
Students cannot book appointments less than 2 hours prior to the slot start time.

### BR-02: Cancellation Window
Cancellations must occur at least 1 hour prior to appointment start time; late cancellations are flagged for administrative audit.

### BR-03: Attendance Flag Access
Attendance flags (e.g., low attendance warnings) are accessible to an advisor **only** if an active or scheduled appointment exists with that specific student.

### BR-04: Single Slot Occupancy
A time slot can transition to `BOOKED` state exactly once. Double-booking the same slot ID is strictly prohibited.

---

## 8. Data Model

### User (`users/{userId}`)
* `uid` (String, Primary Key)
* `email` (String)
* `name` (String)
* `role` (Enum: `STUDENT`, `ADVISOR`, `ADMIN`)
* `department` (String, Optional)

### Slot (`slots/{slotId}`)
* `slotId` (String, Primary Key)
* `advisorId` (String, Foreign Key -> `users.uid`)
* `startTime` (Timestamp)
* `endTime` (Timestamp)
* `status` (Enum: `OPEN`, `BOOKED`, `CANCELLED`)

### Appointment (`appointments/{appointmentId}`)
* `appointmentId` (String, Primary Key)
* `slotId` (String, Foreign Key -> `slots.slotId`)
* `studentId` (String, Foreign Key -> `users.uid`)
* `advisorId` (String, Foreign Key -> `users.uid`)
* `status` (Enum: `CONFIRMED`, `COMPLETED`, `CANCELLED`)
* `createdAt` (Timestamp)
* `agenda` (Map: `topic`, `rawText`, `summaryText`)

### Note (`appointments/{appointmentId}/notes/{noteId}`)
* `noteId` (String, Primary Key)
* `authorId` (String, Foreign Key -> `users.uid`)
* `content` (String)
* `isPrivate` (Boolean - `true` for advisor-only, `false` for shared)
* `createdAt` (Timestamp)

---

## 9. Architecture

### Architecture Overview
Serverless single-page app (SPA) architecture. The React frontend interacts directly with Firestore for read-heavy operations validated by Security Rules, while transactional logic (booking, clash prevention, AI summary processing) executes in isolated Cloud Functions via HTTPS Callables using `db.runTransaction()`.

### Architecture Diagram

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                             FIREBASE PLATFORM                               │
 │                                                                             │
 │  ┌────────────────────────┐      HTTPS      ┌────────────────────────────┐  │
 │  │  Firebase Hosting      │ ──────────────> │  Cloud Functions (Node)    │  │
 │  │  (React / Vite SPA)    │                 │  • Book Slot Transaction   │  │
 │  │                        │                 │  • AI Agenda Summarizer    │  │
 │  └───────────┬────────────┘                 └─────────────┬──────────────┘  │
 │              │                                            │                 │
 │              │ Direct Client Query                        │ Admin SDK       │
 │              │ (Validated by Security Rules)              │                 │
 │              ▼                                            ▼                 │
 │  ┌────────────────────────┐                 ┌────────────────────────────┐  │
 │  │    Firebase Auth       │                 │  Cloud Firestore (NoSQL)   │  │
 │  │  (Identity & Tokens)   │                 │  (Security Rules Enforced) │  │
 │  └────────────────────────┘                 └────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### Components

#### Frontend
React (Vite) + Tailwind CSS, hosted on Firebase Hosting. Manages UI components, state, and client-side authentication listeners.

#### Backend
Firebase Cloud Functions (Node.js runtime). Handles transactional slot locking, AI agenda processing, event publishing, and administrative mutations.

#### Database
Cloud Firestore (NoSQL document store). Manages collections for Users, Slots, Appointments, and Notes subcollections.

#### Authentication
Firebase Auth. Handles user identity tokens, session management, and role assertion for security rules. **Assumption:** SSO integration is mocked or maps directly to Firebase Auth UIDs.

#### Storage
Firebase Hosting assets storage. (File uploads are out of scope for MVP).

#### External Services
Mock/HTTP payload listener for Notification Hub (`advising.booked`, `advising.reminder`, `advising.cancelled`).

---

## 10. Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React (Vite) + Tailwind CSS | Rapid UI development, lightweight bundle, 0 THB cost. |
| Backend | Firebase Cloud Functions (Node.js) | Serverless execution, seamless Firestore transaction SDK, free-tier support. |
| Database | Cloud Firestore | Managed serverless database with native real-time capabilities and security rules. |
| Auth | Firebase Auth | Built-in token management and security rule integration. |
| Hosting | Firebase Hosting | Free SSL, global CDN, zero-configuration deployment via Firebase CLI. |

---

## 11. API / Interfaces

### API-01: `bookAppointment` (HTTPS Callable Cloud Function)
* **Request:** `{ slotId: string, agenda: { topic: string, rawText: string } }`
* **Behavior:** Runs atomic Firestore transaction to verify `slots/{slotId}` is `OPEN`, updates status to `BOOKED`, creates `appointments/{appointmentId}`, runs agenda summary (or fallback), and emits notification event.
* **Response:** `{ success: boolean, appointmentId: string }`

### API-02: `cancelAppointment` (HTTPS Callable Cloud Function)
* **Request:** `{ appointmentId: string, reason: string }`
* **Behavior:** Verifies caller authorization (Student or Advisor), updates appointment status to `CANCELLED`, releases/updates slot status, and emits `advising.cancelled`.
* **Response:** `{ success: boolean }`

---

## 12. Security

### Authentication
All requests must present a valid Firebase Auth ID Token. Unauthenticated access to private data paths is rejected.

### Authorization
Role-based and resource-based access enforced via Firestore Security Rules and Cloud Functions:
* Students can read/write only their own appointment records.
* Advisors can manage their own slots and access appointments assigned to their `advisorId`.

### Data Protection
Private advisor notes (`notes/{noteId}` with `isPrivate == true`) are strictly unreadable by student UIDs at the Firestore engine level. Private notes are excluded from general analytics endpoints and responses (`NFR-02`).

---

## 13. Error Handling

### Expected Errors
* `SLOT_ALREADY_BOOKED`: Attempting to book a slot that transitioned to `BOOKED`. Error message returned: "This slot is no longer available."
* `INVALID_LEAD_TIME`: Attempting to book less than 2 hours before slot start (`BR-01`). Error returned: "Appointments must be booked at least 2 hours in advance."
* `UNAUTHORIZED_NOTE_ACCESS`: Student attempting to fetch private notes. Error returned: "Permission denied."

### Failure Scenarios
* **AI Summarization API Failure:** Cloud Function catches API timeout/failure, sets `summaryText = rawText`, logs warning, and completes booking transaction successfully (`FR-05`).
* **Concurrent Transaction Conflict:** Transaction automatically retries up to max limits before returning a failed lock response to client.

---

## 14. Deployment

### Development
1. Developers run `firebase emulators:start` locally.
2. Local React frontend connects to local Auth (port 9099), Firestore (port 8080), and Functions (port 5001).

### Production
1. Build frontend static assets: `npm run build`.
2. Deploy rules, functions, and web app to production project: `firebase deploy`.
3. Target environment runs on standard Firebase Free Tier hosting.

---

## 15. Constraints

* **Budget:** 0 THB.
* **Time:** 1 Academic Semester (12–14 weeks).
* **Team:** 3–5 student developers.
* **Free Tier Limits:** Cloud Firestore (1 GiB storage, 50k reads/day, 20k writes/day), Cloud Functions (2M invocations/month).

---

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Race condition during simultaneous slot bookings (`FR-04`) | High | Enforce all booking updates through server-side `db.runTransaction()` in Cloud Functions. |
| Exceeding free-tier daily quotas during development | Medium | Mandate local development using Firebase Emulators for daily coding and testing. |
| AI agenda processing delays/failures | Low | Implement graceful fallback assigning `summaryText` directly from `rawText`. |

---

## 17. Acceptance Criteria

### MVP is complete when:
- [ ] Advisor can create open time slots, and students can view unexpired open slots filtered by advisor/department/date.
- [ ] Student can select an open slot, submit an agenda, and successfully book the appointment.
- [ ] Simultaneous booking attempts on the same slot result in exactly one successful booking and an error message for the other user.
- [ ] Failing or timing-out AI summarization safely preserves raw agenda text without aborting appointment creation.
- [ ] Student accounts querying appointment notes receive zero records marked `isPrivate == true`.
- [ ] Appointment cancellation correctly updates appointment status to `CANCELLED` and emits the `advising.cancelled` payload.
- [ ] Total deployment executes on free-tier services with zero financial cost (0 THB).

---

## 18. Future Improvements

- Two-way integration with Google Calendar and Microsoft Outlook calendars.
- Automated provisioning of Zoom/Teams meeting rooms upon appointment confirmation.
- Direct in-app video calls and instant messaging between students and advisors.
- Native mobile application support for iOS and Android platforms.
