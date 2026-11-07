```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## Classroom demo frontend

The Worker serves a small frontend at `http://localhost:8787/`. It uses a
mock student selector rather than authentication. Select a student, submit an advising request, and the
“My requests” panel loads only that student's requests through
`GET /api/advising-requests?student_id=...`.

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
