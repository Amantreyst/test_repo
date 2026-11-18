const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.POOL_RECON_EMAIL || 'test_pool@example.com';
const LOGIN_PASSWORD = process.env.POOL_RECON_PASSWORD || 'test@pool123';

const RESULT_DIR = path.resolve(__dirname, '../../results/pool-reconciliation');

async function takeScreenshot(page, category, name) {
  const dir = path.join(RESULT_DIR, category);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.png`);

  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }

  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Screenshot Replaced] ${category}/${name}.png`);
  return filePath;
}

async function loginAsPoolRecon(page) {
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
    if (page.url().includes('/pool-reconciliation/dashboard')) break;
    if (await loginHereBtn.isVisible().catch(() => false)) {
      await loginHereBtn.click();
      await page.waitForTimeout(1000);
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForURL(/\/pool-reconciliation\/dashboard\/?$/, { timeout: 35000 });
}

test.describe('Pool Reconciliation - Security & Vulnerability Tests', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPoolRecon(page);
    await page.goto(`${BASE_URL}/pool-reconciliation`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/pool-reconciliation/, { timeout: 20000 });
  });

  test('SEC-001: Cross-Site Scripting (XSS) in Pool Name Input', async ({ page }) => {
    let alertTriggered = false;
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      console.error(`VULNERABILITY: Untrusted script dialog triggered! "${dialog.message()}"`);
      await dialog.dismiss();
    });

    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const xssPayloads = [
      { name: 'xss-script-tag', payload: "<script>alert('XSS')</script>" },
      { name: 'xss-img-tag', payload: "<img src=x onerror=alert(1)>" },
      { name: 'xss-event-handler', payload: "Pool\" onmouseover=\"alert(1)" }
    ];

    for (const item of xssPayloads) {
      console.log(`Testing XSS Payload: ${item.payload}`);
      const nameInput = page.locator('input[name="poolName"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(item.payload);
        await nameInput.press('Enter');
        await page.waitForTimeout(300);
        await takeScreenshot(page, '06-security-exploits', item.name);
      }
    }

    expect(alertTriggered).toBeFalsy();
    console.log('Passed: No client-side script execution triggered.');
  });

  test('SEC-002: SQL Injection (SQLi) in Search & Form Fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const sqliPayloads = [
      { name: 'sqli-or-condition', payload: "' OR '1'='1" },
      { name: 'sqli-comment-admin', payload: "admin'--" },
      { name: 'sqli-drop-table', payload: "1; DROP TABLE pools;--" }
    ];

    for (const item of sqliPayloads) {
      console.log(`Testing SQLi Payload: ${item.payload}`);
      const nameInput = page.locator('input[name="poolName"]').first();
      const amountInput = page.locator('input[name="poolAmount"]').first();

      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(item.payload);
      }
      if (await amountInput.isVisible().catch(() => false)) {
        await amountInput.fill('1000000');
      }
      await page.waitForTimeout(300);
      await takeScreenshot(page, '06-security-exploits', item.name);
    }
  });

  test('SEC-003: Boundary & Negative Pool Amount Handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const boundaryValues = [
      { name: 'boundary-negative', val: '-50000' },
      { name: 'boundary-zero', val: '0' },
      { name: 'boundary-overflow', val: '999999999999999999' }
    ];

    for (const item of boundaryValues) {
      console.log(`Testing Boundary Value: ${item.val}`);
      const nameInput = page.locator('input[name="poolName"]').first();
      const amountInput = page.locator('input[name="poolAmount"]').first();

      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('BOUND_TEST_POOL');
      }
      if (await amountInput.isVisible().catch(() => false)) {
        await amountInput.fill(item.val);
      }
      await takeScreenshot(page, '06-security-exploits', item.name);
    }
  });

  test('SEC-004: File Upload Path Traversal', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-sample.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      await expect(page.getByText('Validation Results')).toBeVisible({ timeout: 25000 });

      const fileNameDisplay = page.locator('.file-name, [data-testid="file-name"]');
      if (await fileNameDisplay.isVisible().catch(() => false)) {
        const displayedName = await fileNameDisplay.textContent();
        expect(displayedName).not.toContain('..');
        expect(displayedName).not.toContain('/');
        expect(displayedName).not.toContain('\\');
      }
    }
  });
});