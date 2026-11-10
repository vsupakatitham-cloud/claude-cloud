# Thai Outbound Tracker — cloud refresh

Monthly refresh of the [Thai Outbound Tracker](https://claude.ai/artifact/W6mqufyHZuE7BVRVzso8L1):
Thai visitor arrivals by destination, read from each destination's official tourism statistics.
A scheduled Claude cloud Routine runs on the 5th of each month (≈09:00 Bangkok), re-reads every
source, updates the figures built into the page, and republishes it with CSV and Markdown copies
attached (`thai_outbound.csv`, `thai_outbound.md`). It replaced a scheduled task on the owner's Mac.

The live artifact is the source of truth. `page.html` here is a snapshot of the page as of
5 Oct 2026, kept for reference; each run starts from the live page.

## Tools

| File | What it does |
|---|---|
| `tools/setup.sh` | One-time setup in a fresh cloud session: Playwright (using the preinstalled Chromium), `pdftotext`, `openpyxl`, and Chromium trust for the session's HTTPS proxy. |
| `tools/tracker.py` | Reads and edits the page's built-in data (`const RAW` / `const META`) without touching the rest of the page; exports CSV and Markdown. Run with `-h` for subcommands. |
| `tools/fetch_taiwan.js` | Taiwan Tourism Administration, arrivals by residence. The site's firewall rejects scripts, so this drives the page's own Excel export in headless Chromium. Exit 2 = month not published yet. |
| `tools/fetch_hongkong.js` | HKTB PartnerNet monthly PDF. Cloudflare blocks plain downloads, so the PDF is fetched from inside the browser, then read with `pdftotext`. |
| `tools/fetch_korea.js` | KTO Korea Tourism Data Lab. The bulletin boards (cbIdx=1127 / 1132) redirect to the home page without a login, so this opens the official "방한 외래관광객" statistics page in headless Chromium and reads the Thailand total for every month in a range (same series as the monthly workbook). Exit 2 = nothing published in the range. |
| `tools/fetch_vietnam.js` | VNAT statistics page, which is a JavaScript app (a plain request gets an empty shell). Picks the year and month in the page's dropdowns and reads the Thailand row: month and year-to-date. No arguments = latest month. Exit 2 = month not published yet. |

All other sources (JNTO, SingStat, ABS, NTTO, UK Home Office/ONS, Tourism Malaysia,
data.gov.my) answer ordinary HTTP requests from the cloud.

## Manual run

```bash
bash tools/setup.sh
python3 tools/tracker.py show
node tools/fetch_taiwan.js 2026 8
node tools/fetch_hongkong.js .
node tools/fetch_korea.js 2026-01          # every month from Jan 2026 to the latest
node tools/fetch_vietnam.js               # latest month; or: node tools/fetch_vietnam.js 2026 10
```
