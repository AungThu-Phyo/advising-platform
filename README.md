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
`SameSite=Lax` cookie. Passwords are hashed with PBKDF2-SHA-256. Run the
authentication migration before using these endpoints:

```txt
npx wrangler d1 migrations apply advising-db --remote
```

New registrations are `STUDENT` accounts. `ADVISOR` and `ADMIN` roles should be
assigned through a controlled database/admin workflow; they cannot be requested
by a public registration.

The Worker serves the authenticated student frontend at `http://localhost:8787/`.
Register or sign in, submit an advising request, and the “My requests” panel
loads only the authenticated student's requests through
`GET /api/advising-requests`. The browser handles the HttpOnly session cookie
automatically.

Student accounts can be assigned an advisor through `users.advisor_email`.
The student UI reads the assigned advisor from `/api/student/advisor` and
loads availability from `/api/student/advisor/availability`. Availability
uses the configured Campus Insights endpoint when available and otherwise
returns clearly labelled local demo slots.

Apply migration `0004_add_advisor_assignments.sql` before using this flow.
`DEFAULT_ADVISOR_EMAIL` can assign the confirmed classroom advisor to new
registrations during local development; production assignments should be
written to `users.advisor_email` by an admin workflow.

wrangler command :

npx wrangler d1 execute advising-db --remote --command "UPDATE users SET advisor_email = 'john.doe@mfu.ac.th' WHERE email = 'student@example.com';"

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
