#!/usr/bin/env node
// Taiwan Tourism Administration: visitor arrivals by residence, Thailand row, one month.
//
// The site's WAF rejects curl and direct API calls ("Request Rejected"), so this drives the
// statistics page in headless Chromium and uses its own "Excel產出(Export)" button.
//
// Usage: node fetch_taiwan.js YYYY M [OUT.xlsx]
// Prints one JSON line: {"source":"taiwan","month":"YYYY-MM","thailand":N,"same_month_prev_year":N,"file":...}
// Exits 2 if the month is not published yet (the year/month is missing from the page's dropdowns).
const path = require('path');
const { execFileSync } = require('child_process');
const { launch } = require('./browser');

const URL = 'https://stat.taiwan.net.tw/statistics/month/inbound/residence';

(async () => {
  const [year, month, outArg] = process.argv.slice(2);
  if (!year || !month) { console.error('usage: node fetch_taiwan.js YYYY M [OUT.xlsx]'); process.exit(64); }
  const roc = String(+year - 1911);            // ROC year: 2026 -> 115
  const yearLabel = `${roc}(${year})`;
  const monthLabel = `${+month}月`;
  const out = path.resolve(outArg || `taiwan_${year}-${String(month).padStart(2, '0')}.xlsx`);

  const { browser, ctx } = await launch('zh-TW');
  try {
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
    const accept = page.getByText('接受', { exact: true });
    if (await accept.count()) await accept.first().click().catch(() => {});

    const selects = page.locator('select');
    const years = await selects.nth(0).locator('option').allTextContents();
    if (!years.map(s => s.trim()).includes(yearLabel)) { console.error(`year ${yearLabel} not offered yet`); process.exit(2); }
    await selects.nth(0).selectOption({ label: yearLabel });
    const months = (await selects.nth(1).locator('option').allTextContents()).map(s => s.trim());
    if (!months.includes(monthLabel)) { console.error(`${year}-${month} not published yet (latest offered: ${months[months.length - 1]})`); process.exit(2); }
    await selects.nth(1).selectOption({ label: monthLabel });
    await selects.nth(2).selectOption({ label: monthLabel });

    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      page.getByText('Excel產出(Export)').click(),
    ]);
    await dl.saveAs(out);
  } finally {
    await browser.close();
  }

  // Read the Thailand row with openpyxl (columns: name, total, overseas Chinese, foreigners,
  // same month last year total, ..., YoY %).
  const py = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
for ws in wb.worksheets:
    for row in ws.iter_rows(values_only=True):
        cells = [c for c in row if c is not None]
        if cells and isinstance(cells[0], str) and ('Thailand' in cells[0] or '泰國' in cells[0]):
            print(json.dumps({"thailand": int(cells[1]), "same_month_prev_year": int(cells[4]), "row": [str(c) for c in cells[:8]]}))
            sys.exit(0)
sys.exit("Thailand row not found in export")
`;
  const row = JSON.parse(execFileSync('python3', ['-I', '-c', py, out], { encoding: 'utf8' }));
  console.log(JSON.stringify({ source: 'taiwan', month: `${year}-${String(month).padStart(2, '0')}`, ...row, file: out }));
})().catch(e => { console.error(e.message); process.exit(1); });
