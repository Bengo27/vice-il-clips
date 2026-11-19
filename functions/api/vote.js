// POST /api/vote  { clip, voter, v: 1 | -1 | 0 }  → { score }
// One vote per (clip, voter); v = 0 removes the vote.
import { ensureTable, json, noDb } from "../../lib/votes-db.js";

const CLIP = /^clip_[A-Za-z0-9]{10,40}$/;
const VOTER = /^[A-Za-z0-9-]{8,64}$/;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const { clip, voter } = body || {};
  const v = Number(body?.v);
  if (!CLIP.test(clip || "") || !VOTER.test(voter || "") || ![1, -1, 0].includes(v))
    return json({ error: "bad input" }, 400);

  await ensureTable(env.DB);
  if (v === 0) {
    await env.DB.prepare("DELETE FROM votes WHERE clip = ? AND voter = ?").bind(clip, voter).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO votes (clip, voter, v, at) VALUES (?, ?, ?, ?) ON CONFLICT (clip, voter) DO UPDATE SET v = excluded.v, at = excluded.at"
    ).bind(clip, voter, v, Date.now()).run();
  }
  const row = await env.DB.prepare("SELECT COALESCE(SUM(v), 0) AS s FROM votes WHERE clip = ?").bind(clip).first();
  return json({ score: row.s });
}
