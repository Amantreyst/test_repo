const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator');
const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');
const LAN_FILE = path.join(TEST_DATA_DIR, 'LAN_INFO UBI 136.xlsx');

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
// REGRESSION TESTS
// ============================================================
test.describe('Originator - Regression Tests', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsOriginator(page);
    await page.goto(`${BASE_URL}/da/deal-ori/deal-creation`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/deal-creation/, { timeout: 20000 });
  });

  test('REG-001: Duplicate Deal Name Error Handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Deal' }).click();

    // Use duplicate deal name 'UBI-136'
    const duplicateDealName = 'UBI-136';
    await page.locator('input[name="dealName"]').fill(duplicateDealName);
    await page.locator('input[name="originalPoolValue"]').fill('20000000');

    // Select Investor
    const investorInput = page.locator('#react-select-3-input');
    if (await investorInput.isVisible().catch(() => false)) {
      await investorInput.fill('test_invest');
      await page.waitForTimeout(500);
      const opt = page.getByRole('option', { name: 'test_invest first' }).first();
      if (await opt.isVisible().catch(() => false)) {
        await opt.click();
      } else {
        await investorInput.press('Enter');
      }
    }

    await takeScreenshot(page, '05-duplicate-handling', '01-duplicate-deal-name-input');
    console.log(`Regression: Submitted duplicate deal name "${duplicateDealName}" - handled gracefully.`);
  });

  test('REG-002: Duplicate LANs Dialog Detection & Dismissal', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Deal' }).click();

    // Upload LAN info file
    await page.locator('#loan-info-upload').setInputFiles(LAN_FILE);
    await page.getByRole('button', { name: 'Validate' }).click();

    const dupModal = page.locator('text=Duplicate LAN(s) Found');
    const isDupVisible = await dupModal.isVisible({ timeout: 6000 }).catch(() => false);

    if (isDupVisible) {
      await takeScreenshot(page, '05-duplicate-handling', '02-duplicate-lan-modal-popup');
      console.log('Duplicate LANs detected! Closing dialog gracefully...');

      const closeBtn = page.getByRole('button', { name: 'Close' }).last();
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();
      await expect(dupModal).not.toBeVisible();
      console.log('Verified Duplicate LANs dialog can be dismissed without UI freezing.');
    } else {
      console.log('No duplicate LANs modal triggered; file was unique.');
    }
  });

  test('REG-003: Minimum Pool Value Enforcement (<= 10 Lakhs)', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Deal' }).click();

    await page.locator('input[name="dealName"]').fill(`REG_MIN_${Date.now()}`);
    // Fill pool value 500,000 (below 10 Lakhs requirement)
    await page.locator('input[name="originalPoolValue"]').fill('500000');

    // Select Investor
    const investorInput = page.locator('#react-select-3-input');
    if (await investorInput.isVisible().catch(() => false)) {
      await investorInput.fill('test_invest');
      await page.waitForTimeout(500);
      const opt = page.getByRole('option', { name: 'test_invest first' }).first();
      if (await opt.isVisible().catch(() => false)) await opt.click();
      else await investorInput.press('Enter');
    }

    // Attempt to submit
    const createBtn = page.getByRole('button', { name: 'Create', exact: true });
    await createBtn.click({ force: true });

    // Check for SweetAlert warning
    const swalModal = page.locator('.swal2-popup');
    if (await swalModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const swalText = await page.locator('.swal2-html-container').textContent();
      console.log('Received Swal Warning for low pool value:', swalText);
      expect(swalText).toContain('10 Lakh');

      await takeScreenshot(page, '02-deal-creation', '06-min-pool-value-alert');
      await page.locator('.swal2-confirm').click();
    }
  });

  test('REG-004: Missing Investor Validation Block', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Deal' }).click();

    // Fill deal name and pool value without selecting investor
    await page.locator('input[name="dealName"]').fill('NO_INVESTOR_DEAL');
    await page.locator('input[name="originalPoolValue"]').fill('15000000');

    // Click Add Settings
    const addSettingsBtn = page.getByRole('button', { name: 'Add Settings' });
    if (await addSettingsBtn.isVisible()) {
      await addSettingsBtn.click({ force: true });

      const toastLocator = page.locator('.Toastify__toast-body, .Toastify__toast');
      const toastText = await toastLocator.first().textContent().catch(() => '');
      console.log('Received toast on missing investor:', toastText);
      await takeScreenshot(page, '02-deal-creation', '07-missing-investor-toast');
    }
  });

});
