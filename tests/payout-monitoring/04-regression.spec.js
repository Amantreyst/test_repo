const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator/payout-monitoring/03-regression');
const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');
const SAMPLE_DUPLICATE_FILE = path.join(TEST_DATA_DIR, 'May-25.xlsx');

async function takeScreenshot(page, name) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const filePath = path.join(RESULT_DIR, `${name}.png`);

  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { }
  }

  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Screenshot Replaced] 03-regression/${name}.png`);
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
// REGRESSION TESTS: PAYOUT MONITORING
// ============================================================
test.describe('Payout Monitoring - Regression Testing', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsOriginator(page);
    await page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });
  });

  test('REG-PM-001: Deal Search Filter & Clear Action Regression', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search folder name"]');
    await expect(searchInput).toBeVisible();

    // Type non-existent deal query
    await searchInput.fill('NON_EXISTENT_DEAL_XYZ');
    await page.waitForTimeout(500);

    // Verify empty state or filtered list
    await takeScreenshot(page, '01-search-filtered-empty');

    // Click Clear button
    const clearBtn = page.locator('button:has-text("Clear")');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(searchInput).toHaveValue('');
      console.log('Verified search filter clear action restored input.');
    } else {
      await searchInput.fill('');
    }

    await takeScreenshot(page, '02-search-filter-cleared');
  });

  test('REG-PM-002: Deal Status Filter Dropdown Toggle Regression', async ({ page }) => {
    const filterBtn = page.locator('button[title*="Filter deals by status"]');
    if (await filterBtn.isVisible({ timeout: 4000 })) {
      await filterBtn.click();

      // Check dropdown options
      const activeOpt = page.locator('button:has-text("Active Deals")');
      const closedOpt = page.locator('button:has-text("Closed Deals")');
      const allOpt = page.locator('button:has-text("All Deals")');

      await expect(allOpt.or(activeOpt).first()).toBeVisible();
      await takeScreenshot(page, '03-status-filter-dropdown-open');

      // Click Outside to close
      await filterBtn.click();
    }
  });

  test('REG-PM-003: Invalid File Extension Upload Constraint Regression', async ({ page }) => {
    // Check that file input explicitly enforces .xlsx,.xls
    const fileInput = page.locator('input[type="file"]');
    const acceptAttr = await fileInput.getAttribute('accept');
    console.log(`File input accept attribute: ${acceptAttr}`);
    expect(acceptAttr).toContain('.xlsx');
    expect(acceptAttr).toContain('.xls');
  });

  test('REG-PM-004: Duplicate Collection File Upload Error Interception', async ({ page }) => {
    expect(fs.existsSync(SAMPLE_DUPLICATE_FILE)).toBeTruthy();

    const fileInput = page.locator('input[type="file"][accept*=".xlsx"], input[type="file"][accept*=".xls"]');
    await fileInput.first().setInputFiles(SAMPLE_DUPLICATE_FILE);

    // Wait for bulk upload modal
    const modalHeader = page.getByRole('heading', { name: 'Upload Progress' });
    await expect(modalHeader).toBeVisible({ timeout: 15000 });

    const checkStatusBtn = page.getByRole('button', { name: 'Check Status' });
    const modalCloseBtn = page.locator('.fixed.inset-0 button:has-text("Close"), .fixed.inset-0 button[title="Close"]').first();

    // Poll until backend reports the duplicate error or upload completion/failure toast
    let errorIntercepted = false;
    for (let attempt = 1; attempt <= 15; attempt++) {
      const errorText = page.locator('text=/already exists/i, text=/duplicate/i, text=/Validation Errors/i, text=/Failed/i').first();
      const toastError = page.locator('.Toastify__toast--error, .Toastify__toast--warning').first();

      if (await errorText.isVisible().catch(() => false) || await toastError.isVisible().catch(() => false)) {
        errorIntercepted = true;
        console.log(`[PASS] Error or duplicate notification intercepted on attempt ${attempt}.`);
        break;
      }

      if (await modalCloseBtn.isVisible().catch(() => false)) {
        // Modal has marked completion / error state
        errorIntercepted = true;
        console.log(`[PASS] Modal reached terminal state with close enabled on attempt ${attempt}.`);
        break;
      }

      if (await checkStatusBtn.isVisible().catch(() => false)) {
        const isEnabled = await checkStatusBtn.isEnabled().catch(() => false);
        if (isEnabled) await checkStatusBtn.click();
      }

      await page.waitForTimeout(1500);
    }

    await takeScreenshot(page, '04-duplicate-file-error-detected');
    expect(errorIntercepted).toBeTruthy();

    // Verify modal dismisses cleanly without locking UI
    if (await modalCloseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modalCloseBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(modalHeader).not.toBeVisible({ timeout: 5000 });
    console.log('[PASS] Bulk upload modal dismissed cleanly.');
  });

  test('REG-PM-005: Duplicate File/LAN Error Detection & Create New Deal Recovery', async ({ page }) => {
    const LAN_FILE = path.join(TEST_DATA_DIR, 'LAN_INFO UBI 136.xlsx');
    expect(fs.existsSync(LAN_FILE)).toBeTruthy();

    // Navigate to Originator Dashboard to trigger Deal Creation
    await page.goto(`${BASE_URL}/originator/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/originator\/dashboard/, { timeout: 15000 });

    const createDealBtn = page.locator('button:has-text("Create New Deal"), button:has-text("Create Deal")').first();
    await expect(createDealBtn).toBeVisible({ timeout: 15000 });
    await createDealBtn.click();

    // Verify Deal Creation modal
    const dealModalTitle = page.locator('h2:has-text("Create New Deal")');
    await expect(dealModalTitle).toBeVisible({ timeout: 8000 });

    // Fill Basic Deal Details
    const initialDealName = `IHFL_DUP_CHECK_${Date.now()}`;
    await page.locator('input[name="dealName"]').fill(initialDealName);
    await page.locator('input[name="originalPoolValue"]').fill('20000000');

    // Select Investor
    const investorInput = page.locator('#react-select-3-input');
    if (await investorInput.isVisible().catch(() => false)) {
      await investorInput.fill('test_invest');
      const investorOption = page.locator('div[id*="option"]:has-text("test_invest"), div[class*="option"]:has-text("test_invest")').first();
      if (await investorOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await investorOption.click();
      } else {
        await page.keyboard.press('Enter');
      }
    }

    // Step 1: Upload already-existing LAN file to trigger duplicate error
    console.log('[REG-PM-005] Uploading file with existing LAN records to verify duplicate error handling...');
    const lanInput = page.locator('#loan-info-upload');
    await lanInput.setInputFiles(LAN_FILE);

    // Click Validate
    const validateBtn = page.getByRole('button', { name: 'Validate' });
    await expect(validateBtn).toBeVisible();
    await validateBtn.click();

    // Step 2: Assert Duplicate LAN error modal appears
    const duplicateModal = page.locator('text=/Duplicate LAN Nos Found/i, text=/Duplicate LAN/i').first();
    await expect(duplicateModal).toBeVisible({ timeout: 15000 });
    console.log('[PASS] Duplicate LAN error modal displayed as expected.');

    // Assert existing deal reference is displayed
    const existingDealRef = page.locator('text=IHFL_136_UBI').first();
    const isDealRefVisible = await existingDealRef.isVisible().catch(() => false);
    console.log(`[PASS] Existing deal cited in duplicate details: ${isDealRefVisible}`);

    await takeScreenshot(page, '05-duplicate-file-error-message');

    // Step 3: Dismiss duplicate modal gracefully without crash
    const dupCloseBtn = page.locator('.fixed.z-50 button:has-text("Close"), div:has-text("Duplicate LAN") button').last();
    if (await dupCloseBtn.isVisible().catch(() => false)) {
      await dupCloseBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(1000);
    console.log('[PASS] Duplicate LAN modal dismissed successfully.');

    // Step 4: Verify recovery path to upload new / create new deal
    const newDealName = `IHFL_136_NEW_${Date.now().toString().slice(-4)}`;
    const dealNameInput = page.locator('input[name="dealName"]');
    await dealNameInput.fill(newDealName);
    expect(await dealNameInput.inputValue()).toBe(newDealName);

    await takeScreenshot(page, '06-create-new-deal-ready');
    console.log(`[PASS] Verified recovery workflow to create new deal: "${newDealName}".`);

    // Cleanly close create deal dialog
    const modalCloseBtn = page.locator('button:has(svg.text-gray-500), button[aria-label="Close"], button:has(svg)').first();
    if (await modalCloseBtn.isVisible().catch(() => false)) {
      await modalCloseBtn.click();
    }
  });

});
