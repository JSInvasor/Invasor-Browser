const chalk = require('chalk');
const fs = require('fs').promises;

function log(level, message) {
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    const prefix = chalk.cyan('[nevapolar@Browser] >');
    const levels = {
        INFO: chalk.blue('[INFO]'),
        WARN: chalk.yellow('[WARN]'),
        ERROR: chalk.red('[ERROR]'),
        SUCCESS: chalk.green('[SUCCESS]')
    };
    console.log(`${chalk.gray(`[${now}]`)} ${prefix} ${levels[level] || '[LOG]'} ${message}`);
}

async function installPackage() {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    try {
        require.resolve('puppeteer-real-browser');
        return true;
    } catch (e) {
        log('INFO', 'Installing puppeteer-real-browser...');

        try {
            await execPromise('npm install puppeteer-real-browser');
            log('SUCCESS', 'puppeteer-real-browser installed successfully.');
            return true;
        } catch (error) {
            log('ERROR', 'Failed to install puppeteer-real-browser.');
            log('WARN', 'Try manually: npm install puppeteer-real-browser');
            return false;
        }
    }
}

async function solveTurnstile(targetUrl) {
    const installed = await installPackage();
    if (!installed) process.exit(1);

    const { connect } = require('puppeteer-real-browser');

    log('INFO', 'Starting Google');

    const { browser, page } = await connect({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ],
        turnstilePresent: true,
        fingerprint: {
            devices: ['desktop'],
            locales: ['en-US'],
            screens: ['1920x1080']
        },
        customConfig: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        }
    });

    log('SUCCESS', 'Starting Puppeteer');
    log('INFO', `Target > ${targetUrl}`);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    log('INFO', 'Checking for Turnstile/Challenge');

    const hasChallenge = await page.evaluate(() => {
        const title = document.title.toLowerCase();
        const body = document.body?.innerText?.toLowerCase() || '';
        return title.includes('just a moment') ||
            title.includes('checking') ||
            body.includes('checking your browser') ||
            document.querySelector('.cf-turnstile') ||
            document.querySelector('#challenge-form');
    });

    if (hasChallenge) {
        log('WARN', 'Turnstile/Challenge detected');

        try {
            await page.waitForSelector('input[type="checkbox"]', { visible: true, timeout: 5000 });
            await page.click('input[type="checkbox"]');
            log('SUCCESS', 'Checkbox clicked.');
        } catch {
            log('WARN', 'No checkbox found or automatic solve in progress');
            const frames = page.frames();
            for (const frame of frames) {
                if (frame.url().includes('challenges.cloudflare.com')) {
                    try {
                        await frame.click('input[type="checkbox"]');
                        log('SUCCESS', 'Clicked checkbox inside iframe.');
                        break;
                    } catch { }
                }
            }
        }

        log('INFO', 'Waiting for JS Challange to be Solved');
        let solved = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const stillChallenge = await page.evaluate(() => {
                const title = document.title.toLowerCase();
                return title.includes('just a moment') || title.includes('checking');
            });
            if (!stillChallenge) {
                log('SUCCESS', 'Challenge solved.');
                solved = true;
                break;
            }
            if (i % 5 === 0 && i > 0) {
                log('INFO', `Still waiting... (${30 - i} seconds left)`);
            }
        }
        if (!solved) log('WARN', 'Auto-Bypass timeout. Click CheckBox');
        log('INFO', 'Waiting for cookies to be set...');
        await new Promise(r => setTimeout(r, 5000));
    } else {
        log('SUCCESS', 'No challenge detected.');
        await new Promise(r => setTimeout(r, 3000));
    }

    log('INFO', 'Retrieving cookies...');
    let cookies = await page.cookies();
    let cfClearance = cookies.find(c => c.name === 'cf_clearance');

    if (!cfClearance) {
        log('WARN', 'um we cant find cf_clearance cookies trying again');
        for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(r => setTimeout(r, 3000));
            cookies = await page.cookies();
            cfClearance = cookies.find(c => c.name === 'cf_clearance');
            if (cfClearance) {
                log('SUCCESS', 'cf_clearance cookie retrieved.');
                break;
            }
            log('INFO', `Attempt ${attempt + 1}/5 - Still waiting...`);
        }
    }

    const cfBm = cookies.find(c => c.name === '__cf_bm');

    if (cfClearance) {
        log('SUCCESS', 'we found cf_clearance cookie');
        log('INFO', `cf_clearance: ${cfClearance.value}`);
        await fs.writeFile('cf_clearance.txt', cfClearance.value);
        await fs.writeFile('cookies.json', JSON.stringify(cookies, null, 2));
        log('SUCCESS', 'Cookies saved to cf_clearance.txt and cookies.json.');
    } else {
        log('ERROR', 'cf_clearance cookie not found.');
        log('INFO', 'Attempting page refresh...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));
        const newCookies = await page.cookies();
        const newCfClearance = newCookies.find(c => c.name === 'cf_clearance');
        if (newCfClearance) {
            log('SUCCESS', 'cf_clearance cookie retrieved after refresh.');
            await fs.writeFile('cf_clearance.txt', newCfClearance.value);
            await fs.writeFile('cookies.json', JSON.stringify(newCookies, null, 2));
        } else if (cfBm) {
            log('WARN', '__cf_bm cookie found but no cf_clearance.');
            await fs.writeFile('cookies.json', JSON.stringify(cookies, null, 2));
        } else {
            log('WARN', 'No Cloudflare cookies found.');
            if (cookies.length > 0) {
                await fs.writeFile('cookies.json', JSON.stringify(cookies, null, 2));
                log('INFO', `${cookies.length} other cookies saved.`);
            }
        }
    }

    log('INFO', 'Displaying all cookies:');
    cookies.forEach(cookie => {
        log('INFO', `${cookie.name}: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? '...' : ''}`);
    });

    log('INFO', 'Browser will remain open for 60 seconds.');
    await new Promise(r => setTimeout(r, 60000));
    log('INFO', 'Closing browser...');
    await browser.close();
    log('SUCCESS', 'Done.');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        log('INFO', 'Usage: node browser.js <target_url>');
        process.exit(0);
    }

    const targetUrl = args[0];
    try {
        new URL(targetUrl);
    } catch {
        log('ERROR', `Invalid URL: ${targetUrl}`);
        process.exit(1);
    }

    await solveTurnstile(targetUrl);
}

main().catch(error => {
    log('ERROR', error.message);
    if (error.message.includes('Failed to launch the browser')) {
        log('INFO', 'Possible solutions:');
        log('INFO', '1. Run with sudo (Linux/Mac)');
        log('INFO', '2. Install Chrome/Chromium');
        log('INFO', '3. Try with --no-sandbox flag');
    }
});