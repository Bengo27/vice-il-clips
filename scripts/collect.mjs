// VICE IL CLIPS collector — runs on GitHub Actions every 15 minutes.
// 1. Finds Hebrew streams on Kick that are playing GTA 6 right now and adds them to site/streamers.json
// 2. For every known streamer, pulls their GTA 6 streams and clips since launch into site/data.json
import { readFile, writeFile } from "node:fs/promises";

const GTA = "grand-theft-auto-vi";
const LAUNCH = "2026-11-18T11:00:00Z";
const RX = /gta\s*(6|vi)|גי\s*טי\s*אי|ג['׳]?יטיא?י|גיטאי|גטא/i;
const PIC = "https://files.kick.com/images/user/";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) return r.json();
    if (r.status === 404) throw new Error("404 " + url);
    await sleep(1500 * (i + 1));
  }
  throw new Error("failed " + url);
}
const toIso = s => /Z$/.test(s) ? s : s.replace(" ", "T") + "Z";
const strip = s => s.replace(/\.\d+Z$/, "Z");

const registry = JSON.parse(await readFile("site/streamers.json", "utf8"));
const known = new Set(registry);

// ---- discover: Hebrew streams live now ----
let discovered = 0;
try {
  const j = await get("https://web.kick.com/api/v1/livestreams?limit=100&sort=viewer_count_desc&language=he");
  for (const l of j.data.livestreams) {
    if ((l.category?.slug === GTA || RX.test(l.title || "")) && !known.has(l.channel.slug)) {
      known.add(l.channel.slug); registry.push(l.channel.slug); discovered++;
      console.log("new streamer:", l.channel.slug);
    }
  }
} catch (e) { console.log("discover failed:", e.message); }

// ---- collect each streamer ----
const S = [], C = [];
let ok = 0;
for (const slug of registry) {
  try {
    const ch = await get(`https://kick.com/api/v2/channels/${slug}`);
    const ls = ch.livestream;
    let vids = [];
    try { const v = await get(`https://kick.com/api/v2/channels/${slug}/videos`); vids = Array.isArray(v) ? v : (v.data || []); } catch {}
    const now = new Date().toISOString();
    const wins = vids.map(v => {
      const a = toIso(v.start_time);
      const b = (v.is_live || !v.duration) ? now : new Date(new Date(a).getTime() + v.duration).toISOString();
      return { a, b: strip(b), g: (v.categories || []).some(x => x.slug === GTA) || RX.test(v.session_title || "") };
    }).filter(w => w.g && w.b >= LAUNCH).map(w => [w.a, w.b]);
    const live = !!ls?.is_live;
    S.push([ch.slug, ch.user?.username || ch.slug, (ch.user?.profile_pic || "").replace(PIC, ""),
      live ? (ls.viewer_count || 0) : 0, live ? (ls.session_title || "") : "", live ? (ls.categories?.[0]?.slug || "") : "", wins, live]);
    let cursor = null;
    for (let p = 0; p < 10; p++) {
      const j = await get(`https://kick.com/api/v2/channels/${slug}/clips?sort=date&time=all` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""));
      let old = false;
      for (const c of j.clips || []) {
        if (c.created_at < LAUNCH) { old = true; continue; }
        const inWin = wins.some(([a, b]) => c.created_at >= a && c.created_at <= b);
        if (c.category?.slug === GTA || inWin)
          C.push([c.id, (c.title || "").trim(), c.view_count || 0, c.duration || 0, strip(c.created_at), ch.slug, c.creator?.username || "", c.category?.slug || "", (c.clip_url || "").split("/")[4] || ""]);
      }
      if (old || !j.nextCursor) break;
      cursor = j.nextCursor;
      await sleep(300);
    }
    ok++;
  } catch (e) { console.log(slug, "failed:", e.message); }
  await sleep(400);
}

console.log(`streamers ok: ${ok}/${registry.length}, clips: ${C.length}, new: ${discovered}`);
await writeFile("site/streamers.json", JSON.stringify(registry, null, 1) + "\n");
if (ok === 0) { console.log("Kick unreachable from here — keeping previous data.json"); process.exit(0); }
await writeFile("site/data.json", JSON.stringify({ g: new Date().toISOString(), s: S, c: C }));
