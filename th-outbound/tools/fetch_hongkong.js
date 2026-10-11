#!/usr/bin/env node
// Hong Kong Tourism Board PartnerNet: latest monthly "Visitor Arrivals To Hong Kong" PDF,
// Thailand row.
//
// Cloudflare answers curl with a "Just a moment..." challenge, and it also refuses downloads
// made outside the browser, so the PDF is fetched from inside the page after the challenge clears.
//
// Usage: node fetch_hongkong.js [OUTDIR]
// Prints one JSON line: {"source":"hong_kong","title":...,"month":"YYYY-MM","thailand_month":N,
//   "thailand_same_month_prev_year":N,"thailand_ytd":N,"thailand_ytd_prev_year":N,"line":...,"file":...}
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch } = require('./browser');

const URL = 'https://partnernet.hktb.com/en/research_statistics/latest_statistics/index.html';
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

(async () => {
  const outdir = path.resolve(process.argv[2] || '.');
  const { browser, ctx } = await launch('en-US');
  let title, pdfUrl, bytes;
  try {
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
    for (let i = 0; i < 6 && /just a moment/i.test(await page.title()); i++) await page.waitForTimeout(5000);
    const link = await page.$$eval('a[href$=".pdf"]', as => {
      const a = as.find(x => /Visitor Arrivals To Hong Kong/i.test(x.innerText));
      return a ? [a.innerText.trim().replace(/\s+/g, ' '), a.href] : null;
    });
    if (!link) throw new Error('no "Visitor Arrivals To Hong Kong" PDF link on the page');
    [title, pdfUrl] = link;
    const [status, b64] = await page.evaluate(async u => {
      const r = await fetch(u);
      const a = new Uint8Array(await r.arrayBuffer());
      let s = '';
      for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
      return [r.status, btoa(s)];
    }, pdfUrl);
    bytes = Buffer.from(b64, 'base64');
    if (status !== 200 || bytes.slice(0, 5).toString() !== '%PDF-') throw new Error(`PDF download failed (HTTP ${status})`);
  } finally {
    await browser.close();
  }

  const file = path.join(outdir, decodeURIComponent(pdfUrl.split('/').pop()));
  fs.writeFileSync(file, bytes);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  // The first Thailand line is the all-visitors table: month, same month last year, %, YTD, YTD last year, %.
  const line = text.split('\n').find(l => /\bThailand\b/.test(l));
  if (!line) throw new Error('Thailand row not found in the PDF');
  const nums = (line.match(/[\d,]+(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, ''))).filter(n => Number.isFinite(n));
  const m = title.match(/In\s+([A-Za-z]+)\s+(\d{4})/i);
  const month = m ? `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}` : null;
  console.log(JSON.stringify({
    source: 'hong_kong', title, month,
    thailand_same_month_prev_year: nums[0], thailand_month: nums[1],
    thailand_ytd_prev_year: nums[3], thailand_ytd: nums[4],
    line: line.replace(/\s+/g, ' ').trim(), file,
  }));
})().catch(e => { console.error(e.message); process.exit(1); });
