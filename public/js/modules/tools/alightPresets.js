// alightPresets.js — Preset Finder (katalog, link Alight, Google Drive)
import { scraperFetch } from "../../scrapers/httpHelper.js";
import { t } from "../../i18n/index.js";

export const ALIGHT_BASE_URL = "https://am.zervida.my.id";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: `${ALIGHT_BASE_URL}/runtime/preset.html`,
  Origin: ALIGHT_BASE_URL,
};

async function upstreamJson(path, params) {
  const res = await scraperFetch(
    {
      url: `${ALIGHT_BASE_URL}${path}`,
      method: "GET",
      headers: HEADERS,
      params,
      rawResponse: true,
    },
    "Alight Presets",
  );

  let data = res.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (_) {
      data = null;
    }
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(data?.error || t("alight-err-http", { status: res.status }));
  }
  if (!data || typeof data !== "object") {
    throw new Error(t("alight-err-invalid"));
  }
  if (data.error) throw new Error(data.error);
  return data;
}

export function parseAlightXml(xml) {
  if (!xml || typeof xml !== "string") return null;

  const meta = {
    title: t("alight-untitled"),
    width: 1080,
    height: 1920,
    exportWidth: 1080,
    exportHeight: 1920,
    fps: 30,
    totalTimeMs: 0,
    durationFormatted: "00:00",
    backgroundColor: "#000000",
    bookmarksCount: 0,
    mediaList: [],
  };

  const attr = (source, key) => {
    const m = source.match(new RegExp(`${key}=["']([^"']+)["']`, "i"));
    return m ? m[1] : null;
  };

  const scene = xml.match(/<scene\s+([^>]+)>/i);
  if (scene) {
    const attrs = scene[1];
    meta.title = attr(attrs, "title") ?? meta.title;
    meta.width = parseInt(attr(attrs, "width") ?? "1080", 10);
    meta.height = parseInt(attr(attrs, "height") ?? "1920", 10);
    meta.exportWidth = parseInt(attr(attrs, "exportWidth") ?? String(meta.width), 10);
    meta.exportHeight = parseInt(attr(attrs, "exportHeight") ?? String(meta.height), 10);
    meta.fps = parseFloat(attr(attrs, "fps") ?? "30");
    meta.totalTimeMs = parseInt(attr(attrs, "totalTime") ?? "0", 10);
    meta.backgroundColor = attr(attrs, "bgcolor") ?? meta.backgroundColor;

    if (meta.totalTimeMs > 0) {
      const total = Math.floor(meta.totalTimeMs / 1000);
      const min = String(Math.floor(total / 60)).padStart(2, "0");
      const sec = String(total % 60).padStart(2, "0");
      meta.durationFormatted = `${min}:${sec}`;
    }
  }

  meta.bookmarksCount = (xml.match(/<bookmark\s+t=["'](\d+)["']/gi) || []).length;

  const mediaRegex = /<media\s+([^>]+)\/>/gi;
  let match;
  while ((match = mediaRegex.exec(xml)) !== null) {
    const attrs = match[1];
    meta.mediaList.push({
      uri: attr(attrs, "uri"),
      filename: attr(attrs, "filename") ?? attr(attrs, "title"),
      type: attr(attrs, "type"),
    });
  }
  return meta;
}

function normalizeProjects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      return String(item.name ?? item.title ?? item.id ?? JSON.stringify(item));
    }
    return String(item);
  });
}

function normalizeItems(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const o = item || {};
    return {
      name: String(o.name ?? ""),
      size:
        typeof o.size === "number" || typeof o.size === "string"
          ? o.size
          : undefined,
    };
  });
}

export async function listAlightCatalog() {
  const data = await upstreamJson("/api/presets");
  return {
    presets: normalizeItems(data.presets),
    audio: normalizeItems(data.audio),
    images: normalizeItems(data.images),
  };
}

function buildXmlResult(data, fallbackName) {
  return {
    name: data.xmlName ?? data.name ?? fallbackName,
    xml: data.xml ?? "",
    metadata: data.xml ? parseAlightXml(data.xml) : null,
    availableProjects: normalizeProjects(data.projects),
    mediaCount: Array.isArray(data.media) ? data.media.length : 0,
  };
}

export async function resolveAlightLink(url, project) {
  if (!url) throw new Error(t("alight-err-link-required"));
  const params = { url };
  if (project) params.project = project;
  const data = await upstreamJson("/api/project-xml", params);
  return buildXmlResult(data, "project.xml");
}

export async function fetchAlightDrivePreset(url) {
  if (!url) throw new Error(t("alight-err-drive-required"));
  const data = await upstreamJson("/api/drive-xml", { url });
  const result = buildXmlResult(data, "drive_preset.xml");
  result.availableProjects = [];
  result.mediaCount = 0;
  return result;
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

export async function downloadAlightFile(name) {
  const res = await scraperFetch(
    {
      url: `${ALIGHT_BASE_URL}/preset/${encodeURIComponent(name)}`,
      method: "GET",
      headers: { ...HEADERS, Accept: "*/*" },
      responseType: "blob",
      rawResponse: true,
    },
    "Alight Presets",
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(t("alight-err-download", { status: res.status }));
  }
  const type = res.headers?.["content-type"] || res.headers?.["Content-Type"];
  const data = res.data;
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type });
  if (typeof data === "string" && data.length > 0) return base64ToBlob(data, type);
  throw new Error(t("alight-err-empty"));
}
