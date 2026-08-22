import { Hono } from "hono";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// app.get("/message", (c) => {
//   return c.text("Hello Hono!");
// });

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "advising-platform-api",
  });
})

export default app;
