/**
 * Capture FWL Phase 7 polish screenshots:
 *   - mobile dashboard (above the fold) with new ordering
 *   - mobile sidebar with safe-area header
 *   - desktop dashboard sanity check
 */
import { chromium, devices } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.SCREENSHOT_BASE_URL || 'http://localhost:5050';
const OUT = path.resolve(process.cwd(), 'screenshots');

async function loginAsDemo(page: any) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // Wait for the demo button to be visible and click it
  const demoBtn = page.locator('[data-testid="button-demo-mode"]');
  await demoBtn.waitFor({ timeout: 10000 });
  await demoBtn.click();
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();

  // ── Mobile context ────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await loginAsDemo(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);

    // Full mobile dashboard
    await page.screenshot({
      path: path.join(OUT, 'phase7-polish-mobile-dashboard.png'),
      fullPage: true,
    });

    // Above-the-fold mobile dashboard
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT, 'phase7-polish-mobile-dashboard-above-fold.png'),
      fullPage: false,
    });

    // Open mobile sidebar
    const menuBtn = page.locator('[data-testid="button-mobile-menu"]');
    if (await menuBtn.count()) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(OUT, 'phase7-polish-mobile-sidebar.png'),
        fullPage: false,
      });
    } else {
      console.warn('[capture] mobile menu button not found');
    }

    await ctx.close();
  }

  // ── Desktop context ───────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await loginAsDemo(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);

    await page.screenshot({
      path: path.join(OUT, 'phase7-polish-desktop-dashboard-above-fold.png'),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(OUT, 'phase7-polish-desktop-dashboard.png'),
      fullPage: true,
    });

    await ctx.close();
  }

  await browser.close();
  console.log('Screenshots written to', OUT);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
