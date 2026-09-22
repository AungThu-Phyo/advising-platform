import { Hono } from "hono";

type Bindings = CloudflareBindings & {
  WEBHOOK_SECRET?: string;
  PARTNER_WEBHOOK_SECRET?: string;
  PARTNER_WEBHOOK_URL?: string;
};

type WebhookPayload = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============================================================
// A5 - Integration Info
// GET /
// ============================================================

app.get("/", (c) => {
  return c.json({
    message: "Advising Platform — A5 integration",
    endpoints: [
      "GET /api/health",
      "POST /api/webhooks/partner",
      "POST /api/webhooks/send-test",
      "POST /api/integration/provider-test",
    ],
  });
});

// ============================================================
// Webhook HMAC helpers
// ============================================================

async function createWebhookSignature(
  body: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expectedSignature = await createWebhookSignature(body, secret);

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  // Constant-time style comparison
  let difference = 0;

  for (let i = 0; i < expectedSignature.length; i++) {
    difference |=
      expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return difference === 0;
}

// ============================================================
// Health
// ============================================================

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "advising-platform-api",
  });
});

// ============================================================
// Existing Advising Request API
// ============================================================

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
        error:
          "student_id, agenda, preferred_date, and preferred_time are required",
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

app.get("/api/advising-requests", async (c) => {
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

// ============================================================
// A5 - Webhook Receiver
// POST /api/webhooks/partner
// ============================================================

app.post("/api/webhooks/partner", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;

  if (!secret) {
    return c.json(
      {
        error: "Webhook secret is not configured",
      },
      500
    );
  }

  // Read the raw body BEFORE parsing JSON.
  // HMAC must be calculated against the exact raw request body.
  const rawBody = await c.req.text();

  const signature = c.req.header("X-Webhook-Signature");

  if (!signature) {
    return c.json(
      {
        error: "X-Webhook-Signature header required",
      },
      401
    );
  }

  const validSignature = await verifyWebhookSignature(
    rawBody,
    signature,
    secret
  );

  if (!validSignature) {
    return c.json(
      {
        error: "Invalid webhook signature",
      },
      401
    );
  }

  let payload: WebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return c.json(
      {
        error: "Invalid JSON payload",
      },
      400
    );
  }

  if (!payload.id || !payload.type) {
    return c.json(
      {
        error: "Webhook payload requires id and type",
      },
      400
    );
  }

  // Check whether this event has already been processed.
  const existing = await c.env.advising_db
    .prepare(
      "SELECT id, event_id, status FROM integration_events WHERE event_id = ?"
    )
    .bind(payload.id)
    .first();

  if (existing) {
    return c.json({
      success: true,
      duplicate: true,
      event_id: payload.id,
      message: "Webhook event already processed",
    });
  }

  // Store the verified webhook event.
  await c.env.advising_db
    .prepare(`
      INSERT INTO integration_events
      (event_id, event_type, source, status, payload, response)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      payload.id,
      payload.type,
      "external-partner",
      "processed",
      rawBody,
      JSON.stringify({
        success: true,
        event_id: payload.id,
      })
    )
    .run();

  return c.json({
    success: true,
    duplicate: false,
    event_id: payload.id,
    message: "Webhook accepted",
  });
});

// ============================================================
// A5 - Provider Integration Test
// POST /api/integration/provider-test
// ============================================================

app.post("/api/integration/provider-test", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;

  if (!secret) {
    return c.json(
      {
        error: "Webhook secret is not configured",
      },
      500
    );
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("X-Webhook-Signature");

  if (!signature) {
    return c.json(
      {
        error: "X-Webhook-Signature header required",
      },
      401
    );
  }

  const validSignature = await verifyWebhookSignature(
    rawBody,
    signature,
    secret
  );

  if (!validSignature) {
    return c.json(
      {
        error: "Invalid webhook signature",
      },
      401
    );
  }

  let payload: WebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return c.json(
      {
        error: "Invalid JSON payload",
      },
      400
    );
  }

  if (!payload.id || !payload.type) {
    return c.json(
      {
        error: "Provider payload requires id and type",
      },
      400
    );
  }

  await c.env.advising_db
    .prepare(`
      INSERT INTO integration_events
      (event_id, event_type, source, status, payload, response)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      payload.id,
      payload.type,
      "provider-test",
      "received",
      rawBody,
      JSON.stringify({
        success: true,
        event_id: payload.id,
        message: "Provider request received",
      })
    )
    .run();

  return c.json({
    success: true,
    event_id: payload.id,
    message: "Provider request received",
  });
});

// ============================================================
// A5 - Webhook Sender
// POST /api/webhooks/send-test
// ============================================================

app.post("/api/webhooks/send-test", async (c) => {
  const secret = c.env.PARTNER_WEBHOOK_SECRET;

  if (!secret) {
    return c.json(
      {
        error: "Partner webhook secret is not configured",
      },
      500
    );
  }

  const partnerUrl = c.env.PARTNER_WEBHOOK_URL;

  if (!partnerUrl) {
    return c.json(
      {
        error: "Partner webhook URL is not configured",
        message:
          "Set PARTNER_WEBHOOK_URL when the real partner endpoint is available",
      },
      500
    );
  }

  const payload: WebhookPayload = {
    id: `a5-sender-${crypto.randomUUID()}`,
    type: "test.event",
    data: {
      source: "advising-platform",
      message: "A5 webhook sender test",
    },
  };

  const body = JSON.stringify(payload);

  const signature = await createWebhookSignature(body, secret);

  try {
    const response = await fetch(partnerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body,
    });

    const partnerBody = await response.text();

    await c.env.advising_db
      .prepare(`
        INSERT INTO integration_events
        (event_id, event_type, source, status, payload, response)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        payload.id,
        payload.type,
        "advising-platform-sender",
        response.ok ? "sent" : "failed",
        body,
        partnerBody
      )
      .run();

    return c.json({
      success: response.ok,
      event_id: payload.id,
      partner_status: response.status,
      partner_body: partnerBody,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log the failed attempt for degradation evidence.
    await c.env.advising_db
      .prepare(`
        INSERT INTO integration_events
        (event_id, event_type, source, status, payload, response)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        payload.id,
        payload.type,
        "advising-platform-sender",
        "failed",
        body,
        JSON.stringify({
          error: errorMessage,
        })
      )
      .run();

    // Return a fallback JSON response instead of crashing.
    return c.json(
      {
        success: false,
        event_id: payload.id,
        error: "Partner webhook request failed",
        fallback: true,
        recovery: "retry manually after partner recovery",
      },
      502
    );
  }
});

// ============================================================
// Export
// ============================================================

export default app;