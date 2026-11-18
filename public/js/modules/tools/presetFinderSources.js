// presetFinderSources.js — cari link video TikTok tanpa watermark (downr, snaptik, tikwm, embed, halaman)
import { scraperFetch } from "../../scrapers/httpHelper.js";

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DOWNR = "https://downr.org";
const DOWNR_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36";

const req = async (opts) => {
  try {
    return await scraperFetch({ rawResponse: true, ...opts }, "Preset Finder");
  } catch {
    return null;
  }
};
const toJson = (r) => {
  if (!r) return null;
  if (r.data && typeof r.data === "object") return r.data;
  try { return JSON.parse(r.data); } catch { return null; }
};

// ---------- pilih URL video dari JSON apa pun (snaptik) ----------
const walk = (o, path, out, depth = 0) => {
  if (depth > 6 || o == null) return;
  if (typeof o === "string") { if (/^https?:\/\//i.test(o)) out.push({ path, url: o }); return; }
  if (Array.isArray(o)) return o.slice(0, 30).forEach((x, i) => walk(x, `${path}[${i}]`, out, depth + 1));
  if (typeof o === "object") {
    const hint = ["type", "kind", "mime", "mimeType", "format", "ext", "extension"].map((k) => o[k]).filter((x) => typeof x === "string").join(" ");
    const base = hint ? `${path}<${hint}>` : path;
    for (const [k, v] of Object.entries(o)) walk(v, base ? `${base}.${k}` : k, out, depth + 1);
  }
};
const score = ({ path, url }) => {
  let s = 0;
  if (/no[_\-. ]?w(ater)?m(ark)?|nowm|without/i.test(path)) s += 10;
  else if (/w(ater)?m(ark)?/i.test(path)) s -= 15;
  if (/video|play|mp4|download|src|link|url/i.test(path)) s += 5;
  if (/<[^>]*(video|mp4)[^>]*>/i.test(path)) s += 4;
  if (/\bhd\b|hd_|_hd|hdplay/i.test(path)) s += 1;
  if (/music|audio|mp3|cover|thumb|avatar|image|photo|poster|origin_cover|dynamic|profile/i.test(path)) s -= 30;
  if (/\.mp4(\?|#|$)/i.test(url)) s += 8;
  if (/\.(jpe?g|png|webp|gif|mp3|m4a|heic|avif)(\?|#|$)/i.test(url)) s -= 30;
  return s;
};
export function pickVideoUrl(data) {
  const out = [];
  walk(data, "", out);
  const best = out.map((c) => ({ ...c, s: score(c) })).filter((c) => c.s > 5).sort((a, b) => b.s - a.s)[0];
  return best ? best.url.replace(/^http:/i, "https:") : null;
}

// ---------- downr.org ----------
async function downrSession() {
  const r = await req({ url: `${DOWNR}/.netlify/functions/analytics`, headers: { "User-Agent": DOWNR_UA, Referer: `${DOWNR}/` } });
  if (!r || r.status >= 400) throw new Error("session");
  const raw = r.headers?.["set-cookie"] || r.headers?.["Set-Cookie"] || "";
  const list = Array.isArray(raw) ? raw : String(raw).split(/,(?=\s*[\w.\-]+=)/);
  return list.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}
const downrConvert = (url, cookie) =>
  req({
    url: `${DOWNR}/.netlify/functions/bbc`,
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DOWNR, Referer: `${DOWNR}/`, "User-Agent": DOWNR_UA, ...(cookie ? { Cookie: cookie } : {}) },
    data: { url },
  });

async function fromDownr(url) {
  try {
    let cookie = await downrSession();
    let r = await downrConvert(url, cookie);
    if (r?.status === 403 && String(r.data).trim() === "user_retry_required") {
      cookie = await downrSession();
      r = await downrConvert(url, cookie);
    }
    if (!r || r.status < 200 || r.status >= 300) return null;
    const j = toJson(r);
    if (!j || j.error) return null;
    const vids = (j.medias || []).filter((m) => m?.type === "video" && !m.is_audio && typeof m.url === "string" && /^https?:\/\//i.test(m.url));
    const q = (m) => String(m.quality || "");
    const pick =
      vids.find((m) => /^no_?watermark$/i.test(q(m))) ||
      vids.find((m) => /no_?watermark/i.test(q(m))) ||
      vids.find((m) => !/watermark|wm/i.test(q(m)));
    return pick ? pick.url.replace(/^http:/i, "https:") : null;
  } catch {
    return null;
  }
}

// ---------- snaptik.fi ----------
async function fromSnaptik(url) {
  const r = await req({
    url: "https://snaptik.fi/api/tiktok",
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", Referer: "https://snaptik.fi/" },
    data: { url },
  });
  if (!r || r.status < 200 || r.status >= 300) return null;
  return pickVideoUrl(toJson(r));
}

// ---------- tikwm.com ----------
async function fromTikwm(user, videoId) {
  const q = new URLSearchParams({ url: `https://www.tiktok.com/@${user || "tiktok"}/video/${videoId}`, hd: "1" });
  const r = await req({ url: "https://www.tikwm.com/api/?" + q, headers: { "User-Agent": UA, Accept: "application/json" } });
  const d = toJson(r)?.data;
  const u = d?.play || d?.hdplay;
  if (!u || typeof u !== "string") return null;
  return /^https?:/i.test(u) ? u.replace(/^http:/i, "https:") : "https://www.tikwm.com" + (u.startsWith("/") ? "" : "/") + u;
}

// ---------- halaman TikTok ----------
async function fromPage(user, videoId) {
  if (!user) return null;
  try {
    const r = await req({ url: `https://www.tiktok.com/@${user}/video/${videoId}`, headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/" } });
    const body = typeof r?.data === "string" ? r.data : "";
    const m = body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
    const vid = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct?.video;
    const cands = [vid?.playAddr, ...(vid?.bitrateInfo || []).flatMap((b) => b?.PlayAddr?.UrlList || []), vid?.downloadAddr];
    return cands.find((u) => typeof u === "string" && /^https:/i.test(u)) || null;
  } catch {
    return null;
  }
}

// urutan sama seperti api/find.js di preset-finder
export async function resolveVideoSrc(canon, user, videoId, embedSrc) {
  let u;
  if ((u = await fromDownr(canon))) return { url: u, from: "downr" };
  if ((u = await fromSnaptik(canon))) return { url: u, from: "snaptik" };
  if ((u = await fromTikwm(user, videoId))) return { url: u, from: "tikwm" };
  if (embedSrc) return { url: embedSrc, from: "embed" };
  if ((u = await fromPage(user, videoId))) return { url: u, from: "page" };
  return null;
}
