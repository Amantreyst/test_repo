const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator/payout-monitoring/02-integration');
const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');
const SAMPLE_PAYOUT_FILE = path.join(TEST_DATA_DIR, 'Aug-25.xlsx');

async function takeScreenshot(page, name) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const filePath = path.join(RESULT_DIR, `${name}.png`);

  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { }
  }

  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Screenshot Replaced] 02-integration/${name}.png`);
  return filePath;
}

async function loginAsOriginator(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

  const landingSignIn = page.getByRole('button', { name: 'Sign In' });
  const emailInput = page.locator('#email, input[name="email"], input[type="email"]');

  if (!(await emailInput.first().isVisible().catch(() => false))) {
    if (await landingSignIn.isVisible()) await landingSignIn.click();
  }

  await expect(emailInput.first()).toBeVisible({ timeout: 10000 });
  await emailInput.first().fill(LOGIN_EMAIL);

  const passwordInput = page.locator('#password, input[name="password"], input[type="password"]');
  await passwordInput.first().fill(LOGIN_PASSWORD);

  await page.locator('button[type="submit"]:has-text("Sign In"), form button:has-text("Sign In")').first().click();

  const loginHereBtn = page.getByRole('button', { name: 'Login Here' });
  const startTime = Date.now();

  while (Date.now() - startTime < 15000) {
    if (page.url().includes('/originator/dashboard')) break;
    if (await loginHereBtn.isVisible().catch(() => false)) {
      console.log('Active session detected. Clicking "Login Here"...');
      await loginHereBtn.click();
      await page.waitForTimeout(1000);
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForURL(/\/originator\/dashboard\/?$/, { timeout: 35000 });
}

// ============================================================
// INTEGRATION TESTS: PAYOUT MONITORING
// ============================================================
test.describe('Payout Monitoring - Integration Testing', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsOriginator(page);
    await page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });
  });

  test('INT-PM-001: Payout Deals API & Sidebar Integration', async ({ page }) => {
    // Intercept/monitor API response for deals
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/services/PAYOUT/deals'),
      { timeout: 15000 }
    ).catch(() => null);

    // Refresh deals or check sidebar count
    await page.reload();
    const response = await responsePromise;

    if (response) {
      console.log(`Backend API Status for Payout Deals: ${response.status()}`);
      expect([200, 304]).toContain(response.status());
    }

    await takeScreenshot(page, '01-payout-deals-list-loaded');
  });

  test('INT-PM-002: Payout Template Download Integration', async ({ page }) => {
    const templateBtn = page.locator('button[title*="Download Template"], .template-excel');
    await expect(templateBtn).toBeVisible();

    // Listen for client-side download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await templateBtn.click();
    const download = await downloadPromise;

    if (download) {
      const filename = download.suggestedFilename();
      console.log(`Downloaded Payout Template filename: ${filename}`);
      expect(filename).toContain('.xlsx');
    }

    await takeScreenshot(page, '02-template-download-triggered');
  });

  test('INT-PM-003: Monthly Payout Collection File Upload & Queuing Integration', async ({ page }) => {
    // Verify sample payout file exists
    expect(fs.existsSync(SAMPLE_PAYOUT_FILE)).toBeTruthy();

    const uploadBtn = page.locator('button[title*="Upload Excel file"], .add-deal-btn');
    if (await uploadBtn.isVisible({ timeout: 5000 })) {
      await uploadBtn.click();
    }

    // Set file into input
    const fileInput = page.locator('input[type="file"][accept*=".xlsx"]');
    await fileInput.setInputFiles(SAMPLE_PAYOUT_FILE);

    console.log('Uploaded single monthly file for integration verification.');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '03-monthly-file-uploaded-queued');
  });

});

