const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const playerSearchInputEl = document.getElementById("playerSearchInput");
const resultsBody = document.getElementById("resultsBody");

let lastRankingRows = [];

function setStatus(msg, isError = false) {
    statusEl.textContent = msg || "";
    statusEl.className = isError ? "status error" : "status";
}

function ratioOneDecimal(deaths, logs) {
    const d = Number(deaths) || 0;
    const l = Number(logs) || 0;
    if (!l) return "0.0";

    const raw = d / l;
    const base = Math.floor(raw * 10) / 10;
    const remainder = raw - base;
    const rounded = remainder >= 0.06 ? base + 0.1 : base;
    return rounded.toFixed(1);
}

function escapeHtml(raw) {
    return String(raw || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function rankBadge(rank) {
    if (rank === 1) return `<span class="rank-badge gold">#1</span>`;
    if (rank === 2) return `<span class="rank-badge silver">#2</span>`;
    if (rank === 3) return `<span class="rank-badge bronze">#3</span>`;
    return `<span class="rank-badge normal">#${rank}</span>`;
}

function renderRanking(rows) {
    if (!rows || !rows.length) {
        resultsBody.innerHTML = `<tr><td colspan="5" class="empty">Nincs találat.</td></tr>`;
        return;
    }

    resultsBody.innerHTML = rows.map((r, idx) => `
    <tr class="player-row" data-mobile-row="${idx}">
      <td><span class="value-slot">${rankBadge(r.rank)}</span></td>
      <td class="name-cell">
        <div class="player-cell value-slot">
          ${r.classIcon ? `<img class="class-icon" src="${escapeHtml(r.classIcon)}" alt="${escapeHtml(r.className || "Class")}" title="${escapeHtml(r.className || "Ismeretlen class")}">` : `<span class="class-icon class-icon-fallback">?</span>`}
          <span class="player-name" style="color:${escapeHtml(r.classColor || "#EDEDED")}">${escapeHtml(r.name)}</span>
          <span class="mobile-rank-inline">${rankBadge(r.rank)}</span>
        </div>
      </td>
      <td>${Number(r.deaths).toLocaleString()}</td>
      <td>${Number(r.logs || 0).toLocaleString()}</td>
      <td>${ratioOneDecimal(r.deaths, r.logs)}</td>
    </tr>
    <tr class="mobile-extra" data-mobile-extra="${idx}">
      <td colspan="5">
        <div class="mobile-extra-grid">
          <div><span>Halálok</span><b>${Number(r.deaths).toLocaleString()}</b></div>
          <div><span>Logok</span><b>${Number(r.logs || 0).toLocaleString()}</b></div>
          <div><span>Arány</span><b>${ratioOneDecimal(r.deaths, r.logs)}</b></div>
        </div>
      </td>
    </tr>
  `).join("");
}

function applySearchFilter() {
    const q = String((playerSearchInputEl && playerSearchInputEl.value) || "").trim().toLowerCase();
    if (!q) {
        renderRanking(lastRankingRows);
        return;
    }
    const filtered = lastRankingRows.filter(r => String(r.name || "").toLowerCase().includes(q));
    renderRanking(filtered);
}

async function api(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: {"Content-Type": "application/json"},
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Sikertelen kérés.");
    return json.data;
}

async function reloadState() {
    const data = await api("GET", "/api/state");
    const ranking = data && Array.isArray(data.ranking) ? data.ranking : [];
    lastRankingRows = ranking.slice();
    applySearchFilter();
    metaEl.textContent = "";
}

if (playerSearchInputEl) {
    playerSearchInputEl.addEventListener("input", applySearchFilter);
}

if (resultsBody) {
    resultsBody.addEventListener("click", (e) => {
        const row = e.target.closest("tr.player-row");
        if (!row) return;
        const key = row.getAttribute("data-mobile-row");
        if (key == null) return;
        const extra = resultsBody.querySelector(`tr.mobile-extra[data-mobile-extra="${key}"]`);
        if (!extra) return;
        row.classList.toggle("expanded");
        extra.classList.toggle("show");
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    setStatus("Betöltés...");
    try {
        await reloadState();
        setStatus("");
    } catch (err) {
        setStatus(String((err && err.message) || err), true);
    }
});
