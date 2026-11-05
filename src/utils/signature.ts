export async function createWebhookSignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const expected = await createWebhookSignature(body, secret);
  if (signature.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
