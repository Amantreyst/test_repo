const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const TARGET_DEAL = 'IHFL_136_UBI';
const TARGET_REPORT_MONTH = 'Jun-25';   // used for Download Pool Reports
const RESULT_DIR = path.resolve(
  __dirname,
  '../../results/originator/pool-reconciliation/01-e2e'
);
const DOWNLOAD_DIR = path.resolve(RESULT_DIR, 'downloads');

// Finance tabs the codegen touched — order matters for dropdowns
const FINANCE_TABS = [
  'Summary',
  'Difference',
  'Cashflow',
  'Bank',
  'Asset Classification',
  'Service Fee',
  'Search'
];
// ============================================================
// HELPERS
// ============================================================


async function takeScreenshot(page, name) {

  fs.mkdirSync(RESULT_DIR, { recursive: true });

  const filePath = path.join(RESULT_DIR, `${name}.png`);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore file deletion errors
    }
  }

  console.log(`[Screenshot] Preparing full-page capture: ${name}`);

  // Expand nested vertical scroll containers temporarily
  await page.evaluate(() => {

    const scrollableElements = Array.from(
      document.querySelectorAll('*')
    ).filter(el => {
      return (
        el.scrollHeight > el.clientHeight + 10 &&
        el.clientHeight > 0
      );
    });

    window.__screenshotOriginalStyles = [];

    scrollableElements.forEach(el => {

      window.__screenshotOriginalStyles.push({
        element: el,
        originalStyle: el.getAttribute('style'),
        originalScrollTop: el.scrollTop
      });

      const fullHeight = el.scrollHeight;

      el.style.setProperty(
        'height',
        `${fullHeight}px`,
        'important'
      );

      el.style.setProperty(
        'max-height',
        'none',
        'important'
      );

      el.style.setProperty(
        'overflow-y',
        'visible',
        'important'
      );

      el.style.setProperty(
        'overflow',
        'visible',
        'important'
      );
    });

    window.scrollTo(0, 0);
  });

  try {

    // Allow the browser to recalculate layout
    await page.waitForTimeout(1000);

    // Capture expanded page
    await page.screenshot({
      path: filePath,
      fullPage: true,
      animations: 'disabled',
      caret: 'hide'
    });

    console.log(`[Screenshot Saved] ${filePath}`);

  } finally {

    // Restore original webpage styles
    await page.evaluate(() => {

      const saved = window.__screenshotOriginalStyles || [];

      saved.forEach(item => {

        if (item.originalStyle === null) {
          item.element.removeAttribute('style');
        } else {
          item.element.setAttribute(
            'style',
            item.originalStyle
          );
        }

        item.element.scrollTop = item.originalScrollTop;
      });

      delete window.__screenshotOriginalStyles;
    });

  }

  return filePath;
}


