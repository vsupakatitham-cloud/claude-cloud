#!/usr/bin/env node
// Korea Tourism Organization (KTO) Korea Tourism Data Lab: visitor arrivals from Thailand, by month.
//
// The Data Lab bulletin boards (/site/portal/ex/bbs/List.do?cbIdx=1127 and 1132) redirect to the
// home page for anything but a logged-in browser session, and plain HTTP requests are redirected
// too. The official statistics page "방한 외래관광객" (visitor arrivals) does open in a browser and
// loads the same published series by nationality, so this opens that page in headless Chromium and
// asks its own grid endpoint for the months wanted, then keeps the 태국 (Thailand) 전체 (total) rows.
// The series equals the monthly 한국관광통계 workbook: it reproduces every 2025-2026 month in the tracker.
//
// Usage: node fetch_korea.js [FROM_YYYY-MM] [TO_YYYY-MM]     (default: 2025-01 .. this month)
// Prints one JSON line:
//   {"source":"korea","latest":"YYYY-MM","months":{"YYYY-MM":N,...},"same_month_prev_year":{"YYYY-MM":N,...}}
// Months the site has not published yet are simply absent. Exits 2 if no month in the range is published.
const { launch } = require('./browser');

const PAGE = 'https://datalab.visitkorea.or.kr/datalab/portal/ts/getEntcnyFrgnCust2Form.do';
const ym = s => s.replace('-', '');

(async () => {
  const now = new Date();
  const from = process.argv[2] || '2025-01';
  const to = process.argv[3] || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) { console.error('usage: node fetch_korea.js [FROM_YYYY-MM] [TO_YYYY-MM]'); process.exit(64); }

  const { browser, ctx } = await launch('ko-KR');
  let rows;
  try {
    const page = await ctx.newPage();
    await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!page.url().includes('getEntcnyFrgnCust2Form')) throw new Error(`statistics page redirected to ${page.url()}`);
    await page.waitForTimeout(3000);
    rows = await page.evaluate(async ([a, b]) => {
      const body = new URLSearchParams({
        BASE_YM1: a, BASE_YM2: b,
        srchBgngYear: a.slice(0, 4), srchEndYear: b.slice(0, 4), srchBgngMm: a.slice(4), srchEndMm: b.slice(4),
        srchAreaDate: '1', qid: 'TS_01_16_005_New', adminYn: '',
      });
      const r = await fetch('/visualize/getGridData.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body,
      });
      if (!r.ok) throw new Error(`grid endpoint answered ${r.status}`);
      const j = await r.json();
      return (j.list || []).filter(x => x.NAT_NM === '태국' && x.SEX_CD === '전체');
    }, [ym(from), ym(to)]);
  } finally {
    await browser.close();
  }

  const months = {}, prev = {};
  for (const r of rows) {
    const m = `${r.BASE_DATE.slice(0, 4)}-${r.BASE_DATE.slice(4, 6)}`;
    if (!Number.isInteger(r.QTY)) throw new Error(`unexpected value for ${m}: ${r.QTY}`);
    months[m] = r.QTY;
    if (Number.isInteger(r.PRE_QTY)) prev[m] = r.PRE_QTY;
  }
  const keys = Object.keys(months).sort();
  if (!keys.length) { console.error(`no Thailand month published in ${from}..${to}`); process.exit(2); }
  console.log(JSON.stringify({ source: 'korea', latest: keys[keys.length - 1], months, same_month_prev_year: prev }));
})().catch(e => { console.error(e.message); process.exit(1); });
