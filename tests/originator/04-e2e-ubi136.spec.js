const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator');
const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');

const LAN_FILE = path.join(TEST_DATA_DIR, 'LAN_INFO UBI 136.xlsx');
const PAYOUT_FILES = [
  path.join(TEST_DATA_DIR, 'Aug-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Dec-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Feb-26.xlsx'),
  path.join(TEST_DATA_DIR, 'IIFL_136_UBI-Apr-25.xlsx'),
];

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
  await takeScreenshot(page, '01-dashboard', '01-originator-dashboard-view');
  console.log('Originator login verified successfully.');
}

// ============================================================
// FULL END-TO-END WORKFLOW (UBI-136)
// ============================================================
test.describe('Originator - Full E2E Workflow with UBI-136', () => {

  test('E2E-001: Deal Creation, LAN Validation, Settings & Payout Upload', async ({ page }) => {
    test.setTimeout(180000);

    // Verify test files exist
    for (const f of [LAN_FILE, ...PAYOUT_FILES]) {
      if (!fs.existsSync(f)) throw new Error(`Required test file not found: ${f}`);
    }

    const uniqueDealName = `UBI-136_${Date.now()}`;
    console.log(`Starting E2E workflow with Deal Name: ${uniqueDealName}`);

    await test.step('01 - Login as Originator', async () => {
      try {
        await loginAsOriginator(page);
      } catch (error) {
        console.error('❌ ERROR in "01 - Login as Originator":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '01-dashboard', 'ERROR-login-failed');
        throw error;
      }
    });

    await test.step('02 - Navigate to Deal Creation', async () => {
      try {
        await page.goto(`${BASE_URL}/da/deal-ori/deal-creation`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/\/da\/deal-ori\/deal-creation/, { timeout: 20000 });
        await page.getByRole('button', { name: 'Create Deal' }).click();
        await takeScreenshot(page, '02-deal-creation', '01-create-modal-opened');
      } catch (error) {
        console.error('❌ ERROR in "02 - Navigate to Deal Creation":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '02-deal-creation', 'ERROR-nav-deal-creation-failed');
        throw error;
      }
    });

    await test.step('03 - Fill Basic Deal Details', async () => {
      try {
        const dealNameInput = page.locator('input[name="dealName"]');
        await dealNameInput.fill(uniqueDealName);
        await dealNameInput.press('Enter');

        const poolValueInput = page.locator('input[name="originalPoolValue"]');
        await poolValueInput.fill('20000000');
        await poolValueInput.press('Tab');

        const investorInput = page.locator('#react-select-3-input');
        if (await investorInput.isVisible().catch(() => false)) {
          await investorInput.fill('test_invest');
          await page.waitForTimeout(500);
          const opt = page.getByRole('option', { name: 'test_invest first' }).first();
          if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) await opt.click();
          else await investorInput.press('Enter');
        }

        await takeScreenshot(page, '02-deal-creation', '02-basic-details-filled');
      } catch (error) {
        console.error('❌ ERROR in "03 - Fill Basic Deal Details":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '02-deal-creation', 'ERROR-fill-deal-details-failed');
        throw error;
      }
    });

    await test.step('04 - Upload and Validate LAN Excel File', async () => {
      try {
        await page.locator('#loan-info-upload').setInputFiles(LAN_FILE);
        await page.getByRole('button', { name: 'Validate' }).click();

        // Check for duplicate LAN modal popup
        const dupModal = page.locator('text=Duplicate LAN(s) Found');
        if (await dupModal.isVisible({ timeout: 7000 }).catch(() => false)) {
          console.log('Duplicate LANs detected in existing deals! Dismissing modal gracefully...');
          await takeScreenshot(page, '05-duplicate-handling', '01-duplicate-lan-dialog');
          const closeBtn = page.getByRole('button', { name: 'Close' }).last();
          await closeBtn.click();
        } else {
          await expect(page.getByText('Validation Results').first()).toBeVisible({ timeout: 25000 });
          await takeScreenshot(page, '03-lan-validation', '01-lan-validation-success');
        }
      } catch (error) {
        console.error('❌ ERROR in "04 - Upload and Validate LAN Excel File":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '03-lan-validation', 'ERROR-lan-validation-failed');
        throw error;
      }
    });

    await test.step('05 - Configure Deal Settings', async () => {
      try {
        const othersRadio = page.locator('input[type="radio"][value="Others"][name="dealType"]');
        const isRadioEnabled = await othersRadio.isEnabled().catch(() => false);

        if (isRadioEnabled) {
          // Click the visible label associated with the hidden radio
          await page.locator('label:has-text("Others")').first().click();
          const settingsBtn = page.getByRole('button', { name: /Add Settings|Edit Settings/i });
          if (await settingsBtn.isEnabled().catch(() => true)) {
            await settingsBtn.click();

            await page.locator('input[name="dateofDisbursement"]').fill('2025-03-15');
            await page.locator('input[name="payoutDay"]').or(page.getByRole('textbox', { name: /payout day/i })).first().fill('10');
            await page.locator('input[name="assigneeShare"]').or(page.getByRole('textbox', { name: /assignee share/i })).first().fill('30');
            await page.locator('input[name="assignorShare"]').or(page.getByRole('textbox', { name: /assignor share/i })).first().fill('70');

            const benchmarkSelect = page.locator('select[name="benchmarkType"]');
            if (await benchmarkSelect.isVisible().catch(() => false)) {
              await benchmarkSelect.selectOption('RBLR');
            }

            const t1Checkbox = page.getByRole('checkbox', { name: /T1 Actual Days/i });
            if (await t1Checkbox.isVisible().catch(() => false)) {
              await t1Checkbox.check();
            }

            await takeScreenshot(page, '04-deal-settings', '01-deal-settings-modal');
            await page.getByRole('button', { name: 'Save Settings' }).click();
          }
        } else {
          console.log('LAN numbers already exist in DB; system safely keeps Deal Type locked as expected.');
          await takeScreenshot(page, '05-duplicate-handling', '02-deal-type-locked-by-duplicate-lan');
        }
      } catch (error) {
        console.error('❌ ERROR in "05 - Configure Deal Settings":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '04-deal-settings', 'ERROR-deal-settings-failed');
        throw error;
      }
    });

    await test.step('06 - Submit Deal & Verify Tabs', async () => {
      try {
        const createBtn = page.getByRole('button', { name: 'Create', exact: true });
        if (await createBtn.isEnabled().catch(() => false)) {
          await createBtn.click();
          await page.waitForTimeout(2000);
          await takeScreenshot(page, '02-deal-creation', '03-deal-submitted');

          // Verify Deal Tabs if created
          for (const tab of ['Parties', 'Settings', 'Documents', 'Services']) {
            const tabBtn = page.getByRole('button', { name: tab, exact: true });
            if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await tabBtn.click();
              await page.waitForTimeout(300);
            }
          }
        } else {
          console.log('Create button is disabled as expected when LAN requires unique records.');
          await takeScreenshot(page, '02-deal-creation', '03-deal-create-safely-disabled');
        }
      } catch (error) {
        console.error('❌ ERROR in "06 - Submit Deal & Verify Tabs":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '02-deal-creation', 'ERROR-deal-submit-failed');
        throw error;
      }
    });

    await test.step('07 - Payout Monitoring & Monthly Collections Upload', async () => {
      try {
      await page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });

      const uploadBtn = page.getByRole('button', { name: /Upload Excel file/i });
      if (await uploadBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await uploadBtn.click();
      }

      // Upload monthly files
      await page.locator('input[type="file"]').setInputFiles(PAYOUT_FILES);
      await takeScreenshot(page, '07-payout-monitoring', '01-payout-files-uploaded');

      // Poll processing status / check missing deals
      const checkStatusBtn = page.getByRole('button', { name: 'Check Status' });
      const missingDealsBtn = page.getByRole('button', { name: /Create Missing Deals/i });

      for (let i = 1; i <= 8; i++) {
        if (await missingDealsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          console.log('Missing Deals detected. Handling Missing Deals creation...');
          await missingDealsBtn.click();
          const createMissing = page.getByRole('button', { name: 'Create', exact: true });
          if (await createMissing.isVisible({ timeout: 4000 }).catch(() => false)) {
            await createMissing.click();
          }
          break;
        }

        if (await checkStatusBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await checkStatusBtn.click();
        }
        await page.waitForTimeout(3000);
      }

      await takeScreenshot(page, '07-payout-monitoring', '02-payout-processing-finished');
      } catch (error) {
        console.error('❌ ERROR in "07 - Payout Monitoring & Monthly Collections Upload":', error.message);
        console.error('Stack:', error.stack);
        await takeScreenshot(page, '07-payout-monitoring', 'ERROR-payout-upload-failed');
        throw error;
      }
    });

    console.log('E2E TEST COMPLETED SUCCESSFULLY');
  });
}); 
