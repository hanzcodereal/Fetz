// tempMail.js — email sementara lewat tempmail.plus (tanpa registrasi)
import { scraperFetch } from "../../scrapers/httpHelper.js";
import { t } from "../../i18n/index.js";

const BASE_URL = "https://tempmail.plus";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const DOMAINS = [
  "mailto.plus",
  "fexpost.com",
  "fexbox.org",
  "mailbox.in.ua",
  "rover.info",
  "chitthi.in",
  "fextemp.com",
  "any.pink",
  "merepost.com",
];

async function api(path, method = "GET") {
  let res;
  try {
    res = await scraperFetch(
      { url: BASE_URL + path, method, headers: { "User-Agent": UA, Referer: BASE_URL + "/", Accept: "application/json" }, rawResponse: true },
      "TempMail",
    );
  } catch {
    throw new Error(t("tm-err-network"));
  }
  let data = res?.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (!data || typeof data !== "object") throw new Error(t("tm-err-invalid-response"));
  if (data.result === false) throw new Error(data?.err?.msg || t("tm-err-network"));
  return data;
}

export const isValidUsername = (u) => /^[A-Za-z0-9]+([.\-_][A-Za-z0-9]+)*$/.test(u);

function randomName() {
  const len = 5 + Math.floor(Math.random() * 3);
  const sets = ["aeouy", "bcdfghkmnpqstvwxz"];
  let type = Math.floor(Math.random() * 2);
  let prob = type ? 5 : 7;
  let word = "";
  for (let i = 0; i < len; i++) {
    word += sets[type].charAt(Math.floor(Math.random() * sets[type].length));
    if (Math.floor(Math.random() * prob) > 1) {
      type = 1 - type;
      prob = type ? 5 : 10;
    }
  }
  return word;
}

// Alamat dibuat lokal; tempmail.plus langsung aktif begitu inbox-nya dicek.
export function createEmail(username, domain) {
  if (username && !isValidUsername(username)) throw new Error(t("tm-err-username"));
  const dmn = domain && DOMAINS.includes(domain) ? domain : DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  return `${username || randomName()}@${dmn}`;
}

const checkEmail = (e) => {
  const p = String(e || "").split("@");
  if (p.length !== 2 || !p[0] || !p[1]) throw new Error(t("tm-err-email-format"));
  return `${p[0]}@${p[1]}`;
};

export async function getInbox(email) {
  email = checkEmail(email);
  const q = new URLSearchParams({ email, limit: "50", epin: "" });
  const d = await api(`/api/mails?${q}`);
  return (Array.isArray(d.mail_list) ? d.mail_list : []).map((m) => ({
    id: String(m.mail_id),
    from: m.from_name ? `${m.from_name} <${m.from_mail}>` : m.from_mail || "",
    subject: m.subject || "",
    time: m.time || "",
    attachments: m.attachment_count || 0,
  }));
}

export async function getMessage(email, id) {
  email = checkEmail(email);
  const q = new URLSearchParams({ email, epin: "" });
  const d = await api(`/api/mails/${encodeURIComponent(id)}?${q}`);
  return {
    from: d.from_name ? `${d.from_name} <${d.from_mail}>` : d.from || "",
    subject: d.subject || "",
    time: d.date || "",
    html: d.html || "",
    text: d.text || "",
    attachments: Array.isArray(d.attachments) ? d.attachments.length : 0,
  };
}

export async function destroyInbox(email) {
  email = checkEmail(email);
  try {
    const q = new URLSearchParams({ email, epin: "" });
    return Boolean((await api(`/api/mails/?${q}`, "DELETE")).result);
  } catch {
    return false;
  }
}
