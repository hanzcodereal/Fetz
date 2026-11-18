// waChannel.js — Info Channel WhatsApp (nama, bio, pengikut, foto)
import { scraperFetch } from "../../scrapers/httpHelper.js";
import { t } from "../../i18n/index.js";

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html, attr, key) {
  const p1 = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["'](.*?)["'][^>]*\\/?>`, "is");
  let m = html.match(p1);
  if (m && m[1]) return decodeHtmlEntities(m[1].trim());
  const p2 = new RegExp(`<meta[^>]*content=["'](.*?)["'][^>]*${attr}=["']${key}["'][^>]*\\/?>`, "is");
  m = html.match(p2);
  if (m && m[1]) return decodeHtmlEntities(m[1].trim());
  return null;
}

export async function scrapeWhatsAppChannel(inputUrl) {
  const matchUrl = String(inputUrl || "").match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
  if (!matchUrl) {
    throw new Error(t("wa-err-invalid-url"));
  }

  const channelId = matchUrl[1];
  const targetUrl = `https://www.whatsapp.com/channel/${channelId}`;

  const res = await scraperFetch(
    {
      url: targetUrl,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      rawResponse: true,
    },
    "WhatsApp",
  );

  if (res.status === 404) throw new Error(t("wa-err-not-found"));
  if (res.status < 200 || res.status >= 300) throw new Error(t("wa-err-http", { status: res.status }));

  const html = typeof res.data === "string" ? res.data : "";
  if (html.toLowerCase().includes("channel not found")) {
    throw new Error(t("wa-err-not-found"));
  }

  const title = extractMeta(html, "property", "og:title");
  const image = extractMeta(html, "property", "og:image");
  const description =
    extractMeta(html, "property", "og:description") ||
    extractMeta(html, "name", "twitter:description");
  const ogUrl = extractMeta(html, "property", "og:url");

  if (!title && !description) {
    throw new Error(t("wa-err-parse"));
  }

  let followers = 0;
  let bio = null;

  if (description) {
    const d = description.match(/Channel\s*•\s*([\d.,]+[KMB]?)\s*followers?\s*•\s*(.*)/isu);
    if (d) {
      bio = d[2].replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
      const n = d[1].replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
      if (n) {
        const num = parseFloat(n[1]);
        const unit = (n[2] || "").toUpperCase();
        const mult = unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "B" ? 1e9 : 1;
        followers = Math.round(num * mult);
      }
    } else {
      bio = description;
    }
  }

  return {
    channelId,
    name: title,
    bio,
    avatar: image,
    followers,
    channelUrl: ogUrl || targetUrl,
  };
}
