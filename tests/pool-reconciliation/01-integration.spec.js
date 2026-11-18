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

async function navigateToPoolReconciliation(page) {
  await page.goto(`${BASE_URL}/pool-reconciliation`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/pool-reconciliation/, { timeout: 20000 });
}

test.describe('Pool Reconciliation - Integration Tests', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPoolRecon(page);
    await navigateToPoolReconciliation(page);
  });

  test('INT-001: Pool Reconciliation Login and Dashboard Access', async ({ page }) => {
    await expect(page).toHaveURL(/\/pool-reconciliation\/dashboard/);
    await expect(page.getByRole('button', { name: 'Upload Pool Data' })).toBeVisible();
    await takeScreenshot(page, '01-dashboard', '01-pool-recon-dashboard-loaded');
  });

  test('INT-002: Navigation to Pool Reconciliation Components', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: 'Upload Pool Data' });
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    await expect(page.locator('input[type="file"]')).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, '02-upload', '01-upload-modal-open');
  });

  test('INT-003: Pool Data File Upload & Validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-sample.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await takeScreenshot(page, '02-upload', '02-pool-file-selected');

      await page.getByRole('button', { name: 'Validate' }).click();

      await expect(page.getByText('Validation Results')).toBeVisible({ timeout: 25000 });
      await takeScreenshot(page, '03-validation', '01-pool-validation-results');
    } else {
      console.log('Test file not found, skipping file upload test');
    }
  });

  test('INT-004: Reconciliation Results Display', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-sample.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      await expect(page.getByText('Validation Results')).toBeVisible({ timeout: 25000 });

      const reconcileBtn = page.getByRole('button', { name: 'Run Reconciliation' });
      if (await reconcileBtn.isVisible().catch(() => false)) {
        await reconcileBtn.click();
        await expect(page.getByText('Reconciliation Results')).toBeVisible({ timeout: 30000 });
        await takeScreenshot(page, '04-results', '01-reconciliation-results');
      }
    }
  });
});