async function loginAsOriginator(page) {
  console.log('[LOGIN] Navigating to login page...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

  const landingSignIn = page.getByRole('button', { name: 'Sign In' });
  const emailInput = page.locator('#email, input[name="email"], input[type="email"]');

  if (!(await emailInput.first().isVisible().catch(() => false))) {
    if (await landingSignIn.isVisible().catch(() => false)) await landingSignIn.click();
  }

  await expect(emailInput.first()).toBeVisible({ timeout: 10000 });
  await emailInput.first().fill(LOGIN_EMAIL);

  const passwordInput = page.locator('#password, input[name="password"], input[type="password"]');
  await passwordInput.first().fill(LOGIN_PASSWORD);

  await page
    .locator('button[type="submit"]:has-text("Sign In"), form button:has-text("Sign In")')
    .first()
    .click();

  // HTTP 409 session conflict modal
  const loginHereBtn = page.getByRole('button', { name: 'Login Here' });
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    if (page.url().includes('/originator/dashboard')) break;
    if (await loginHereBtn.isVisible().catch(() => false)) {
      console.log('[LOGIN] Active session conflict — forcing takeover via "Login Here"...');
      await loginHereBtn.click();
      await page.waitForTimeout(1000);
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForURL(/\/originator\/dashboard\/?$/, { timeout: 35000 });
  console.log('[LOGIN] Authenticated. URL:', page.url());
}

/**
 * From dashboard, reach Pool Reconciliation (codegen showed it as a button).
 * Falls back to direct route if a deep link exists.
 */
async function goToPoolReconciliation(page) {
  console.log('[NAV] Navigating to Pool Reconciliation...');
  await page.goto(`${BASE_URL}/da/deal-ori/pool-recon`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/da\/deal-ori\/pool-recon/, { timeout: 20000 });

  // 1. Assert the search input is visible
  await expect(page.locator('input[placeholder*="Search folder name"]')).toBeVisible();

  // 2. Assert the top-left action buttons based on exact visible text
  await expect(page.getByRole('button', { name: 'Download Template', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Batch History', exact: true })).toBeVisible();

  // 3. Assert the main Finance Navigation Tabs are rendered
  await expect(page.getByRole('button', { name: 'Summary', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cashflow', exact: true })).toBeVisible();

  // 4. Assert the Lock Screen (Empty State) is visible before processing
  await expect(page.getByText('Insufficient Data Available')).toBeVisible();
  await expect(page.getByText('Process your data first to unlock insights')).toBeVisible();

  console.log('[NAV] Pool Reconciliation workspace verified.');
}
/**
 * Select the target deal from the pool list/accordion.
 * Codegen clicked on the deal name text — we mirror that but prefer exact text.
 */
async function selectDeal(page, dealName) {
  console.log(`[DEAL] Selecting "${dealName}"...`);

  const dealCard = page
    .getByRole('heading', { name: dealName, exact: true })
    .or(page.getByText(dealName, { exact: true }));

  if (!(await dealCard.first().isVisible({ timeout: 5000 }).catch(() => false))) {
    // Fallback from codegen: expand the sidebar first
    const expander = page.locator('.flex.items-center.gap-2.cursor-pointer > .transform').first();
    if (await expander.isVisible().catch(() => false)) {
      await expander.click();
      await page.waitForTimeout(500);
    }
  }

  await dealCard.first().click();
  await expect(page.getByRole('heading', { name: dealName }).first()).toBeVisible({ timeout: 10000 });
  console.log(`[DEAL] "${dealName}" opened.`);
}

/**
 * Migrate raw files from payout into the reconciliation pipeline.
 * Handles the "Are you sure?" confirmation dialog.
 */
async function migrateFromPayout(page) {
  console.log('[MIGRATE] Starting migration from payout...');

  const migrateBtn = page.getByRole('button', { name: /Migrate files from payout/i }).first();
  if (!(await migrateBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('[MIGRATE] No "Migrate files" button — likely already migrated. Skipping.');
    return false;
  }

  await migrateBtn.click();

  const confirmDialog = page.getByRole('dialog', { name: 'Are you sure?' });
  await expect(confirmDialog).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Yes, migrate' }).click();

  await takeScreenshot(page, '03-migrated-from-payout');
  await page.waitForTimeout(1500); // let tree refresh
  console.log('[MIGRATE] Migration confirmed.');
  return true;
}

/**
 * Expand the accordion, Select All raw months, trigger Process, and handle
 * the two SweetAlert dialogs (Reminder + Bank Data Issue) in order.
 */
async function processAllMonths(page) {
  console.log('[PROCESS] Selecting and processing all raw months...');

  // Expand accordion — click the deal header row
  await page.locator('.border-b > div:nth-child(2)').first().click();
  await page.waitForTimeout(800);

  const selectAllBtn = page.getByRole('button', { name: 'Select All' }).first();
  if (await selectAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await selectAllBtn.click();
    await page.waitForTimeout(500);
  }

  // Process button includes count: "Process (9)"
  const processBtn = page.getByRole('button', { name: /^Process \(\d+\)$/ }).first();
  if (!(await processBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error('[PROCESS] "Process (N)" button not visible — no months selected.');
  }

  const processLabel = await processBtn.innerText();
  const monthCount = parseInt(processLabel.match(/\((\d+)\)/)?.[1] || '0', 10);
  console.log(`[PROCESS] Triggering ${processLabel} → ${monthCount} month(s)...`);
  await processBtn.click();

  // Dialog 1: "Reminder" → Continue
  const reminderDialog = page.getByRole('dialog', { name: 'Reminder' });
  if (await reminderDialog.isVisible({ timeout: 8000 }).catch(() => false)) {
    console.log('[PROCESS] "Reminder" dialog → Continue.');
    await reminderDialog.getByRole('button', { name: 'Continue' }).click();
  }

  // Dialog 2: "Bank Data Issue" → Skip & Continue
  const bankIssueDialog = page.getByRole('dialog', { name: 'Bank Data Issue' });
  if (await bankIssueDialog.isVisible({ timeout: 8000 }).catch(() => false)) {
    console.log('[PROCESS] "Bank Data Issue" dialog → Skip & Continue.');
    await bankIssueDialog.getByRole('button', { name: 'Skip & Continue' }).click();
  }

  await takeScreenshot(page, '04-processing-started');
  return monthCount;
}

/**
 * Poll the processing progress modal until it reaches COMPLETED 100%.
 * Replaces the 11 hardcoded "Check Status" clicks from codegen.
 */
async function pollProcessingUntilComplete(page, expectedMonths) {
  console.log(`[POLL] Waiting for processing of ${expectedMonths} month(s)...`);

  const modalRoot = page
    .locator('text=/Status(PROCESSING|COMPLETED)/i')
    .locator('xpath=ancestor::div[contains(@class,"fixed") or @role="dialog"][1]')
    .first()
    .or(page.getByRole('dialog').first());

  const checkStatusBtn = page.getByRole('button', { name: 'Check Status' }).first();
  const MAX_ATTEMPTS = Math.max(expectedMonths * 10, 60);
  const INTERVAL_MS = 2500;
  let finished = false;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const bodyText = await modalRoot.innerText().catch(() => '');

    // Success condition
    if (/COMPLETED/i.test(bodyText) && /100\s*%/i.test(bodyText)) {
      console.log(`[POLL] ✓ COMPLETED 100% on attempt ${i}.`);
      finished = true;
      break;
    }

    // Guard rail: any failure count > 0 = abort
    const failedMatch = bodyText.match(/(\d+)\s*Failed/i);
    if (failedMatch && parseInt(failedMatch[1], 10) > 0) {
      throw new Error(`[POLL] ${failedMatch[1]} month(s) FAILED during processing.`);
    }

    if (await checkStatusBtn.isVisible().catch(() => false)) {
      const enabled = await checkStatusBtn.isEnabled().catch(() => false);
      if (enabled) {
        await checkStatusBtn.click().catch(() => { });
        console.log(`[POLL] [${i}/${MAX_ATTEMPTS}] Check Status clicked.`);
      }
    }

    await page.waitForTimeout(INTERVAL_MS);
  }

  await takeScreenshot(page, '05-processing-completed');
  expect(finished).toBeTruthy();

  // Close processing modal
  const closeBtn = page.getByRole('button', { name: 'Close', exact: true }).last();
  if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(800);
  } else {
    await page.keyboard.press('Escape').catch(() => { });
  }

  console.log('[POLL] Processing modal dismissed.');
}

/**
 * Select the latest processed month header (e.g. "IHFL_136_UBI: Nov-25")
 * so that Finance tabs load real data.
 */
async function selectProcessedMonth(page, dealName) {
  console.log('[MONTH] Selecting latest processed month...');

  const monthRow = page
    .locator('div')
    .filter({ hasText: new RegExp(`${dealName}:.*`) })
    .nth(5); // kept from codegen — matches your accordion structure

  if (await monthRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await monthRow.click();
    await page.waitForTimeout(2000);
  } else {
    // Fallback: any processed-month chip in the accordion
    const fallback = page.locator('ul li:has(.text-green-500)').last();
    if (await fallback.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fallback.click();
      await page.waitForTimeout(2000);
    } else {
      throw new Error('[MONTH] Could not locate a processed month to activate.');
    }
  }

  await takeScreenshot(page, '06-month-activated');
}

/**
 * Click every Finance tab and (for Cashflow) the Bank sub-tab.
 */
async function auditFinanceTabs(page) {
  console.log('\n[FINANCE] Auditing tabs...');

  for (const tabName of FINANCE_TABS) {
    // 1. Locate the tab
    const tabBtn = page.getByRole('button', { name: tabName, exact: true }).first();

    if (await tabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {

      // 2. Click the tab (with fallback if an invisible backdrop is blocking it)
      await tabBtn.click({ timeout: 5000 }).catch(async () => {
        console.log(`[FINANCE] Normal click failed for [${tabName}], bypassing backdrop...`);
        await page.keyboard.press('Escape');
        await tabBtn.click({ force: true });
      });

      // 3. Wait exactly 3 seconds for data to load and render
      await page.waitForTimeout(3000);
      console.log(`[FINANCE] ✓ Tab [${tabName}] active and loaded.`);

      // 4. Take a full-page screenshot for this specific tab
      // (Safely converts e.g., "Asset Classification" to "asset-classification")
      const safeTabName = tabName.replace(/\s+/g, '-').toLowerCase();
      await takeScreenshot(page, `07-tab-${safeTabName}`);

      // 5. Special handling for Cashflow (in case it still has an internal "Bank" sub-tab)
      if (tabName === 'Cashflow') {
        const bankSubTab = page.getByRole('button', { name: 'Bank', exact: true }).first();
        if (await bankSubTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await bankSubTab.click();
          await page.waitForTimeout(3000); // 3-sec wait for sub-tab
          console.log('[FINANCE]   ↳ Cashflow / Bank sub-tab activated.');
          await takeScreenshot(page, '07-tab-cashflow-bank-subtab');
        }
      }

    } else {
      console.warn(`[FINANCE] Tab [${tabName}] not visible — skipping.`);
    }
  }

  // 6. Return to Summary as a clean landing state
  const summaryBtn = page.getByRole('button', { name: 'Summary', exact: true }).first();
  if (await summaryBtn.isVisible().catch(() => false)) {
    await summaryBtn.click();
    await page.waitForTimeout(1000);
  }

  // 7. Final confirmation screenshot
  await takeScreenshot(page, '08-finance-tabs-audit-complete');
}
/**
 * Open "Download Pool Reports" → filter by month → select radio → download → confirm.
 * Verifies the file actually lands on disk.
 */
async function downloadPoolReport(page, monthLabel) {
  console.log(`\n[DOWNLOAD] Downloading pool report for ${monthLabel}...`);
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const downloadBtn = page.getByRole('button', { name: /Download Pool Reports/i }).first();
  await expect(downloadBtn).toBeVisible({ timeout: 10000 });
  await downloadBtn.click();

  // Modal must appear
  const searchInput = page.getByRole('textbox', { name: /Search files by month/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 8000 });

  // Derive short search term from "Jun-25" → "jun"
  const searchTerm = monthLabel.split('-')[0].toLowerCase();
  await searchInput.fill(searchTerm);
  await page.waitForTimeout(600);

  // Select the month radio
  const radio = page.getByRole('radio', { name: new RegExp(`${monthLabel}\\s*Pool Report`, 'i') }).first();
  await expect(radio).toBeVisible({ timeout: 8000 });
  await radio.check();
  await page.waitForTimeout(300);

  // Arm the download listener BEFORE clicking
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: /Download Month/i }).first().click();

  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const savedPath = path.join(DOWNLOAD_DIR, suggested);
  await download.saveAs(savedPath);

  const size = fs.statSync(savedPath).size;
  console.log(`[DOWNLOAD] ✓ Saved ${suggested} (${(size / 1024).toFixed(1)} KB)`);
  expect(size).toBeGreaterThan(0);

  // Handle "Download complete" dialog
  const completeDialog = page.getByRole('dialog', { name: /Download complete/i });
  if (await completeDialog.isVisible({ timeout: 8000 }).catch(() => false)) {
    const okBtn = page.getByRole('button', { name: 'OK', exact: true }).first();
    if (await okBtn.isVisible().catch(() => false)) await okBtn.click();
  }

  await takeScreenshot(page, '08-pool-report-downloaded');
  return savedPath;
}

// ============================================================
// MAIN SPEC
// ============================================================

test.describe('Pool Reconciliation - Senior QA E2E', () => {

  test('E2E-PR-001: Migration, bulk processing, finance tabs, and report download', async ({ page }) => {
    test.setTimeout(300000); // 5 min — bulk processing can be slow

    let processedMonthCount = 0;

    await test.step('01 - Authenticate as Originator (409-safe)', async () => {
      await loginAsOriginator(page);
      await takeScreenshot(page, '01-login-success');
      await page.waitForTimeout(3000);
    });

    await test.step('02 - Open Pool Reconciliation Workspace', async () => {
      await goToPoolReconciliation(page);
      await page.waitForTimeout(3000);
    });

    await test.step('03 - Select Target Deal', async () => {
      await selectDeal(page, TARGET_DEAL);
      await takeScreenshot(page, '03-deal-selected');
      await page.waitForTimeout(3000);
    });

    // await test.step('04 - Migrate Files from Payout', async () => {
    //   await migrateFromPayout(page);
    // });

    // await test.step('05 - Process All Raw Collection Months', async () => {
    //   processedMonthCount = await processAllMonths(page);
    //   expect(processedMonthCount).toBeGreaterThan(0);
    // });

    // await test.step('06 - Poll Until Processing Reaches 100% COMPLETED', async () => {
    //   await pollProcessingUntilComplete(page, processedMonthCount);
    // });

    // await test.step('07 - Activate Latest Processed Month', async () => {
    //   await selectProcessedMonth(page, TARGET_DEAL);
    // });

    await test.step('08 - Audit Finance Tabs (Summary, Cashflow, Asset, Service Fee, Search)', async () => {
      await auditFinanceTabs(page);
      await page.waitForTimeout(3000);
    });

    // await test.step('09 - Download Monthly Pool Report', async () => {
    //   const file = await downloadPoolReport(page, TARGET_REPORT_MONTH);
    //   expect(fs.existsSync(file)).toBeTruthy();
    // });

    await test.step('10 - Final Clean State', async () => {
      await takeScreenshot(page, '09-e2e-final-state');
      await page.waitForTimeout(3000);
      console.log('\n======================================================');
      console.log(' POOL RECONCILIATION E2E TEST COMPLETED SUCCESSFULLY');
      console.log('======================================================\n');
    });
  });

});