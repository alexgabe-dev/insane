const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {chromium} = require("playwright");

const app = express();
const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || "127.0.0.1";

app.use(express.json({limit: "200kb"}));
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const AUTO_EXCLUSIONS = [
    "Greater Feral Spirit",
    "Spectral Deathknight",
    "Fire Nova Totem V",
    "Servant of Alexi Barov",
    "Whiskasender",
    "Wolf",
    "Cat",
    "Servant of Weldon Barov",
    "Magma Totem IV",
    "Searing Totem VI",
    "Deathknight Understudy",
    "Mana Spring Totem IV",
    "Strength of Earth Totem V",
    "Fire Nova Totem IV",
    "Flametongue Totem IV",
    "Windfury Totem",
    "Arcanite Dragonling",
    "Naxxramas Worshipper",
    "Cinder Elemental",
    "Unknown",
    "TrapticsPet",
    "Bait",
    "Tapipet",
    "Blacki",
    "Raptor",
    "csumisz",
    "Serpent",
    "Zilham",
    "Belisarius",
    "Macska",
    "Kupqua",
    "Sproutling",
    "Hyena",
    "Infernal",
    "Orban",
    "Felguard",
    "Kyra",
    "Yaztal",
    "Gobpad",
    "Whitefang",
    "Hokuszpok",
    "Kapafog",
    "KONG",
    "Mocsok",
    "NemOrban",
    "Scorpid",
    "Bizloz",
    "Cicmic",
    "Ghaadym",
    "Glyevere",
    "Grimnar",
    "Karkol",
    "Kasha",
    "Kraggak",
    "Shaahun",
    "Shpata",
    "Solarfang",
    "Thornling",
    "Traafum",
    "Glynora",
    "Rupnam"
];
const CLASS_INFO = {
    1: {key: "warrior", name: "Warrior", color: "#C79C6E"},
    2: {key: "paladin", name: "Paladin", color: "#F58CBA"},
    3: {key: "hunter", name: "Hunter", color: "#ABD473"},
    4: {key: "rogue", name: "Rogue", color: "#FFF569"},
    5: {key: "priest", name: "Priest", color: "#FFFFFF"},
    7: {key: "shaman", name: "Shaman", color: "#0070DE"},
    8: {key: "mage", name: "Mage", color: "#69CCF0"},
    9: {key: "warlock", name: "Warlock", color: "#9482C9"},
    11: {key: "druid", name: "Druid", color: "#FF7D0A"}
};

function getClassMeta(classId) {
    const id = Number(classId);
    const info = CLASS_INFO[id];
    if (!info) {
        return {
            classId: null,
            classKey: null,
            className: "Unknown",
            classColor: "#C0C0C0",
            classIcon: null
        };
    }
    return {
        classId: id,
        classKey: info.key,
        className: info.name,
        classColor: info.color,
        classIcon: `/icons/${info.key}.png`
    };
}

function isAutoExcludedName(name) {
    const key = String(name || "").trim().toLowerCase();
    return AUTO_EXCLUSIONS.some(x => x.toLowerCase() === key);
}

function ensureStore() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true});
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify({logs: [], exclusions: []}, null, 2), "utf8");
    }
}

function readStore() {
    ensureStore();
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const exclusionsRaw = Array.isArray(parsed.exclusions) ? parsed.exclusions : [];
    const exclusions = exclusionsRaw.filter(x => !isAutoExcludedName(x));
    // Auto-clean legacy data where auto exclusions were stored manually.
    if (exclusions.length !== exclusionsRaw.length) {
        parsed.exclusions = exclusions;
        fs.writeFileSync(STORE_PATH, JSON.stringify({
            logs: Array.isArray(parsed.logs) ? parsed.logs : [],
            exclusions
        }, null, 2), "utf8");
    }
    return {
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        exclusions
    };
}

function writeStore(store) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function isValidTurtlogsViewerUrl(raw) {
    try {
        const u = new URL(String(raw || ""));
        const hostOk = u.hostname === "turtlogs.com" || u.hostname === "www.turtlogs.com";
        const pathOk = /^\/viewer\/\d+\/base/i.test(u.pathname);
        return hostOk && pathOk;
    } catch {
        return false;
    }
}

function normalizeViewerUrl(raw) {
    const u = new URL(String(raw || ""));
    // Keep the key stable by ignoring query/hash for duplicate detection.
    return `${u.origin}${u.pathname}`.toLowerCase();
}

