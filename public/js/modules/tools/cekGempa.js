// cekGempa.js — data gempa BMKG (terbaru, M5.0+, dirasakan)
import { scraperFetch } from "../../scrapers/httpHelper.js";
import { t } from "../../i18n/index.js";

const BASE = "https://data.bmkg.go.id/DataMKG/TEWS/";
const FILES = {
  auto: "autogempa.json",
  terkini: "gempaterkini.json",
  dirasakan: "gempadirasakan.json",
};

function normalize(g) {
  const shake = g?.Shakemap ? BASE + g.Shakemap : null;
  return {
    date: g?.Tanggal || "",
    time: g?.Jam || "",
    datetime: g?.DateTime || "",
    magnitude: g?.Magnitude || "-",
    depth: g?.Kedalaman || "",
    coordinates: g?.Coordinates || "",
    region: g?.Wilayah || "",
    potential: g?.Potensi || "",
    felt: g?.Dirasakan || "",
    shakemap: shake,
  };
}

export async function fetchGempa(kind) {
  const file = FILES[kind];
  if (!file) throw new Error(t("gempa-failed"));
  const res = await scraperFetch(
    { url: BASE + file, method: "GET", headers: { Accept: "application/json" }, rawResponse: true },
    "BMKG",
  );
  if (!res || res.status < 200 || res.status >= 300) throw new Error(t("gempa-failed"));
  let d = res.data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d.replace(/[\u0000-\u001F\u007F-\u009F]/g, ""));
    } catch {
      throw new Error(t("gempa-failed"));
    }
  }
  const raw = d?.Infogempa?.gempa;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map(normalize);
}
