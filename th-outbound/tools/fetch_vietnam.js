#!/usr/bin/env node
// Vietnam National Authority of Tourism (VNAT): international visitors by market, Thailand row.
//
// The statistics page is a JavaScript app: a plain HTTP request gets an empty shell, so this opens
// it in headless Chromium, picks the year and month in the page's own dropdowns and reads the
// "Thái Lan" row of the table it renders (month estimate and year-to-date).
//
// Usage: node fetch_vietnam.js [YYYY M]        (no arguments = the latest month the page offers)
// Prints one JSON line:
//   {"source":"vietnam","month":"YYYY-MM","thailand":N,"thailand_ytd":N,"heading":"...","row":"..."}
// Exits 2 if the month is not published yet (missing from the page's dropdowns).
const { launch } = require('./browser');

const URL = 'https://vietnamtourism.gov.vn/statistic/international';
const num = s => { const t = s.replace(/\./g, '').trim(); if (!/^\d+$/.test(t)) throw new Error(`not a whole number: "${s}"`); return +t; };

(async () => {
  const [yearArg, monthArg] = process.argv.slice(2);
  if ((yearArg && !monthArg) || (yearArg && !/^\d{4}$/.test(yearArg)) || (monthArg && !(+monthArg >= 1 && +monthArg <= 12))) {
    console.error('usage: node fetch_vietnam.js [YYYY M]'); process.exit(64);
  }
  const { browser, ctx } = await launch('vi-VN');
  let out;
  try {
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForSelector('#statistic-month option', { state: 'attached', timeout: 60000 });
    const options = sel => page.$$eval(`${sel} option`, os => os.map(o => o.value));

    let year = yearArg, month = monthArg && String(+monthArg);
    if (year) {
      if (!(await options('#statistic-year')).includes(year)) { console.error(`year ${year} not offered yet`); process.exit(2); }
      if (await page.$eval('#statistic-year', s => s.value) !== year) {
        await page.selectOption('#statistic-year', year);
        await page.waitForLoadState('networkidle');
      }
      const months = await options('#statistic-month');
      if (!months.includes(`t${month}`)) { console.error(`${year}-${month} not published yet (months offered: ${months.join(',')})`); process.exit(2); }
      await page.selectOption('#statistic-month', `t${month}`);
    } else {
      year = await page.$eval('#statistic-year', s => s.value);
      month = (await page.$eval('#statistic-month', s => s.value)).replace(/^t/, '');
    }
    // The table is replaced asynchronously; wait until its heading names the month asked for.
    // Only the table's own title line counts ("Khách quốc tế đến Việt Nam tháng 10 và 10 tháng năm 2026"):
    // it must start with that phrase, name the month, and end with the year.
    const want = new RegExp(`^\\s*Khách quốc tế đến Việt Nam tháng ${month}(?!\\d)[^\\n]*${year}\\s*$`, 'im');
    await page.waitForFunction(src => new RegExp(src, 'im').test(document.body.innerText), want.source, { timeout: 60000 });
    out = await page.evaluate(src => {
      const heading = (document.body.innerText.split('\n').find(l => new RegExp(src, 'i').test(l)) || '').trim();
      const trs = [...document.querySelectorAll('tr')];
      const cellsOf = t => t ? [...t.querySelectorAll('td,th')].map(c => c.innerText.replace(/\s+/g, ' ').trim()) : null;
      return { heading, header: cellsOf(trs.find(t => /^\s*Chỉ tiêu/.test(t.innerText))), cells: cellsOf(trs.find(t => /^\s*Thái Lan/.test(t.innerText))) };
    }, want.source);
    out.year = year; out.mon = month;
  } finally {
    await browser.close();
  }
  if (!out.cells || !out.header) throw new Error('header or Thái Lan row not found in the table');
  // Columns are found by their header, because January's table is laid out differently
  // (previous December | January) from the other months (month | year-to-date).
  const { year: y, mon: m } = out;
  const iMonth = out.header.findIndex(h => new RegExp(`tháng ${m}/${y} \\(Lượt khách\\)`, 'i').test(h));
  const iYtd = out.header.findIndex(h => new RegExp(`^${m} tháng năm ${y} \\(Lượt khách\\)`, 'i').test(h));
  if (iMonth < 0) throw new Error(`no column for ${m}/${y} in header: ${out.header.join(' | ')}`);
  if (iYtd < 0 && +m !== 1) throw new Error(`no year-to-date column in header: ${out.header.join(' | ')}`);
  const thailand = num(out.cells[iMonth]);
  console.log(JSON.stringify({
    source: 'vietnam', month: `${y}-${String(m).padStart(2, '0')}`, thailand, thailand_ytd: iYtd < 0 ? thailand : num(out.cells[iYtd]),
    heading: out.heading, row: out.cells.join(' | '),
  }));
})().catch(e => { console.error(e.message); process.exit(1); });
