// gempaMailUi.js — tampilan & controller alat Cek Gempa dan Temp Mail
import { t } from "../../i18n/index.js";
import { showToast, triggerHaptic } from "../../utils/index.js";
import { fetchGempa } from "./cekGempa.js";
import { DOMAINS, createEmail, getInbox, getMessage, destroyInbox } from "./tempMail.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const errCard = (m) =>
  `<div class="tool-error-card"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><p>${esc(m)}</p></div>`;
const copy = (text, msg) => {
  navigator.clipboard.writeText(text).then(() => showToast(msg), () => {});
};
const viewVisible = (el) => el && !el.classList.contains("hidden") && !document.hidden;

// ============================ CEK GEMPA ============================
export function initGempaController() {
  const view = $("toolGempaView");
  const chips = [...document.querySelectorAll("#gempaChips .sniffer-filter-chip")];
  const refreshBtn = $("gempaRefreshBtn");
  const loader = $("gempaLoader");
  const result = $("gempaResult");
  let kind = "auto";
  let loadedOnce = false;
  let busy = false;

  async function load() {
    if (busy) return;
    busy = true;
    loadedOnce = true;
    refreshBtn.disabled = true;
    loader.classList.remove("hidden");
    result.innerHTML = "";
    try {
      render(await fetchGempa(kind));
    } catch (e) {
      result.innerHTML = errCard(e.message || t("gempa-failed"));
    } finally {
      busy = false;
      refreshBtn.disabled = false;
      loader.classList.add("hidden");
    }
  }

  function render(list) {
    if (!list.length) {
      result.innerHTML = `<div class="tool-empty-box"><p>${esc(t("gempa-empty"))}</p></div>`;
      return;
    }
    const row = (k, v) => (v ? `<div class="tiktok-meta-item"><span class="tiktok-meta-key">${esc(k)}</span><span class="tiktok-meta-val">${esc(v)}</span></div>` : "");
    result.innerHTML =
      list
        .map(
          (g) => `
      <div class="tool-result-card">
        <h4 class="alight-result-title">M ${esc(g.magnitude)} · ${esc(g.region)}</h4>
        <p class="alight-result-file">${esc(g.date)} ${esc(g.time)}</p>
        <div class="tiktok-meta-list">
          ${row(t("gempa-depth"), g.depth)}
          ${row(t("gempa-coords"), g.coordinates)}
          ${row(t("gempa-potential"), g.potential)}
          ${row(t("gempa-felt"), g.felt)}
        </div>
        ${kind === "auto" && g.shakemap ? `<img src="${esc(g.shakemap)}" alt="Shakemap" loading="lazy" referrerpolicy="no-referrer" style="width:100%;border-radius:12px;margin-top:10px" />` : ""}
      </div>`,
        )
        .join("") + `<p class="alight-more-note">${esc(t("gempa-source"))}</p>`;
  }

  chips.forEach((c) =>
    c.addEventListener("click", () => {
      triggerHaptic("light");
      chips.forEach((x) => x.classList.toggle("active", x === c));
      kind = c.dataset.kind;
      load();
    }),
  );
  refreshBtn?.addEventListener("click", () => {
    triggerHaptic("medium");
    load();
  });
  document.querySelector('.tool-card[data-tool="gempa"]')?.addEventListener("click", () => {
    if (!loadedOnce) load();
  });
}

// ============================ TEMP MAIL ============================
const LS_KEY = "fetz_tempmail_addr";

