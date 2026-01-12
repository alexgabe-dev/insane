# TurtleLogs Scraping

Vibe project - A small browser-side script that pulls DPS rankings
from  [Turtle WoW Logs](https://www.turtlogs.com/pve/ranking), aggregates the data, and displays analytics and tier
lists in a Chrome extension popup.

## Features

- Extracts class + spec DPS data from the ranking page
- Shows **average** and **median** DPS
- Filter by percentile (e.g. top 10% only)
- (Extension) Tier list popup with Popularity / Avg / Median / Combined metrics

# Chrome extension (plugin)

Analyze rankings without touching the console. The popup builds a **tier list (S → D)** right from the rankings page and
supports filtering by percentile and multiple metrics.

## Install (Chrome/Edge/Brave)

1. **Download / clone** this repo.
2. Open `chrome://extensions` → toggle **Developer mode** (top-right).
3. Click **Load unpacked** → select the `turtlogs-analyzer-extension` folder (the one containing `manifest.json`).
4. You should see **TurtLogs Analyzer** appear in the list.

## Use

1. Open **[turtlogs.com PvE ranking](https://www.turtlogs.com/pve/ranking)** and wait until the page finishes loading.
2. Click the **TurtLogs Analyzer** toolbar icon to open the popup.
3. In the popup:
    - **Percentile (%)** — filter to the top X% of logs (e.g., `25` = top 75%).
    - **Metric** — choose how to rank specs:
        - **Popularity** = share of logs for each spec in the filtered sample.
          > Computed as `count / Σ count` for the current percentile filter.
        - **Throughput (Avg)** = ranks by average DPS.
        - **Throughput (Med)** = ranks by median DPS.
        - **Combined** = weighted blend of Popularity + Median (adjust weights).
    - If **Combined** is selected, set **Pop** and **Med** weights.
4. Click **Build**.
    - The popup shows a **collapsible tier list**.
    - Each tier header shows how many specs landed in that tier.
    - Pills display the spec and a context label (e.g., `% share`, `avg`, or `median` depending on metric).

## Files the extension loads

- `manifest.json` — extension config & permissions
- `turtlogs_scraping.js` — scrapes & aggregates the visible ranking rows
- `bridge.js` — connects the popup to the content script on the page
- `popup.html` / `popup.js` — the popup UI (tier list, controls)

## Permissions

- **Host**: `https://turtlogs.com/*` and `https://www.turtlogs.com/*`
- **Active Tab/Scripting**: to run the scraper on the currently open rankings page

## Troubleshooting

- **“No response (is the site loaded and content script injected?)”**
    - Make sure you’re on a **turtlogs.com PvE ranking** page.
    - Refresh the page after installing/updating the extension.
    - Wait for the ranking bars to render, then click **Build** again.
- **“The message port closed before a response was received.”**
    - Usually a timing issue. Refresh the page and re-open the popup.
- **Numbers don’t match expectations**
    - Check the **Percentile** and **Metric** selected.
    - Remember: **Popularity** uses pure **count share** in the **filtered** sample.
- **Popup too tall / scrollbars**
    - The popup CSS is trimmed for a 600×600 window. Collapse tiers you don’t need.

## Uninstall / Update

- To update: pull latest files and click **⟳ Reload** on the extension in `chrome://extensions`.
- To uninstall: click **Remove** in `chrome://extensions`.

## License

MIT
