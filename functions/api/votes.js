// GET /api/votes → { scores: { clipId: total } }
import { ensureTable, json, noDb } from "../../lib/votes-db.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  await ensureTable(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT clip, SUM(v) AS s FROM votes GROUP BY clip HAVING s != 0"
  ).all();
  const scores = {};
  for (const r of results) scores[r.clip] = r.s;
  return json({ scores });
}
