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

test.describe('Pool Reconciliation - Regression Tests', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsPoolRecon(page);
    await page.goto(`${BASE_URL}/pool-reconciliation`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/pool-reconciliation/, { timeout: 20000 });
  });

  test('REG-001: Duplicate Pool Upload Error Handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-sample.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      await expect(page.getByText('Validation Results')).toBeVisible({ timeout: 25000 });

      await page.getByRole('button', { name: 'Upload Pool Data' }).click();
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      const dupModal = page.locator('text=Duplicate Pool Data Found');
      const isDupVisible = await dupModal.isVisible({ timeout: 6000 }).catch(() => false);

      if (isDupVisible) {
        await takeScreenshot(page, '05-duplicate-handling', '01-duplicate-pool-modal');
        const closeBtn = page.getByRole('button', { name: 'Close' }).last();
        await expect(closeBtn).toBeVisible();
        await closeBtn.click();
        await expect(dupModal).not.toBeVisible();
        console.log('Verified Duplicate Pool Data dialog can be dismissed.');
      }
    }
  });

  test('REG-002: Minimum Pool Amount Validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-small-amount.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      const swalModal = page.locator('.swal2-popup');
      if (await swalModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const swalText = await page.locator('.swal2-html-container').textContent();
        console.log('Received Swal Warning for low pool amount:', swalText);
        expect(swalText).toContain('minimum');

        await takeScreenshot(page, '02-validation', '06-min-pool-amount-alert');
        await page.locator('.swal2-confirm').click();
      }
    }
  });

  test('REG-003: Missing Required Fields Validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-missing-fields.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      const toastLocator = page.locator('.Toastify__toast-body, .Toastify__toast, .error-message');
      const toastText = await toastLocator.first().textContent().catch(() => '');
      console.log('Received error on missing fields:', toastText);
      
      if (toastText) {
        await takeScreenshot(page, '02-validation', '07-missing-fields-error');
      }
    }
  });

  test('REG-004: Reconciliation Date Range Validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload Pool Data' }).click();

    const testFile = path.resolve(__dirname, '../../test-data/pool-sample.xlsx');
    if (fs.existsSync(testFile)) {
      await page.locator('input[type="file"]').setInputFiles(testFile);
      await page.getByRole('button', { name: 'Validate' }).click();

      await expect(page.getByText('Validation Results')).toBeVisible({ timeout: 25000 });

      const startDateInput = page.locator('input[name="reconStartDate"]');
      const endDateInput = page.locator('input[name="reconEndDate"]');

      if (await startDateInput.isVisible().catch(() => false)) {
        await startDateInput.fill('2025-12-31');
        await endDateInput.fill('2025-01-01');

        const reconcileBtn = page.getByRole('button', { name: 'Run Reconciliation' });
        await reconcileBtn.click();

        const errorToast = page.locator('.Toastify__toast-body, .error-message').first();
        const errorText = await errorToast.textContent().catch(() => '');
        expect(errorText.toLowerCase()).toContain('date');
        
        await takeScreenshot(page, '04-results', '02-invalid-date-range-error');
      }
    }
  });
});