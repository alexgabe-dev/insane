// bridge.js
function parseNumberHU(s) {
    // "1 234,56" vagy "1234,56" -> 1234.56
    return parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
}

function scrapeOverlay() {
    const root = document.querySelector('.turt-analytics-overlay');
    if (!root) return {header: null, classStats: [], specStats: []};

    // Header: sample + threshold (ha van)
    const headerEl = root.querySelector('div[style*="opacity"]');
    const headerText = headerEl ? headerEl.textContent.trim() : '';
    // pl: "sample: 804/3216 • threshold (p=75.0%): 1173,775"
    let sample = null, total = null, threshold = null, percentile = null;
    try {
        const m1 = headerText.match(/sample:\s*(\d+)\s*\/\s*(\d+)/i);
        if (m1) {
            sample = parseInt(m1[1], 10);
            total = parseInt(m1[2], 10);
        }
        const m2 = headerText.match(/threshold\s*\(p\s*=\s*([\d.,]+)%\)\s*:\s*([\d.,]+)/i);
        if (m2) {
            percentile = parseNumberHU(m2[1]);
            threshold = parseNumberHU(m2[2]);
        }
    } catch {
    }

    const tables = root.querySelectorAll('table');
    // 0: Class stats, 1: Spec stats
    const classStats = [];
    if (tables[0]) {
        const rows = tables[0].querySelectorAll('tbody tr');
        rows.forEach(r => {
            const tds = Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim());
            if (tds.length >= 4) {
                classStats.push({
                    class: tds[0],
                    count: parseInt(tds[1], 10),
                    avg: parseNumberHU(tds[2]),
                    median: parseNumberHU(tds[3])
                });
            }
        });
    }

    const specStats = [];
    if (tables[1]) {
        const rows = tables[1].querySelectorAll('tbody tr');
        rows.forEach(r => {
            const tds = Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim());
            if (tds.length >= 5) {
                specStats.push({
                    class: tds[0],
                    spec: tds[1],
                    count: parseInt(tds[2], 10),
                    avg: parseNumberHU(tds[3]),
                    median: parseNumberHU(tds[4])
                });
            }
        });
    }

    return {
        header: {sample, total, threshold, percentile},
        classStats,
        specStats
    };
}

console.debug('[TurtLogs Analyzer] bridge loaded');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'RUN_ANALYSIS') return;

    // IMPORTANT: tell Chrome we'll respond async — return true *synchronously*
    (async () => {
        try {
            if (typeof window.analyzeTurtLogs !== 'function') {
                throw new Error('window.analyzeTurtLogs is not available');
            }

            // kick off the analysis on the page
            await window.analyzeTurtLogs({percentile: msg.percentile});

            // give the overlay a moment to render, then scrape
            setTimeout(() => {
                try {
                    const data = scrapeOverlay();
                    sendResponse({ok: true, data});
                } catch (e) {
                    sendResponse({ok: false, error: String(e?.message || e)});
                }
            }, 150);
        } catch (e) {
            sendResponse({ok: false, error: String(e?.message || e)});
        }
    })();

    return true; // <-- keep the message channel open
});
