const qs = s => document.querySelector(s);

function toPctile(v) {
    return Math.max(1, Math.min(100, Number(v) || 75)) / 100;
}

function fmt(n) {
    return n.toLocaleString(undefined, {maximumFractionDigits: 2});
}

function normalize(arr) {
    const nums = arr.map(n => Number(n) || 0);
    const min = Math.min(...nums), max = Math.max(...nums);
    if (!isFinite(min) || !isFinite(max) || max === min) return nums.map(() => 1);
    return nums.map(v => (v - min) / (max - min));
}

function orient(normVals, lowerIsBetter) {
    return lowerIsBetter ? normVals.map(v => 1 - v) : normVals;
}

// S 10% • A next 20% • B next 30% • C next 25% • D rest
function toTier(i, total) {
    const q = (i + 1) / total;
    if (q <= 0.10) return 'S';
    if (q <= 0.30) return 'A';
    if (q <= 0.60) return 'B';
    if (q <= 0.85) return 'C';
    return 'D';
}

function renderTiers(container, ranked, label) {
    const groups = {S: [], A: [], B: [], C: [], D: []};
    ranked.forEach(r => groups[r.tier].push(r));

    container.innerHTML = ['S', 'A', 'B', 'C', 'D'].map(t => {
        const pills = groups[t].map(r => `
      <div class="pill">
        <b>${r.class} ${r.spec}</b>
        <span class="right">${label(r)}</span>
      </div>`).join('') || `<div class="muted" style="padding:6px 8px">—</div>`;

        // details/summary for collapsible tier
        return `
      <section class="tier">
        <details class="tier-details" open>
          <summary class="th">
            <span class="badge ${t}">${t}</span>
            <strong style="margin-right:6px">Tier</strong>
            <span class="muted" style="font-weight:400">(${groups[t].length})</span>
          </summary>
          <div class="wrap">${pills}</div>
        </details>
      </section>`;
    }).join('');
}


async function fetchData(percentile) {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !/https:\/\/(www\.)?turtlogs\.com\//i.test(tab.url || "")) {
        throw new Error("Open turtlogs.com (PvE rankings) then try again.");
    }
    const res = await chrome.tabs.sendMessage(tab.id, {type: 'RUN_TURTLOGS', percentile});
    if (!res?.ok) throw new Error(res?.error || "No response (is the site loaded and content script injected?)");
    return res.data; // { sample, threshold, specs, classes }
}

async function runTier() {
    qs('#meta').textContent = "Loading…";
    const pct = toPctile(qs('#pct').value);
    const metric = qs('#metric').value;
    const wPop = Number(qs('#wPop').value) || 0.45;
    const wMed = Number(qs('#wMed').value) || 0.55;

    try {
        const data = await fetchData(pct);
        const metricInfo = data.metric || {};
        const lowerIsBetter = !!metricInfo.lowerIsBetter;
        const sourceMetricName = metricInfo.name || 'Unknown metric';
        const specs = data.specs.slice();

        // 1) compute popularity ON EACH SPEC
        const totalCount = specs.reduce((a, b) => a + (b.count || 0), 0);
        const withPop = specs.map(s => ({
            ...s,
            popularity: totalCount ? (s.count || 0) / totalCount : 0  // 0..1
        }));

        // 2) vectors only used for normalization/combined
        const avgN = normalize(withPop.map(s => +s.avg || 0));
        const medN = normalize(withPop.map(s => +s.median || 0));
        const popN = normalize(withPop.map(s => s.popularity));

        // 3) choose score
        let score;
        if (metric === 'pop') score = popN;
        else if (metric === 'avg') score = orient(avgN, lowerIsBetter);
        else if (metric === 'med') score = orient(medN, lowerIsBetter);
        else { // combo (pop + median by your weights)
            const medOriented = orient(medN, lowerIsBetter);
            const raw = withPop.map((_, i) => wPop * popN[i] + wMed * medOriented[i]);
            score = normalize(raw);
        }

        // 4) rank using the computed score
        const ranked = withPop
            .map((s, i) => ({...s, score: score[i]}))
            .sort((a, b) =>
                (b.score - a.score) ||
                (lowerIsBetter ? (a.median - b.median) : (b.median - a.median)) ||
                (lowerIsBetter ? (a.avg - b.avg) : (b.avg - a.avg))
            )
            .map((s, idx, arr) => ({...s, rank: idx + 1, tier: toTier(idx, arr.length)}));

        // 5) labels now read r.popularity (no index mismatch ever again)
        const tiers = qs('#tiers');
        const label = (r) => {
            if (metric === 'pop') return `${(r.popularity * 100).toFixed(2)}%`;
            if (metric === 'avg') return `${fmt(r.avg)} avg`;
            if (metric === 'med') return `${fmt(r.median)} med`;
            return `${(r.popularity * 100).toFixed(1)}% • ${fmt(r.median)} med`;
        };
        renderTiers(tiers, ranked, label);

        qs('#meta').textContent =
            `source=${sourceMetricName} • sample=${data.sample}, threshold=${fmt(data.threshold)} • ranked ${ranked.length} specs by ` +
            (metric === 'pop'
                ? 'Popularity'
                : metric === 'avg'
                    ? `Avg value (${lowerIsBetter ? 'lower is better' : 'higher is better'})`
                    : metric === 'med'
                        ? `Median value (${lowerIsBetter ? 'lower is better' : 'higher is better'})`
                        : `Combined (wPop=${wPop}, wMed=${wMed}, ${lowerIsBetter ? 'lower is better' : 'higher is better'})`);
    } catch (e) {
        qs('#meta').textContent = String(e.message || e);
        qs('#tiers').innerHTML = "";
    }
}

// wiring
qs('#metric').addEventListener('change', () => {
    qs('#comboBox').style.display = qs('#metric').value === 'combo' ? '' : 'none';
});
qs('#run').addEventListener('click', runTier);

// optional: auto-run when popup opens
document.addEventListener('DOMContentLoaded', runTier);
