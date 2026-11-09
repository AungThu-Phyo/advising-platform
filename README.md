```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## Authentication

The Worker uses D1-backed email/password authentication instead of Firebase Auth:

- `POST /api/auth/register` creates a student account and starts a session.
- `POST /api/auth/login` starts a session for an existing account.
- `GET /api/auth/me` returns the current authenticated user.
- `POST /api/auth/logout` revokes the current session.

Sessions are stored as hashed random tokens and returned in a `Secure`, `HttpOnly`,
`SameSite=Lax` cookie. Passwords are hashed with PBKDF2-SHA-256. Run all
migrations before using these endpoints:

```txt
npx wrangler d1 migrations apply advising-db --remote
```

Migration `0003_create_advising_mvp.sql` contains the canonical authentication
columns for fresh databases. Migration `0009_create_auth_tables.sql` is a
non-destructive compatibility checkpoint for existing databases; it creates
the session table and indexes if they are missing without replacing user data.
Existing users without password credentials must be assigned a password
through an administrative workflow.

New registrations are `STUDENT` accounts. `ADVISOR` and `ADMIN` roles should be
assigned through a controlled database/admin workflow; they cannot be requested
by a public registration.

The Worker serves the authenticated student frontend at `http://localhost:8787/`.
Register or sign in, submit an advising request, and the “My requests” panel
loads only the authenticated student's requests through
`GET /api/advising-requests`. The browser handles the HttpOnly session cookie
automatically.

Students can search for a lecturer after signing in and choose that lecturer as
their advisor. The selection is verified through Campus Insights and stored in
`users.advisor_email` by `POST /api/student/advisor`; subsequent requests are
saved with that advisor email and appear in the advisor's request queue.

For the mock lecturer roster, each lecturer opens “Sign in as Advisor,” chooses
“Set up advisor password” on first use, and creates an individual password for
their email in an active `lecturer_profiles` record. Later sign-ins verify that
password. Password setup is first-claim for this mock roster and does not verify
ownership of real university email addresses; use university SSO or verified
email enrollment before using real lecturer identities.

Student accounts can be assigned an advisor through `users.advisor_email`.
The student UI loads appointment availability for the assigned advisor from
`/api/student/advisor/availability`. Availability uses the configured Campus
Insights endpoint when available and otherwise returns clearly labelled local
demo slots. Advisor details are supplied through the partner lecturer data
surfaces rather than displayed as a separate student-view assignment card. The
Campus Insights lookup and live partner directory are shown only after a
student signs in.

Apply migration `0004_add_advisor_assignments.sql` before using this flow.
`DEFAULT_ADVISOR_EMAIL` can assign the confirmed classroom advisor to new
registrations during local development; production assignments should be
written to `users.advisor_email` by an admin workflow.

Advisor accounts (`role = 'ADVISOR'`) see requests assigned to their email and
can approve or reject pending requests with a decision note from the advisor
view. Apply migration `0005_add_decision_notes.sql` before using decisions.

wrangler command :

to assign an advisor to a student-
npx wrangler d1 execute advising-db --remote --command "UPDATE users SET advisor_email = 'john.doe@mfu.ac.th' WHERE email = 'student@example.com';"

to promote a user account to ADVISOR role-
npx wrangler d1 execute advising-db --remote --command "UPDATE users SET role = 'ADVISOR' WHERE email = 'advisor@example.com';"

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
