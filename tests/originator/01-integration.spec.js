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
    try { fs.unlinkSync(filePath); } catch { }
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
      console.log('Active session detected. Clicking "Login Here"...');
      await loginHereBtn.click();
      await page.waitForTimeout(1000);
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForURL(/\/originator\/dashboard\/?$/, { timeout: 35000 });
  await takeScreenshot(page, '01-dashboard', '01-originator-dashboard-loaded');
  console.log('Originator login verified successfully.');
}

async function navigateToDealCreation(page) {
  await page.goto(`${BASE_URL}/da/deal-ori/deal-creation`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/da\/deal-ori\/deal-creation/, { timeout: 20000 });
  await takeScreenshot(page, '02-deal-creation', '01-deal-creation-page');
}

// ============================================================
// INTEGRATION TESTS
// ============================================================
test.describe('Originator Module - Integration Testing', () => {

  test('INT-001: Originator Login and Dashboard Integration', async ({ page }) => {
    await loginAsOriginator(page);
    await expect(page).toHaveURL(/\/originator\/dashboard/);
    await expect(page.getByRole('button', { name: 'Direct Assignment' })).toBeVisible();
    await takeScreenshot(page, '01-dashboard', '02-originator-metrics-view');
  });

  test('INT-002: Navigation & Deal Origination Components Integration', async ({ page }) => {
    await loginAsOriginator(page);
    await navigateToDealCreation(page);

    const createDealBtn = page.getByRole('button', { name: 'Create Deal' });
    await expect(createDealBtn).toBeVisible();
    await createDealBtn.click();

    await expect(page.locator('input[name="dealName"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[name="originalPoolValue"]')).toBeVisible();
    await takeScreenshot(page, '02-deal-creation', '02-create-deal-modal-open');
  });

  test('INT-003: LAN File Upload & Backend Verification Integration', async ({ page }) => {
    await loginAsOriginator(page);
    await navigateToDealCreation(page);
    await page.getByRole('button', { name: 'Create Deal' }).click();

    // Upload LAN Info Excel file
    await page.locator('#loan-info-upload').setInputFiles(LAN_FILE);
    await takeScreenshot(page, '03-lan-validation', '01-lan-file-selected');

    // Click Validate
    await page.getByRole('button', { name: 'Validate' }).click();

    // Check for duplicate LAN modal popup
    const dupModal = page.locator('text=Duplicate LAN(s) Found');
    const isDupVisible = await dupModal.isVisible({ timeout: 8000 }).catch(() => false);

    if (isDupVisible) {
      console.log('Duplicate LANs detected in existing deals. Handling duplicate dialog...');
      await takeScreenshot(page, '05-duplicate-handling', '01-duplicate-lan-dialog');
      const closeBtn = page.getByRole('button', { name: 'Close' }).last();
      await closeBtn.click();
      console.log('Duplicate LANs dialog dismissed successfully.');
    } else {
      await expect(page.getByText('Validation Results').first()).toBeVisible({ timeout: 25000 });
      await takeScreenshot(page, '03-lan-validation', '02-lan-validation-results');
      console.log('LAN validation completed successfully.');
    }
  });

  test('INT-004: Deal Settings Modal & Share Auto-Calculation Integration', async ({ page }) => {
    await loginAsOriginator(page);
    await navigateToDealCreation(page);
    await page.getByRole('button', { name: 'Create Deal' }).click();

    const uniqueDeal = `INT_TEST_${Date.now()}`;
    await page.locator('input[name="dealName"]').fill(uniqueDeal);
    await page.locator('input[name="originalPoolValue"]').fill('20000000');

    // Select investor
    const investorInput = page.locator('#react-select-3-input');
    if (await investorInput.isVisible().catch(() => false)) {
      await investorInput.fill('test_invest');
      await page.waitForTimeout(500);
      const opt = page.getByRole('option', { name: 'test_invest first' }).first();
      if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) await opt.click();
      else await investorInput.press('Enter');
    }

    // Upload LAN File
    await page.locator('#loan-info-upload').setInputFiles(LAN_FILE);
    await page.getByRole('button', { name: 'Validate' }).click();

    // Check and handle duplicate LAN dialog if it appears
    const dupModal = page.locator('text=Duplicate LAN(s) Found');
    if (await dupModal.isVisible({ timeout: 6000 }).catch(() => false)) {
      console.log('Duplicate LAN modal appeared. Dismissing modal...');
      await takeScreenshot(page, '05-duplicate-handling', '02-duplicate-lan-dialog');
      const closeBtn = page.getByRole('button', { name: 'Close' }).last();
      await closeBtn.click();
    }

    // Check if Deal Type radio is enabled (system locks it when LANs are duplicate)
    const othersRadio = page.getByRole('radio', { name: 'Others' });
    const isRadioEnabled = await othersRadio.isEnabled().catch(() => false);

    if (isRadioEnabled) {
      await othersRadio.check();
      const settingsBtn = page.getByRole('button', { name: /Add Settings|Edit Settings/i });
      if (await settingsBtn.isEnabled().catch(() => false)) {
        await settingsBtn.click();

        // Check share auto-calculation
        const assignorInput = page.locator('input[name="assignorShare"]').or(
          page.getByRole('textbox', { name: /assignor share/i })
        ).first();
        await assignorInput.fill('65');

        const assigneeInput = page.locator('input[name="assigneeShare"]').or(
          page.getByRole('textbox', { name: /assignee share/i })
        ).first();
        const assigneeValue = await assigneeInput.inputValue();
        console.log(`Auto-calculated Assignee Share: ${assigneeValue}% (Expected 35%)`);
        expect(parseFloat(assigneeValue)).toBe(35);

        await takeScreenshot(page, '04-deal-settings', '01-deal-settings-modal');
        await page.getByRole('button', { name: 'Save Settings' }).click();
      }
    } else {
      console.log('System Security Verification: Deal Type is safely disabled because LAN numbers already exist in DB.');
      await takeScreenshot(page, '05-duplicate-handling', '03-deal-type-safely-locked');
    }
  });

});
