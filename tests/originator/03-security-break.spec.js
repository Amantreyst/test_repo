const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator');

async function takeScreenshot(page, category, name) {
  const dir = path.join(RESULT_DIR, category);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.png`);

  // Explicitly remove existing screenshot to replace old one
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }

  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Screenshot Replaced] ${category}/${name}.png`);
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
      await loginHereBtn.click();
      await page.waitForTimeout(1000);
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForURL(/\/originator\/dashboard\/?$/, { timeout: 35000 });
}

// ============================================================
// SYSTEM BREAKING & VULNERABILITY AUDIT
// ============================================================
test.describe('Originator - System Breaking & Security Tests', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsOriginator(page);
    await page.goto(`${BASE_URL}/da/deal-ori/deal-creation`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/deal-creation/, { timeout: 20000 });
  });

  test('SEC-001: Cross-Site Scripting (XSS) in Deal Name Input', async ({ page }) => {
    let alertTriggered = false;
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      console.error(`VULNERABILITY: Untrusted script dialog triggered! "${dialog.message()}"`);
      await dialog.dismiss();
    });

    await page.getByRole('button', { name: 'Create Deal' }).click();

    const xssPayloads = [
      { name: 'xss-script-tag', payload: "<script>alert('XSS')</script>" },
      { name: 'xss-img-tag', payload: "<img src=x onerror=alert(1)>" },
      { name: 'xss-event-handler', payload: "Deal\" onmouseover=\"alert(1)" }
    ];

    for (const item of xssPayloads) {
      console.log(`Testing XSS Payload: ${item.payload}`);
      await page.locator('input[name="dealName"]').fill(item.payload);
      await page.locator('input[name="dealName"]').press('Enter');
      await page.waitForTimeout(300);
      // Fixed screenshot name replaces old one
      await takeScreenshot(page, '06-security-exploits', item.name);
    }

    expect(alertTriggered).toBeFalsy();
    console.log('Passed: No client-side script execution triggered.');
  });

  test('SEC-002: SQL Injection (SQLi) in Search & Form Fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Deal' }).click();

    const sqliPayloads = [
      { name: 'sqli-or-condition', payload: "' OR '1'='1" },
      { name: 'sqli-comment-admin', payload: "admin'--" },
      { name: 'sqli-drop-table', payload: "1; DROP TABLE deals;--" }
    ];

    for (const item of sqliPayloads) {
      console.log(`Testing SQLi Payload: ${item.payload}`);
      await page.locator('input[name="dealName"]').fill(item.payload);
      await page.locator('input[name="originalPoolValue"]').fill('20000000');
      await page.waitForTimeout(300);
      // Fixed screenshot name replaces old one
      await takeScreenshot(page, '06-security-exploits', item.name);
    }
  });

  test('SEC-003: Boundary & Negative Pool Value Handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Deal' }).click();

    const boundaryValues = [
      { name: 'boundary-negative', val: '-50000' },
      { name: 'boundary-zero', val: '0' },
      { name: 'boundary-overflow', val: '999999999999999999' }
    ];

    for (const item of boundaryValues) {
      console.log(`Testing Boundary Value: ${item.val}`);
      await page.locator('input[name="dealName"]').fill('BOUND_TEST_DEAL');
      await page.locator('input[name="originalPoolValue"]').fill(item.val);
      // Fixed screenshot name replaces old one
      await takeScreenshot(page, '06-security-exploits', item.name);
    }
  });

});
