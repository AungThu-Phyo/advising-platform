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

app.post("/api/advising-requests", async (c) => {
  const body = await c.req.json<{
    student_id: string;
    agenda: string;
    preferred_date: string;
    preferred_time: string;
  }>();

  if (
    !body.student_id ||
    !body.agenda ||
    !body.preferred_date ||
    !body.preferred_time
  ) {
    return c.json(
      {
        error: "student_id, agenda, preferred_date, and preferred_time are required",
      },
      400
    );
  }

  const result = await c.env.advising_db
    .prepare(`
      INSERT INTO advising_requests
      (student_id, agenda, preferred_date, preferred_time)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `)
    .bind(
      body.student_id,
      body.agenda,
      body.preferred_date,
      body.preferred_time
    )
    .first();

  return c.json(result, 201);
});

app.get("/api/advising-requests", async (c) =>{
  const result = await c.env.advising_db
    .prepare("SELECT * FROM advising_requests ORDER BY id DESC")
    .all();

  return c.json(result.results);
});

app.get("/api/advising-requests/:id", async (c) => {
  const id = c.req.param("id");

  const result = await c.env.advising_db
    .prepare("SELECT * FROM advising_requests WHERE id = ?")
    .bind(id)
    .first();

  if (!result) {
    return c.json(
      {
        error: "Advising request not found",
      },
      404
    );
  }

  return c.json(result);
});

app.patch("/api/advising-requests/:id", async (c) => {
  const id = c.req.param("id");

  const body = await c.req.json<{
    agenda?: string;
    preferred_date?: string;
    preferred_time?: string;
    status?: string;
  }>();

  if (
    body.agenda === undefined &&
    body.preferred_date === undefined &&
    body.preferred_time === undefined &&
    body.status === undefined
  ) {
    return c.json(
      {
        error: "At least one field is required to update",
      },
      400
    );
  }

  const result = await c.env.advising_db
    .prepare(`
      UPDATE advising_requests
      SET
        agenda = COALESCE(?, agenda),
        preferred_date = COALESCE(?, preferred_date),
        preferred_time = COALESCE(?, preferred_time),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `)
    .bind(
      body.agenda ?? null,
      body.preferred_date ?? null,
      body.preferred_time ?? null,
      body.status ?? null,
      id
    )
    .first();

  if (!result) {
    return c.json(
      {
        error: "Advising request not found",
      },
      404
    );
  }

  return c.json(result);
});

app.delete("/api/advising-requests/:id", async (c) => {
  const id = c.req.param("id");

  const result = await c.env.advising_db
    .prepare("DELETE FROM advising_requests WHERE id = ? RETURNING *")
    .bind(id)
    .first();

  if (!result) {
    return c.json(
      {
        error: "Advising request not found",
      },
      404
    );
  }

  return c.body(null, 204);
});

export default app;
