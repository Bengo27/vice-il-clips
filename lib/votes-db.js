// Shared helpers for the votes API. Needs a D1 database bound as "DB" in the Pages project settings.
export async function ensureTable(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS votes (clip TEXT NOT NULL, voter TEXT NOT NULL, v INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (clip, voter))"
  ).run();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function noDb() {
  return json({ error: "D1 database not bound as DB" }, 503);
}