function splitBulkUrls(input) {
    if (Array.isArray(input)) return input.map(String);
    if (typeof input === "string") {
        return input
            .split(/\r?\n|,|;|\s+/)
            .map(s => s.trim())
            .filter(Boolean);
    }
    return [];
}

function parsePlayerName(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    // "Yaztal (Nyxin)" -> "Yaztal"
    return s.replace(/\s+\([^)]*\)\s*$/, "").trim();
}

function aggregateDeaths(logs, exclusions) {
    const autoExcluded = new Set(
        AUTO_EXCLUSIONS.map(x => String(x || "").trim().toLowerCase()).filter(Boolean)
    );
    const excluded = new Set(
        (exclusions || [])
            .map(x => String(x || "").trim().toLowerCase())
            .filter(Boolean)
    );
    for (const name of autoExcluded) excluded.add(name);

    const map = new Map();
    for (const log of logs || []) {
        for (const row of log.rows || []) {
            const name = String(row.name || "").trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (excluded.has(key)) continue;

            const deaths = Number(row.deaths) || 0;
            const slot = map.get(key) || {name, deaths: 0, logs: 0, classStats: {}};
            slot.deaths += deaths;
            slot.logs += 1;

            const classId = Number(row.classId);
            if (Number.isFinite(classId)) {
                const classKey = String(classId);
                if (!slot.classStats[classKey]) slot.classStats[classKey] = {logs: 0, deaths: 0};
                slot.classStats[classKey].logs += 1;
                slot.classStats[classKey].deaths += deaths;
            }
            map.set(key, slot);
        }
    }

    const ranked = Array.from(map.values())
        .sort((a, b) => (b.deaths - a.deaths) || a.name.localeCompare(b.name))
        .map((r, i) => {
            const classEntries = Object.entries(r.classStats || {});
            let primaryClassId = null;
            if (classEntries.length) {
                classEntries.sort((a, b) => {
                    const al = Number(a[1] && a[1].logs) || 0;
                    const bl = Number(b[1] && b[1].logs) || 0;
                    if (bl !== al) return bl - al;
                    const ad = Number(a[1] && a[1].deaths) || 0;
                    const bd = Number(b[1] && b[1].deaths) || 0;
                    return bd - ad;
                });
                primaryClassId = Number(classEntries[0][0]);
            }
            return {
                rank: i + 1,
                name: r.name,
                deaths: r.deaths,
                logs: r.logs,
                ...getClassMeta(primaryClassId)
            };
        });

    return ranked;
}

