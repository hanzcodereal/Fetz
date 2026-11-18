// alightPresets.js — Preset Finder: cari link preset Alight Motion (5mb & XML)
// dari link TikTok (deskripsi, bio, komentar, balasan). Semua jalan di aplikasi, tanpa server.
import { scraperFetch } from "../../scrapers/httpHelper.js";
import { t } from "../../i18n/index.js";
import { resolveVideoSrc } from "./presetFinderSources.js";

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const REPLY_UA =
  "com.zhiliaoapp.musically/300000 (Linux; U; Android 13; id_ID; M2101K6G; Build/TKQ1.220829.002; Cronet/TTNetVersion:b4d74d55 2023-02-16 QuicVersion:41928d6a 2023-01-30)";

const AM_HOSTS = ["alight.link", "alight.to", "alight.page.link", "alightcreative.page.link", "alightmotion.page.link"];
const AM_SHARE_RE = /alightcreative\.com\/am\/share\//i;
const FILE_HOSTS = ["drive.google.com", "docs.google.com", "drive.usercontent.google.com", "mediafire.com", "dropbox.com", "mega.nz", "sfile.mobi", "github.com", "gitlab.com"];
const TREE_HOSTS = ["lynk.id", "linktr.ee", "bio.link", "heylink.me", "stan.store", "s.id", "cutt.ly", "bit.ly", "tinyurl.com", "taplink.cc", "soc12.my.id"];
const NOISE_HOSTS = ["tiktok.com", "tiktokcdn.com", "ttwstatic.com", "tiktokv.com", "snssdk.com", "bytedance.com", "byteimg.com", "googleapis.com", "gstatic.com", "apple.com", "w3.org", "schema.org", "cloudflare.com", "amazonaws.com", "instagram.com", "facebook.com", "youtube.com", "x.com", "twitter.com", "t.me", "wa.me", "whatsapp.com"];
const URL_RE = /https?:\/\/[^\s"'<>()[\]{}\\]+/gi;

const cache = new Map();
const CACHE_TTL = 20 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const hostIn = (u, list) => { const h = hostOf(u); return !!h && list.some((x) => h === x || h.endsWith("." + x)); };
const isAm = (u) => AM_SHARE_RE.test(u) || hostIn(u, AM_HOSTS);
const isFile = (u) => hostIn(u, FILE_HOSTS) || /\.(xml|zip|ampreset|json)(\?|$)/i.test(u);
const isNoise = (u) => hostIn(u, NOISE_HOSTS) || /\.(png|jpe?g|webp|gif|svg|ico|woff2?|mp4|mp3|css|js)(\?|$)/i.test(u);
const clean = (u) => u && u.replace(/[.,;:!?)'"»”]+$/, "").replace(/&amp;/g, "&");

function extractLinks(text) {
  const out = new Set();
  const s = String(text || "");
  for (const m of s.matchAll(URL_RE)) { const u = clean(m[0]); if (u) out.add(u); }
  for (const m of s.matchAll(/(?:^|[\s({[>])((?:www\.)?(?:alight\.(?:link|to)\/[\w-]+|alightcreative\.com\/am\/share\/[^\s"'<>]+))/gi)) out.add(clean("https://" + m[1]));
  return [...out];
}

// ---------- HTTP ----------
async function http(url, o = {}) {
  try {
    return await scraperFetch(
      {
        url,
        method: "GET",
        headers: {
          "User-Agent": o.ua || UA,
          Accept: o.accept || "text/html,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: o.referer || "https://www.tiktok.com/",
        },
        rawResponse: true,
      },
      "Preset Finder",
    );
  } catch {
    return null;
  }
}
const bodyOf = (r) => (!r ? "" : typeof r.data === "string" ? r.data : r.data ? JSON.stringify(r.data) : "");
const jsonOf = (r) => {
  if (r && r.data && typeof r.data === "object") return r.data;
  try { return JSON.parse(bodyOf(r)); } catch { return null; }
};

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    }),
  );
  return out;
}

// ---------- TikTok ----------
const extractVideoId = (s) => {
  s = String(s).trim();
  if (/^\d{15,}$/.test(s)) return s;
  for (const p of [/\/video\/(\d{15,})/, /\/v\/(\d{15,})/, /[?&](?:item_id|share_item_id|aweme_id)=(\d{15,})/, /\/(\d{15,})(?:\?|$)/]) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
};
const userFromUrl = (u) => String(u).match(/\/@([^/?#]+)\//)?.[1] || "";

async function resolveTiktok(input) {
  input = String(input).trim();
  if (/^\d{15,}$/.test(input)) return { videoId: input, user: "" };
  let cur = /^https?:\/\//i.test(input) ? input : "https://" + input;
  let id = extractVideoId(cur);
  if (!(id && /tiktok\.com/i.test(cur))) {
    const r = await http(cur, { timeout: 12000 });
    if (r?.url) cur = r.url;
    id = extractVideoId(cur);
    if (!id) {
      const loc = r?.headers?.location || r?.headers?.Location;
      if (loc) { cur = new URL(loc, cur).href; id = extractVideoId(cur); }
    }
    if (!id) {
      const m = bodyOf(r).match(/tiktok\.com\/@[\w.\-]+\/video\/(\d{15,})/);
      if (m) { id = m[1]; cur = m[0]; }
    }
  }
  if (!id) throw new Error(t("alight-err-bad-tiktok"));
  return { videoId: id, user: userFromUrl(cur) };
}

async function getVideoInfo(videoId) {
  for (let i = 0; i < 2; i++) {
    if (i) await sleep(700);
    try {
      const body = bodyOf(await http(`https://www.tiktok.com/embed/v2/${videoId}`));
      const m = body.match(/<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) continue;
      const st = JSON.parse(m[1]);
      const key = Object.keys(st.source?.data || {}).find((k) => k.includes(videoId));
      const v = key && st.source.data[key]?.videoData;
      if (!v) return {};
      return {
        description: v.itemInfos?.text || "",
        createTime: v.itemInfos?.createTime || null,
        comments: v.itemInfos?.commentCount ?? null,
        likes: v.itemInfos?.diggCount ?? null,
        views: v.itemInfos?.playCount ?? null,
        shares: v.itemInfos?.shareCount ?? null,
        cover: v.itemInfos?.coverUrl?.[0] || v.itemInfos?.covers?.[0] || null,
        src: v.itemInfos?.video?.urls?.find((u) => /^https:/i.test(u)) || null,
        user: v.authorInfos?.uniqueId || "",
        nickname: v.authorInfos?.nickName || "",
        avatar: v.authorInfos?.covers?.[0] || null,
        bio: v.authorInfos?.signature || "",
      };
    } catch {}
  }
  return {};
}

async function getProfile(user) {
  if (!user) return { links: [] };
  try {
    const body = bodyOf(await http(`https://www.tiktok.com/@${user}`));
    const m = body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
    let u = {};
    try { u = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.user || {}; } catch {}
    const bm = body.match(/"bioLink":\{"link":"([^"]+)"/);
    const bioLink = bm ? bm[1].replace(/\\u002F/g, "/") : null;
    const links = extractLinks(body).filter((x) => !isNoise(x));
    return { bio: u.signature || "", avatar: u.avatarMedium || null, bioLink, links: [...new Set([...(bioLink ? [bioLink] : []), ...links])] };
  } catch {
    return { links: [] };
  }
}

async function getComments(videoId, author) {
  const all = [];
  let cursor = 0;
  for (let p = 0; p < 4; p++) {
    const q = new URLSearchParams({ device_id: "7000000000000000001", aweme_id: videoId, count: "50", cursor: String(cursor), aid: "1233", app_language: "en", device_platform: "android", os_version: "29", region: "ID" });
    const j = jsonOf(await http(`https://www.tiktok.com/api/comment/list/?${q}`, { accept: "application/json" }));
    if (!j) break;
    const list = j.comments || [];
    for (const c of list) {
      const user = c.user?.unique_id || "";
      all.push({ text: c.text || "", user, pinned: c.author_pin === true, digg: c.digg_count || 0, cid: c.cid || "", replyCount: c.reply_comment_total ?? 0, byAuthor: !!author && user === author });
    }
    if (!j.has_more || !list.length) break;
    cursor = j.cursor ?? cursor + 50;
    await sleep(250);
  }
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.digg - a.digg);
}

async function getReplies(videoId, cid) {
  const q = new URLSearchParams({ device_id: "7185643774736387594", iid: "7129847366169418245", version_code: "300000", aid: "1180", device_platform: "android", channel: "googleplay", app_name: "musically", os_api: "33", os_version: "13", os_name: "Android", device_type: "Redmi Note 10", resolution: "1080*2400", language: "en", aweme_id: videoId, comment_id: String(cid), cursor: "0", count: "20" });
  for (let a = 0; a < 3; a++) {
    if (a) await sleep(400);
    const j = jsonOf(await http(`https://api16.tiktokv.com/aweme/v1/comment/list/reply/?${q}`, { accept: "application/json", ua: REPLY_UA }));
    if (j?.comments?.length) return j.comments.map((c) => ({ text: c.text || "", user: c.user?.unique_id || "", digg: c.digg_count || 0 }));
  }
  return [];
}

// ---------- link Alight / file ----------
async function resolveChain(url) {
  const r = await http(url, { timeout: 10000 });
  if (!r) return { amUrl: isAm(url) ? url : null };
  const loc = decodeURIComponent(r.headers?.location || r.headers?.Location || "");
  const fromIntent = loc.match(/https?:\/\/alightcreative\.com\/am\/share\/[^\s"'<>;]+/i)?.[0];
  if (fromIntent) return { amUrl: fromIntent };
  if (r.url && isAm(r.url)) return { amUrl: r.url };
  const inBody = bodyOf(r).match(/https?:\/\/alightcreative\.com\/am\/share\/[^\s"'<>\\]+/i)?.[0];
  return { amUrl: inBody || (isAm(url) ? url : null) };
}

async function getShareInfo(url) {
  const body = bodyOf(await http(url));
  if (!body) return {};
  const title = body.match(/<title>([\s\S]*?)<\/title>/i);
  const th = [...new Set([...body.matchAll(/https:\/\/firebasestorage\.googleapis\.com\/[^\s"'<>]+thumb-\w+\.jpg[^\s"'<>]*/gi)].map((x) => x[0].replace(/&amp;/g, "&")))];
  th.sort((a, b) => (/thumb-med/i.test(a) ? 0 : 1) - (/thumb-med/i.test(b) ? 0 : 1));
  return {
    title: title ? title[1].replace(/\s+/g, " ").trim().replace(/ - Alight Motion Project$/i, "") : null,
    thumb: th[0] || null,
  };
}

async function getFileInfo(url) {
  const body = bodyOf(await http(url, { timeout: 10000 }));
  const m = body.match(/<title>([\s\S]*?)<\/title>/i);
  return { title: m ? m[1].replace(/\s+/g, " ").trim().replace(/\s+-\s+(Google Drive|MediaFire|Dropbox|Mega)\s*$/i, "") : null };
}

async function harvestTree(url) {
  const body = bodyOf(await http(url));
  const sh = hostOf(url);
  return extractLinks(body).filter((u) => u !== url && !isNoise(u) && hostOf(u) && !hostOf(u).endsWith(sh));
}

// ---------- utama ----------
async function find(input) {
  const { videoId, user: urlUser } = await resolveTiktok(input);
  const info = await getVideoInfo(videoId);
  const user = info.user || urlUser;
  const canon = user ? `https://www.tiktok.com/@${user}/video/${videoId}` : input;
  const [profile, comments, vsrc] = await Promise.all([
    getProfile(user),
    getComments(videoId, user),
    resolveVideoSrc(canon, user, videoId, info.src),
  ]);

  const found = [];
  const seen = new Set();
  const add = (url, kind, x = {}) => {
    const u = clean(url);
    if (!u || seen.has(u) || (isNoise(u) && !isAm(u) && !isFile(u))) return;
    seen.add(u);
    found.push({ url: u, kind, detail: x.detail || null, pinned: !!x.pinned, byAuthor: !!x.byAuthor, digg: x.digg || 0 });
  };
  extractLinks(info.description).forEach((u) => add(u, "description"));
  extractLinks(info.bio || profile.bio).forEach((u) => add(u, "bio"));
  (profile.links || []).forEach((u) => add(u, "bioLink"));
  for (const c of comments) extractLinks(c.text).forEach((u) => add(u, "comment", { pinned: c.pinned, byAuthor: c.byAuthor, digg: c.digg, detail: "@" + c.user }));

  let replyCount = 0;
  if (!found.some((x) => isAm(x.url))) {
    const parents = comments.filter((c) => c.cid && c.replyCount > 0).sort((a, b) => Number(b.byAuthor) - Number(a.byAuthor) || Number(b.pinned) - Number(a.pinned) || b.digg - a.digg).slice(0, 12);
    for (let i = 0; i < parents.length; i += 3) {
      const chunk = await mapLimit(parents.slice(i, i + 3), 3, (p) => getReplies(videoId, p.cid));
      for (const c of chunk.flat()) {
        replyCount++;
        extractLinks(c.text).forEach((u) => add(u, "reply", { byAuthor: !!user && c.user === user, digg: c.digg, detail: "@" + c.user }));
      }
      if (found.some((x) => isAm(x.url)) || (found.some((x) => isFile(x.url)) && i >= 6)) break;
    }
  }

  if (!found.some((x) => isAm(x.url))) {
    const trees = found.filter((x) => hostIn(x.url, TREE_HOSTS)).map((x) => x.url);
    if (trees.length) (await mapLimit(trees, 4, harvestTree)).flat().slice(0, 40).forEach((u) => add(u, "bioLink"));
  }

  const targets = found.filter((x) => !isAm(x.url) && !isFile(x.url) && !hostIn(x.url, NOISE_HOSTS)).slice(0, 15);
  const res = await mapLimit(targets, 5, async (x) => ({ x, ...(await resolveChain(x.url)) }));
  for (const r of res) if (r.amUrl && !seen.has(r.amUrl)) { seen.add(r.amUrl); found.push({ ...r.x, url: r.amUrl, origin: r.x.url }); }

  const presets = found.filter((x) => isAm(x.url) || isFile(x.url)).map((x) => ({ ...x, type: isAm(x.url) ? "5mb" : "xml" }));
  await mapLimit(presets, 4, async (p) => {
    if (p.type === "5mb") { const s = await getShareInfo(p.url); p.title = s.title; p.thumb = s.thumb; }
    else Object.assign(p, await getFileInfo(p.url));
  });

  const def = (x) => /^proyek baru\s*\d+$/i.test(String(x || "").trim());
  for (const p of presets) if (def(p.title)) { const q = presets.find((o) => o !== p && o.detail && o.detail === p.detail && o.title && !def(o.title)); if (q) p.title = q.title; }
  const trust = (p) => p.kind === "description" ? 100 : p.byAuthor ? 90 : p.kind === "bio" ? 85 : p.kind === "bioLink" ? 80 : p.pinned ? 70 : 20 + Math.min(p.digg, 50) / 5;
  presets.sort((a, b) => trust(b) - trust(a) || (a.type === b.type ? 0 : a.type === "5mb" ? -1 : 1));

  return {
    videoId,
    video: { id: videoId, url: `https://www.tiktok.com/@${user}/video/${videoId}`, description: info.description || "", cover: info.cover, src: vsrc?.url || null, srcFrom: vsrc?.from || null, views: info.views, likes: info.likes, comments: info.comments ?? comments.length, shares: info.shares },
    author: { uniqueId: user, nickname: info.nickname, avatar: info.avatar || profile.avatar, bio: info.bio || profile.bio },
    scanned: { comments: comments.length, replies: replyCount },
    presets: presets.map((p) => ({ type: p.type, url: p.url, title: p.title || null, thumb: p.thumb || null, source: p.kind, detail: p.detail, byAuthor: p.byAuthor, pinned: p.pinned })),
  };
}

export async function findPresetsFromTiktok(input) {
  input = String(input || "").trim();
  if (!input) throw new Error(t("alight-err-tiktok-required"));
  if (!/tiktok\.com|^\d{15,}$/i.test(input)) throw new Error(t("alight-err-not-tiktok"));
  const hit = cache.get(input);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.v;
  const v = await find(input);
  if (v.presets.length) cache.set(input, { t: Date.now(), v });
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return v;
}
