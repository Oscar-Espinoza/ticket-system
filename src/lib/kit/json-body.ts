/** The request body as a JSON object; null when it isn't valid JSON or isn't an object (arrays included). */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return null;
}
