// Shared headless-Chromium launcher. Uses the machine's preinstalled Chromium when present
// (Claude cloud sessions ship one at /opt/pw-browsers/chromium) instead of downloading one.
const fs = require('fs');
const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const PREINSTALLED = '/opt/pw-browsers/chromium';

async function launch(locale = 'en-US') {
  const opts = { headless: true, args: ['--disable-blink-features=AutomationControlled'] };
  if (fs.existsSync(PREINSTALLED)) opts.executablePath = PREINSTALLED;
  const browser = await chromium.launch(opts);
  const ctx = await browser.newContext({ userAgent: UA, locale, acceptDownloads: true, viewport: { width: 1366, height: 900 } });
  return { browser, ctx };
}

module.exports = { launch };