export function initTempMailController() {
  const view = $("toolTempmailView");
  const userIn = $("tmUsername");
  const domainSel = $("tmDomain");
  const createBtn = $("tmCreateBtn");
  const addrBox = $("tmAddress");
  const actions = $("tmActions");
  const refreshBtn = $("tmRefreshBtn");
  const deleteBtn = $("tmDeleteBtn");
  const loader = $("tmLoader");
  const list = $("tmList");
  const viewer = $("tmViewer");

  let email = "";
  let busy = false;
  let timer = null;

  domainSel.innerHTML =
    `<option value="">${esc(t("tm-domain-random"))}</option>` + DOMAINS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  function setEmail(addr) {
    email = addr;
    try { localStorage.setItem(LS_KEY, addr); } catch {}
    addrBox.innerHTML = `
      <div class="tool-result-card" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <h4 class="alight-result-title" style="word-break:break-all;margin:0">${esc(addr)}</h4>
        <button type="button" class="tool-btn-secondary" id="tmCopyBtn"><span>${esc(t("alight-copy-link"))}</span></button>
      </div>`;
    $("tmCopyBtn").addEventListener("click", () => {
      triggerHaptic("light");
      copy(email, t("tm-copied"));
    });
    actions.classList.remove("hidden");
    viewer.innerHTML = "";
  }

  async function refresh(silent) {
    if (!email || busy) return;
    busy = true;
    if (!silent) loader.classList.remove("hidden");
    try {
      renderList(await getInbox(email));
    } catch (e) {
      if (!silent) list.innerHTML = errCard(e.message || t("tm-failed"));
    } finally {
      busy = false;
      loader.classList.add("hidden");
    }
  }

  function renderList(msgs) {
    if (!msgs.length) {
      list.innerHTML = `<div class="tool-empty-box"><p>${esc(t("tm-empty"))}</p></div>`;
      return;
    }
    list.innerHTML = msgs
      .map(
        (m) => `
      <div class="alight-row tm-row" data-id="${esc(m.id)}" style="cursor:pointer">
        <div class="alight-row-info">
          <span class="alight-row-name">${esc(m.subject || t("tm-no-subject"))}</span>
          <span class="alight-row-meta">${esc([m.from, m.time, m.attachments ? t("tm-attachments", { n: m.attachments }) : ""].filter(Boolean).join(" · "))}</span>
        </div>
      </div>`,
      )
      .join("");
    list.querySelectorAll(".tm-row").forEach((r) => r.addEventListener("click", () => openMessage(r.dataset.id)));
  }

  async function openMessage(id) {
    triggerHaptic("light");
    viewer.innerHTML = `<div class="tool-loader-card"><div class="tool-spinner"></div></div>`;
    try {
      const m = await getMessage(email, id);
      const bodyHtml = m.html || `<pre style="white-space:pre-wrap;font-family:inherit">${esc(m.text)}</pre>`;
      const doc = `<base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;font-size:14px;word-break:break-word;margin:8px}img{max-width:100%;height:auto}</style>${bodyHtml}`;
      viewer.innerHTML = `
        <div class="tool-result-card">
          <h4 class="alight-result-title">${esc(m.subject || t("tm-no-subject"))}</h4>
          <p class="alight-result-file">${esc(t("tm-from"))}: ${esc(m.from)}</p>
          <p class="alight-result-file">${esc(m.time)}</p>
          <iframe sandbox="" referrerpolicy="no-referrer" style="width:100%;height:360px;border:0;border-radius:10px;background:#fff"></iframe>
          <div class="alight-result-actions"><button type="button" class="tool-btn-secondary" id="tmCloseMsg"><span>${esc(t("tm-close"))}</span></button></div>
        </div>`;
      viewer.querySelector("iframe").srcdoc = doc;
      $("tmCloseMsg").addEventListener("click", () => (viewer.innerHTML = ""));
      viewer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      viewer.innerHTML = errCard(e.message || t("tm-failed"));
    }
  }

  function startPolling() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!viewVisible(view)) { clearInterval(timer); timer = null; return; }
      refresh(true);
    }, 12000);
  }

  async function create(auto) {
    try {
      const addr = auto ? createEmail() : createEmail(userIn.value.trim(), domainSel.value);
      setEmail(addr);
      list.innerHTML = "";
      await refresh();
      startPolling();
    } catch (e) {
      showToast(e.message || t("tm-failed"));
    }
  }

  createBtn.addEventListener("click", () => {
    triggerHaptic("medium");
    create(false);
  });
  refreshBtn.addEventListener("click", () => {
    triggerHaptic("light");
    refresh();
  });
  deleteBtn.addEventListener("click", async () => {
    if (!email || !confirm(t("tm-confirm-delete"))) return;
    triggerHaptic("medium");
    const ok = await destroyInbox(email);
    showToast(ok ? t("tm-deleted") : t("tm-delete-failed"));
    if (ok) { viewer.innerHTML = ""; refresh(); }
  });

  // buka alat: pakai alamat terakhir, atau buat otomatis kalau belum ada
  document.querySelector('.tool-card[data-tool="tempmail"]')?.addEventListener("click", async () => {
    if (email) { refresh(); startPolling(); return; }
    let saved = "";
    try { saved = localStorage.getItem(LS_KEY) || ""; } catch {}
    if (saved) { setEmail(saved); await refresh(); startPolling(); }
    else create(true);
  });
}