async function scrapeDeaths(url) {
    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage();

    try {
        await page.goto(url, {waitUntil: "domcontentloaded", timeout: 60000});

        await page.waitForSelector("raidmeter#left_meter", {timeout: 30000});
        await page.waitForSelector("raidmeter#left_meter .bar_container > .bar", {timeout: 30000});

        // Ensure the left meter is switched to "Deaths" (value=11).
        await page.evaluate(() => {
            const select = document.querySelector("raidmeter#left_meter .title_bar select");
            if (!select) return;
            if (select.value !== "11") {
                select.value = "11";
                select.dispatchEvent(new Event("change", {bubbles: true}));
                select.dispatchEvent(new Event("input", {bubbles: true}));
            }
        });

        // Wait for the deaths meter to render/update.
        await page.waitForTimeout(700);
        await page.waitForSelector("raidmeter#left_meter .bar_container > .bar", {timeout: 30000});

        const result = await page.evaluate(() => {
            function parseLocaleNumber(raw) {
                if (raw == null) return NaN;
                let s = String(raw);
                s = s.replace(/[\s\u00A0\u202F\u2007\u2009\u200A\u2060]+/g, "");
                s = s.replace(/[^0-9+,\.\-]/g, "");
                const hasDot = s.includes(".");
                const hasComma = s.includes(",");
                if (hasDot && hasComma) s = s.replace(/,/g, "");
                else if (!hasDot && hasComma) s = s.replace(/,/g, ".");
                const n = Number.parseFloat(s);
                return Number.isFinite(n) ? n : NaN;
            }

            const select = document.querySelector("raidmeter#left_meter .title_bar select");
            const selectedOption = select ? select.options[select.selectedIndex] : null;
            const metric = {
                id: selectedOption ? Number(selectedOption.value) : null,
                name: selectedOption ? selectedOption.textContent.trim() : null
            };

            const bars = Array.from(document.querySelectorAll("raidmeter#left_meter .bar_container > .bar"));

            const rows = bars.map((bar) => {
                const left = bar.querySelector(".bar_label_left");
                const right = bar.querySelector(".bar_label_right");
                const leftSpans = left ? Array.from(left.querySelectorAll("span")) : [];

                const rankText = leftSpans[0] ? leftSpans[0].textContent.trim() : "";
                const nameText = leftSpans[1] ? leftSpans[1].textContent.trim() : "";
                const deathsText = right ? right.textContent.trim() : "";
                const bgClassEl = bar.querySelector(".bar_bg_color");
                const bgClassName = bgClassEl ? String(bgClassEl.className || "") : "";
                let classId = null;
                let m = bgClassName.match(/hero_class_bg_(\d+)/i);
                if (m) classId = Number(m[1]);

                if (!Number.isFinite(classId)) {
                    const specIcon = bar.querySelector(".spec-icon");
                    const bg = specIcon
                        ? (specIcon.style.backgroundImage || getComputedStyle(specIcon).backgroundImage || "")
                        : "";
                    m = bg.match(/c(\d+)-\d+\.png/i);
                    if (m) classId = Number(m[1]);
                }

                const rank = Number.parseInt(rankText.replace(/\D+/g, ""), 10);
                const deaths = parseLocaleNumber(deathsText);
                if (!nameText || !Number.isFinite(deaths)) return null;

                return {
                    rank: Number.isFinite(rank) ? rank : null,
                    name: nameText,
                    deaths,
                    classId: Number.isFinite(classId) ? classId : null
                };
            }).filter(Boolean);

            // Rank by deaths desc, then name asc.
            rows.sort((a, b) => (b.deaths - a.deaths) || a.name.localeCompare(b.name));
            rows.forEach((r, i) => {
                r.rank = i + 1;
            });

            return {
                metric,
                total: rows.length,
                rows
            };
        });

        if (!result || !Array.isArray(result.rows)) {
            throw new Error("Could not extract death rows from the viewer page.");
        }

        return result;
    } finally {
        await page.close().catch(() => {
        });
        await browser.close().catch(() => {
        });
    }
}

app.post("/api/deaths", async (req, res) => {
    const url = req.body && req.body.url;
    if (!isValidTurtlogsViewerUrl(url)) {
        return res.status(400).json({
            ok: false,
            error: "Please provide a valid TurtleLogs viewer URL: https://turtlogs.com/viewer/<id>/base"
        });
    }

    try {
        const data = await scrapeDeaths(url);
        return res.json({ok: true, data});
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: String((err && err.message) || err || "Unknown scrape error")
        });
    }
});

app.get("/api/state", (req, res) => {
    const store = readStore();
    const ranking = aggregateDeaths(store.logs, store.exclusions);
    res.json({
        ok: true,
        data: {
            logs: store.logs,
            exclusions: store.exclusions,
            autoExclusions: AUTO_EXCLUSIONS,
            ranking
        }
    });
});

app.post("/api/logs", async (req, res) => {
    const url = req.body && req.body.url;
    if (!isValidTurtlogsViewerUrl(url)) {
        return res.status(400).json({
            ok: false,
            error: "Please provide a valid TurtleLogs viewer URL: https://turtlogs.com/viewer/<id>/base"
        });
    }

    const normalizedUrl = normalizeViewerUrl(url);
    const store = readStore();
    const existing = store.logs.find(l => l.normalizedUrl === normalizedUrl);
    if (existing) {
        return res.status(409).json({
            ok: false,
            error: "This log is already uploaded.",
            data: existing
        });
    }

    try {
        const scraped = await scrapeDeaths(url);
        const log = {
            id: crypto.randomUUID(),
            url: String(url),
            normalizedUrl,
            uploadedAt: new Date().toISOString(),
            metric: scraped.metric || null,
            total: Number(scraped.total) || 0,
            rows: (scraped.rows || []).map(r => ({
                name: parsePlayerName(r.name),
                deaths: Number(r.deaths) || 0,
                classId: Number.isFinite(Number(r.classId)) ? Number(r.classId) : null
            }))
        };
        store.logs.push(log);
        writeStore(store);

        const ranking = aggregateDeaths(store.logs, store.exclusions);
        return res.json({ok: true, data: {log, ranking}});
    } catch (err) {
        return res.status(500).json({
            ok: false,
            error: String((err && err.message) || err || "Unknown scrape error")
        });
    }
});

