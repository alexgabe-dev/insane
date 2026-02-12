# TurtleLogs Scraping

Vibe project - A small browser-side script that pulls DPS rankings
from  [Turtle WoW Logs](https://www.turtlogs.com/pve/ranking), aggregates the data, and displays analytics and tier
lists in a Chrome extension popup.

## Features

- Extracts class + spec DPS data from the ranking page
- Shows **average** and **median** DPS
- Filter by percentile (e.g. top 10% only)
- (Extension) Tier list popup with Popularity / Avg / Median / Combined metrics
- Auto-detects active raid meter metric (including **Deaths**) and applies correct ranking direction

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
        - **Value (Avg)** = ranks by average value (auto-detects whether higher or lower is better).
        - **Value (Med)** = ranks by median value (auto-detects whether higher or lower is better).
        - **Combined** = weighted blend of Popularity + Median (adjust weights).
    - If **Combined** is selected, set **Pop** and **Med** weights.
4. Click **Build**.
    - The popup shows a **collapsible tier list**.
    - Each tier header shows how many specs landed in that tier.
    - Pills display the spec and a context label (e.g., `% share`, `avg`, or `median` depending on metric).
    - For **Deaths**, lower avg/median is treated as better automatically.

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

## Deaths Webapp (single + bulk + history + exclusions)

This repo now also includes a webapp at `webapp/` that:

- Accepts single or bulk TurtleLogs viewer URLs
- Scrapes each log with the raid meter set to **Deaths**
- Aggregates deaths across uploaded logs (same player names are summed)
- Supports an exclusions list (remove players from ranking)
- Stores uploaded log history so you can see what was already uploaded

### Run

1. `cd webapp`
2. `npm install`
3. `npx playwright install chromium`
4. `npm start`
5. Open `http://localhost:8787`

### Use

1. Add a single log URL (or paste multiple URLs in bulk upload).
2. Scraped logs are saved in local history (`webapp/data/store.json`).
3. The ranking table shows combined deaths by player across all uploaded logs.
4. Add player names to exclusions to remove them from charts/ranking.

## Ubuntu + Nginx deployment (insane.hu)

### 1) Install runtime + deps

```bash
sudo apt update
sudo apt install -y curl ca-certificates git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

In project:

```bash
cd /var/www/turtlelogs-scraping/webapp
npm install
sudo mkdir -p /var/www/turtlelogs-scraping/webapp/.playwright
sudo chown -R www-data:www-data /var/www/turtlelogs-scraping/webapp
sudo -u www-data PLAYWRIGHT_BROWSERS_PATH=/var/www/turtlelogs-scraping/webapp/.playwright npx playwright install --with-deps chromium
```

### 2) Run app as a systemd service

Create `/etc/systemd/system/insane-turtlelogs.service`:

```ini
[Unit]
Description=INSANE TurtleLogs Webapp
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/turtlelogs-scraping/webapp
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=PLAYWRIGHT_BROWSERS_PATH=/var/www/turtlelogs-scraping/webapp/.playwright
ExecStart=/usr/bin/node /var/www/turtlelogs-scraping/webapp/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable/start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now insane-turtlelogs
sudo systemctl status insane-turtlelogs
```

### 3) Nginx reverse proxy

Create `/etc/nginx/sites-available/insane.hu`:

```nginx
server {
    listen 80;
    server_name insane.hu www.insane.hu;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site + reload:

```bash
sudo ln -s /etc/nginx/sites-available/insane.hu /etc/nginx/sites-enabled/insane.hu
sudo nginx -t
sudo systemctl reload nginx
```

### 4) HTTPS (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d insane.hu -d www.insane.hu
```
