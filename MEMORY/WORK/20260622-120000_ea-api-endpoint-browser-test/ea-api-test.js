const { chromium } = require('playwright');

const URLS = [
  'https://proclubs.ea.com/api/fc/members/stats?platform=common-gen5&clubId=21853',
  'https://proclubs.ea.com/api/fc/members/career/stats?platform=common-gen5&clubId=21853',
  'https://proclubs.ea.com/api/fc/clubs/info?platform=common-gen5&clubIds=21853',
  'https://proclubs.ea.com/api/fc/clubs/matches?platform=common-gen5&clubIds=21853&matchType=leagueMatch&maxResultCount=5',
];

function classifyBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return { type: 'EMPTY', detail: 'empty body' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const keys = Array.isArray(parsed)
        ? `Array[${parsed.length}], first item keys: ${parsed.length > 0 ? Object.keys(parsed[0]).join(', ') : 'none'}`
        : `Object keys: ${Object.keys(parsed).join(', ')}`;
      return { type: 'JSON', detail: keys };
    } catch (e) {
      return { type: 'JSON_PARSE_ERROR', detail: e.message };
    }
  }
  if (trimmed.toLowerCase().includes('access denied') || trimmed.toLowerCase().includes('akamai')) {
    return { type: 'AKAMAI_BLOCK', detail: 'Access Denied / Akamai block' };
  }
  if (trimmed.startsWith('<')) {
    const titleMatch = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Match = trimmed.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    return {
      type: 'HTML',
      detail: `title="${titleMatch ? titleMatch[1].trim() : 'n/a'}", h1="${h1Match ? h1Match[1].trim() : 'n/a'}"`,
    };
  }
  return { type: 'UNKNOWN', detail: trimmed.substring(0, 100) };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/arrondean/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('=== STEP 1: Acquiring Akamai cookies from ea.com ===');
  try {
    await page.goto('https://www.ea.com/en-gb/games/ea-sports-fc/pro-clubs', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    console.log('ea.com loaded, waiting 4s for Akamai cookie establishment...');
    await page.waitForTimeout(4000);
    const cookies = await context.cookies();
    const akCookies = cookies.filter(c => c.name.startsWith('ak') || c.name.includes('akamai') || c.name.startsWith('_abck') || c.name.startsWith('bm_'));
    console.log(`Akamai-related cookies acquired: ${akCookies.map(c => c.name).join(', ') || 'none found'}`);
    console.log(`Total cookies: ${cookies.length}`);
  } catch (e) {
    console.log(`WARNING: ea.com load failed: ${e.message} — continuing with whatever cookies we have`);
  }

  console.log('\n=== STEP 2: Testing API endpoints ===\n');

  const results = [];

  for (const url of URLS) {
    console.log(`Testing: ${url}`);
    let status = null;
    let bodyText = '';
    let error = null;

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      status = response ? response.status() : null;
      // Get the page content (rendered body text for JSON APIs)
      bodyText = await page.evaluate(() => document.body ? document.body.innerText : document.documentElement.innerText);
    } catch (e) {
      error = e.message;
      // Try to get whatever content loaded
      try {
        bodyText = await page.evaluate(() => document.body ? document.body.innerText : '');
      } catch (_) {}
    }

    const snippet = bodyText.substring(0, 600);
    const classification = classifyBody(snippet);

    const result = {
      url,
      status,
      classification,
      snippet: snippet.substring(0, 200),
      error,
    };
    results.push(result);

    console.log(`  Status: ${status}`);
    console.log(`  Body type: ${classification.type}`);
    console.log(`  Detail: ${classification.detail}`);
    if (error) console.log(`  Error: ${error}`);
    console.log(`  Snippet (first 200 chars): ${snippet.substring(0, 200)}`);
    console.log('');
  }

  await browser.close();

  console.log('\n=== STRUCTURED REPORT ===\n');
  for (const r of results) {
    const shortUrl = r.url.replace('https://proclubs.ea.com/api/fc/', '').split('?')[0];
    console.log(`[${shortUrl}] HTTP ${r.status} | ${r.classification.type} | ${r.classification.detail}`);
  }
})();