app.post("/api/logs/bulk", async (req, res) => {
    const urls = splitBulkUrls(req.body && req.body.urls);
    if (!urls.length) {
        return res.status(400).json({ok: false, error: "Provide one or more viewer URLs."});
    }

    const store = readStore();
    const existingSet = new Set(store.logs.map(l => l.normalizedUrl));

    const results = [];
    for (const rawUrl of urls) {
        if (!isValidTurtlogsViewerUrl(rawUrl)) {
            results.push({url: rawUrl, ok: false, error: "Invalid viewer URL"});
            continue;
        }

        const normalizedUrl = normalizeViewerUrl(rawUrl);
        if (existingSet.has(normalizedUrl)) {
            results.push({url: rawUrl, ok: false, error: "Already uploaded"});
            continue;
        }

        try {
            const scraped = await scrapeDeaths(rawUrl);
            const log = {
                id: crypto.randomUUID(),
                url: String(rawUrl),
                normalizedUrl,
                uploadedAt: new Date().toISOString(),
                metric: scraped.metric || null,
                total: Number(scraped.total) || 0,
                rows: (scraped.rows || []).map(r => ({
                    name: parsePlayerName(r.name),
                    deaths: Number(r.deaths) || 0,
                    classId: Number.isFinite(Number(r.classId)) ? Number(r.classId) : null
                }))
            };
            store.logs.push(log);
            existingSet.add(normalizedUrl);
            results.push({url: rawUrl, ok: true, logId: log.id, players: log.total});
        } catch (err) {
            results.push({
                url: rawUrl,
                ok: false,
                error: String((err && err.message) || err || "Scrape failed")
            });
        }
    }

    writeStore(store);
    const ranking = aggregateDeaths(store.logs, store.exclusions);
    return res.json({ok: true, data: {results, ranking, logs: store.logs}});
});

app.delete("/api/logs/:id", (req, res) => {
    const id = String(req.params.id || "");
    const store = readStore();
    const before = store.logs.length;
    store.logs = store.logs.filter(l => l.id !== id);
    if (store.logs.length === before) {
        return res.status(404).json({ok: false, error: "Log not found."});
    }
    writeStore(store);
    const ranking = aggregateDeaths(store.logs, store.exclusions);
    return res.json({ok: true, data: {logs: store.logs, ranking}});
});

app.post("/api/exclusions", (req, res) => {
    const name = parsePlayerName(req.body && req.body.name);
    if (!name) return res.status(400).json({ok: false, error: "Provide a player name."});
    if (isAutoExcludedName(name)) {
        const store = readStore();
        const ranking = aggregateDeaths(store.logs, store.exclusions);
        return res.json({
            ok: true,
            data: {exclusions: store.exclusions, autoExclusions: AUTO_EXCLUSIONS, ranking}
        });
    }

    const store = readStore();
    const key = name.toLowerCase();
    const exists = store.exclusions.some(x => String(x).toLowerCase() === key);
    if (!exists) store.exclusions.push(name);
    writeStore(store);

    const ranking = aggregateDeaths(store.logs, store.exclusions);
    return res.json({ok: true, data: {exclusions: store.exclusions, autoExclusions: AUTO_EXCLUSIONS, ranking}});
});

app.delete("/api/exclusions/:name", (req, res) => {
    const target = decodeURIComponent(req.params.name || "").trim().toLowerCase();
    const store = readStore();
    store.exclusions = store.exclusions.filter(x => String(x).trim().toLowerCase() !== target);
    writeStore(store);

    const ranking = aggregateDeaths(store.logs, store.exclusions);
    return res.json({ok: true, data: {exclusions: store.exclusions, ranking}});
});

app.delete("/api/db", (req, res) => {
    const cleared = {logs: [], exclusions: []};
    writeStore(cleared);
    return res.json({
        ok: true,
        data: {
            logs: [],
            exclusions: [],
            ranking: []
        }
    });
});

app.listen(PORT, HOST, () => {
    console.log(`TurtleLogs deaths webapp listening on http://${HOST}:${PORT}`);
});
