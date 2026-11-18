const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURATION & TEST FIXTURES
// ============================================================

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');
const RESULT_DIR = path.resolve(__dirname, '../../results/originator/payout-monitoring/05-e2e');

// Monthly collection files for E2E processing
const PAYOUT_FILES = [
  path.join(TEST_DATA_DIR, 'May-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Jun-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Jul-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Aug-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Sep-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Oct-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Nov-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Dec-25.xlsx'),
  path.join(TEST_DATA_DIR, 'Jan-26.xlsx'),
  path.join(TEST_DATA_DIR, 'Feb-26.xlsx'),
  path.join(TEST_DATA_DIR, 'Mar-26.xlsx'),
  path.join(TEST_DATA_DIR, 'IIFL_136_UBI-Apr-25.xlsx'),
];

// Finance Page tabs to audit and assert
const FINANCE_TABS = [
  'Summary',
  'Cashflow',
  'Asset Classification',
  'Asset Account',
  'Service Fee',
  'Search',
  'Remittance Details',
  'Asset Forecasting',
];

// ============================================================
// SELF-CONTAINED REUSABLE HELPERS (ZERO DEPENDENCIES)
// ============================================================

/**
 * Capture screenshot replacing any previous capture (idempotent, clean).
 */
async function takeScreenshot(page, name) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const filePath = path.join(RESULT_DIR, `${name}.png`);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore transient file lock
    }
  }

  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Screenshot Replaced] 05-e2e/${name}.png`);
  return filePath;
}

/**
 * Login as Originator with robust 409 session conflict polling.
 */
async function loginAsOriginator(page) {
  console.log('[LOGIN] Navigating to login page...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

  // Handle landing view button if present
  const landingSignIn = page.getByRole('button', { name: 'Sign In' });
  const emailInput = page.locator('#email, input[name="email"], input[type="email"]');

  if (!(await emailInput.first().isVisible().catch(() => false))) {
    if (await landingSignIn.isVisible().catch(() => false)) {
      await landingSignIn.click();
    }
  }

  await expect(emailInput.first()).toBeVisible({ timeout: 10000 });
  await emailInput.first().fill(LOGIN_EMAIL);

  const passwordInput = page.locator('#password, input[name="password"], input[type="password"]');
  await passwordInput.first().fill(LOGIN_PASSWORD);

  await page
    .locator('button[type="submit"]:has-text("Sign In"), form button:has-text("Sign In")')
    .first()
    .click();

  // Handle HTTP 409 session conflict modal ("Login Here")
  const loginHereBtn = page.getByRole('button', { name: 'Login Here' });
  const startTime = Date.now();

  while (Date.now() - startTime < 15000) {
    if (page.url().includes('/originator/dashboard')) break;
    if (await loginHereBtn.isVisible().catch(() => false)) {
      console.log('[LOGIN] Active session conflict detected. Forcing takeover via "Login Here"...');
      await loginHereBtn.click();
      await page.waitForTimeout(1000);
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForURL(/\/originator\/dashboard\/?$/, { timeout: 35000 });
  console.log('[LOGIN] Authenticated successfully. Current URL:', page.url());
}

/**
 * Navigate to Payout Monitoring workspace and verify critical elements.
 */
async function goToPayoutMonitoring(page) {
  console.log('[NAV] Navigating to Payout Monitoring...');
  await page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });

  // Assert essential workspace elements
  await expect(page.locator('input[placeholder*="Search folder name"]')).toBeVisible();
  await expect(page.locator('button[title*="Download Template"], .template-excel')).toBeVisible();
  await expect(page.locator('button[title*="View Batches History"], .batch-history')).toBeVisible();
  console.log('[NAV] Payout Monitoring workspace verified.');
}

/**
 * Filter and return existing files from disk with clear logging.
 */
function getExistingPayoutFiles(files) {
  const existing = files.filter((f) => fs.existsSync(f));
  const missing = files.filter((f) => !fs.existsSync(f));

  if (missing.length > 0) {
    console.warn(`[FILES] Notice: ${missing.length} test files not found on disk (skipped).`);
  }

  if (existing.length === 0) {
    throw new Error('[FILES] Fatal: No valid Excel files found in UBI-136 folder.');
  }

  console.log(`[FILES] Verified ${existing.length} payout files ready for upload.`);
  return existing;
}

/**
 * Upload multiple collection files via hidden file input.
 */
async function uploadPayoutFiles(page, files) {
  console.log(`[UPLOAD] Queuing ${files.length} monthly collection files...`);

  const fileInput = page.locator('input[type="file"][accept*=".xlsx"], input[type="file"][accept*=".xls"]');
  await expect(fileInput.first()).toBeAttached({ timeout: 10000 });

  await fileInput.first().setInputFiles(files);
  console.log('[UPLOAD] Files dispatched to file input.');
}

/**
 * Poll bulk upload progress modal until all files complete, handle missing deals and dismiss modal.
 */
async function pollAndCompleteBulkUpload(page, totalFiles) {
  console.log(`[POLL] Monitoring bulk upload modal for ${totalFiles} file(s)...`);

  const modalHeader = page.getByRole('heading', { name: 'Upload Progress' });
  await expect(modalHeader).toBeVisible({ timeout: 15000 });

  const checkStatusBtn = page.getByRole('button', { name: 'Check Status' });
  const missingDealsBtn = page.getByRole('button', { name: /Create Missing Deals/i });
  const completedBadge = page.locator('text=COMPLETED').first();
  const modalCloseBtn = page.locator('.fixed.inset-0 button:has-text("Close"), .fixed.inset-0 button[title="Close"]').first();

  // Dynamic poll limit: at least 60 cycles (~150 seconds)
  const MAX_POLL_ATTEMPTS = Math.max(totalFiles * 8, 60);
  const POLL_INTERVAL_MS = 2500;

  let isUploadFinished = false;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    // 1. Check for Missing Deals trigger
    if (await missingDealsBtn.isVisible().catch(() => false)) {
      console.log('[POLL] "Create Missing Deals" button detected. Opening missing deals modal...');
      await takeScreenshot(page, '03-missing-deals-detected');
      await missingDealsBtn.click();

      // In missing deals modal, check if create button is visible
      const createDealBtn = page.getByRole('button', { name: 'Create', exact: true }).first();
      if (await createDealBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createDealBtn.click();
        console.log('[POLL] Selected missing deal create triggered.');
        await takeScreenshot(page, '03-missing-deal-create-opened');
      }

      const closeMissingDealsBtn = page.getByRole('button', { name: 'Close', exact: true }).first();
      if (await closeMissingDealsBtn.isVisible().catch(() => false)) {
        await closeMissingDealsBtn.click();
      }
    }

    // 2. Check if all files completed
    const isCompletedVisible = await completedBadge.isVisible().catch(() => false);
    const progressText = await page.locator('.fixed.inset-0').innerText().catch(() => '');

    if (isCompletedVisible || /100%/i.test(progressText) || /All\s+\d+\s+file\(s\)\s+finished/i.test(progressText)) {
      console.log(`[POLL] Bulk upload reached 100% completion on attempt ${attempt}.`);
      isUploadFinished = true;
      break;
    }

    // 3. Click Check Status if enabled
    if (await checkStatusBtn.isVisible().catch(() => false)) {
      const isEnabled = await checkStatusBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await checkStatusBtn.click();
        console.log(`[POLL] [${attempt}/${MAX_POLL_ATTEMPTS}] Clicked "Check Status"...`);
      }
    }

    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  await takeScreenshot(page, '04-bulk-upload-finished-state');

  // Dismiss Bulk Upload Modal so UI is completely unblocked
  if (await modalCloseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('[POLL] Dismissing Bulk Upload modal...');
    await modalCloseBtn.click();
    await page.waitForTimeout(1000);
  } else {
    // Fallback backdrop click or escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Ensure modal backdrop is removed
  await expect(modalHeader).toBeHidden({ timeout: 10000 });
  console.log('[POLL] Bulk Upload modal successfully dismissed.');

  return isUploadFinished;
}

/**
 * Open deal accordion, process raw collection months, and handle ROI confirmation dialogs.
 */
// async function processDealCollectionMonths(page, targetDealName) {
//   console.log(`\n[PROCESS] Auditing accordion and processing months for deal: ${targetDealName || 'Auto-Detect'}...`);

//   // Locate deal row in sidebar
//   const dealLocator = targetDealName
//     ? page.locator('.accordion h3', { hasText: targetDealName }).first()
//     : page.locator('.accordion h3').first();

//   await expect(dealLocator).toBeVisible({ timeout: 15000 });
//   const resolvedDealName = (await dealLocator.innerText()).trim();
//   console.log(`[PROCESS] Target deal found: "${resolvedDealName}"`);

//   // Click deal row to expand accordion if not already open
//   const parentAccordion = dealLocator.locator('xpath=ancestor::div[contains(@class, "border-b")][1]');
//   const chevron = parentAccordion.locator('svg').first();
//   const isExpanded = await chevron.evaluate((el) => el.classList.contains('rotate-90')).catch(() => false);

//   if (!isExpanded) {
//     console.log('[PROCESS] Expanding deal accordion...');
//     await dealLocator.click();
//     await page.waitForTimeout(1500);
//   }

//   await takeScreenshot(page, '05-deal-accordion-expanded');

//   // Check for unprocessed raw months
//   const selectAllBtn = parentAccordion.locator('button.select-all-file, button:has-text("Select All"), button:has-text("Deselect All")').first();
//   const processBtn = parentAccordion.locator('button.process-all-the-files, button:has-text("Process")').first();

//   if (await selectAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
//     const btnText = (await selectAllBtn.innerText()).trim();
//     if (btnText.includes('Select All')) {
//       console.log('[PROCESS] Clicking "Select All" raw months...');
//       await selectAllBtn.click();
//       await page.waitForTimeout(500);
//     }

//     if (await processBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
//       const isEnabled = await processBtn.isEnabled().catch(() => false);
//       if (isEnabled) {
//         console.log('[PROCESS] Triggering monthly collection processing...');
//         await processBtn.click();

//         // Handle SweetAlert2 validation reminder ("Reminder" or "Missing ROI Data")
//         const swalModal = page.locator('.swal2-popup');
//         if (await swalModal.isVisible({ timeout: 6000 }).catch(() => false)) {
//           console.log('[PROCESS] SweetAlert2 ROI validation prompt displayed.');
//           await takeScreenshot(page, '05-swal-roi-reminder');

//           // Prefer "Continue" or "Skip & Continue"
//           const confirmBtn = swalModal.locator('button.swal2-confirm');
//           if (await confirmBtn.isVisible()) {
//             await confirmBtn.click();
//             console.log('[PROCESS] Confirmed processing in SweetAlert2 modal.');
//           }
//         }

//         // Handle Processing Progress Modal if displayed
//         const processingModal = page.locator('text=Processing Job, h3:has-text("Processing")').first();
//         if (await processingModal.isVisible({ timeout: 10000 }).catch(() => false)) {
//           console.log('[PROCESS] Waiting for Processing Progress Modal to complete...');
//           await page.waitForTimeout(5000);
//           const closeProcessingBtn = page.locator('.fixed.inset-0 button:has-text("Close")').first();
//           if (await closeProcessingBtn.isVisible({ timeout: 25000 }).catch(() => false)) {
//             await closeProcessingBtn.click();
//           }
//         }
//       }
//     }
//   } else {
//     console.log('[PROCESS] Raw months already processed or none pending. Proceeding to processed months audit.');
//   }

//   // Click the latest processed month to load its data into FinancePage
//   const processedMonthItems = parentAccordion.locator('ul li:has(.text-green-500)');
//   const processedCount = await processedMonthItems.count();

//   if (processedCount > 0) {
//     console.log(`[PROCESS] Found ${processedCount} processed month(s). Activating latest month...`);
//     await processedMonthItems.last().click();
//     await page.waitForTimeout(2000);
//   }

//   await takeScreenshot(page, '05-deal-months-active');
//   return resolvedDealName;
// }


async function processDealCollectionMonths(page, targetDealName) {

  console.log(`\n[PROCESS] Processing deal: ${targetDealName || 'Auto-Detect'}...`);

  // STEP 1: Locate deal
  const dealLocator = targetDealName
    ? page.locator('.accordion h3', { hasText: targetDealName }).first()
    : page.locator('.accordion h3').first();

  await expect(dealLocator).toBeVisible({ timeout: 15000 });

  const resolvedDealName = (await dealLocator.innerText()).trim();

  console.log(`[PROCESS] Deal found: ${resolvedDealName}`);

  // STEP 2: Expand accordion
  const parentAccordion = dealLocator.locator(
    'xpath=ancestor::div[contains(@class, "border-b")][1]'
  );

  const chevron = parentAccordion.locator('svg').first();

  const isExpanded = await chevron.evaluate(
    el => el.classList.contains('rotate-90')
  ).catch(() => false);

  if (!isExpanded) {
    await dealLocator.click();
    await page.waitForTimeout(1000);
  }

  await takeScreenshot(page, '05-deal-accordion-expanded');

  // STEP 3: Select raw months
  const selectAllBtn = parentAccordion.locator(
    'button.select-all-file, button:has-text("Select All"), button:has-text("Deselect All")'
  ).first();

  const processBtn = parentAccordion.locator(
    'button.process-all-the-files, button:has-text("Process")'
  ).first();

  if (await selectAllBtn.isVisible().catch(() => false)) {

    const btnText = (await selectAllBtn.innerText()).trim();

    if (/^Select All/i.test(btnText)) {

      console.log('[PROCESS] Selecting all raw months...');

      await selectAllBtn.click();

      await page.waitForTimeout(500);
    }

    // STEP 4: Trigger processing
    await expect(processBtn).toBeVisible({ timeout: 10000 });
    await expect(processBtn).toBeEnabled({ timeout: 10000 });

    console.log('[PROCESS] Starting collection processing...');

    await processBtn.click();

    // STEP 5: Handle Reminder dialog
    const reminderDialog = page.getByRole('dialog', {
      name: 'Reminder'
    });

    if (await reminderDialog.isVisible({ timeout: 10000 }).catch(() => false)) {

      console.log('[PROCESS] ROI Reminder detected.');

      await takeScreenshot(page, '05-swal-roi-reminder');

      const continueBtn = reminderDialog.getByRole('button', {
        name: 'Continue',
        exact: true
      });

      await expect(continueBtn).toBeVisible();

      await continueBtn.click();

      console.log('[PROCESS] Reminder confirmed. Processing continues.');
    }

    // STEP 6: Wait for processing status
    const checkStatusBtn = page.getByRole('button', {
      name: 'Check Status',
      exact: true
    });

    await expect(checkStatusBtn).toBeVisible({
      timeout: 60000
    });

    console.log('[PROCESS] Processing status interface detected.');

    await takeScreenshot(page, '05-processing-started');

    // STEP 7: Poll processing status
    const MAX_ATTEMPTS = 36;
    const POLL_INTERVAL = 5000;

    let processingCompleted = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

      console.log(`[PROCESS] Status check ${attempt}/${MAX_ATTEMPTS}`);

      if (await checkStatusBtn.isVisible().catch(() => false)) {

        if (await checkStatusBtn.isEnabled().catch(() => false)) {
          await checkStatusBtn.click();
        }
      }

      await page.waitForTimeout(POLL_INTERVAL);

      // Read visible processing interface text
      const processingText = await page.locator('body').innerText()
        .catch(() => '');

      console.log(
        `[PROCESS] Current status: ${processingText.match(/.{0,30}(completed|processing|success|failed|finished).{0,50}/i)?.[0]
        || 'Status not identified'
        }`
      );

      // Explicit completion indicators
      const isCompleted =
        /\bCOMPLETED\b/i.test(processingText) ||
        /\bPROCESSING COMPLETED\b/i.test(processingText) ||
        /\bALL FILES PROCESSED\b/i.test(processingText) ||
        /\b100%\s*(COMPLETED|COMPLETE)?\b/i.test(processingText);

      if (isCompleted) {

        processingCompleted = true;

        console.log('[PROCESS] Completion indicator detected.');

        break;
      }

      // Detect processing failure
      if (/\bPROCESSING FAILED\b|\bJOB FAILED\b/i.test(processingText)) {

        await takeScreenshot(page, '05-processing-failed');

        throw new Error('[PROCESS] Collection processing failed.');
      }
    }

    // STEP 8: Only close after verified completion
    if (!processingCompleted) {

      console.error('[PROCESS] Processing timeout reached.');

      await takeScreenshot(page, '05-processing-timeout');

      throw new Error(
        '[PROCESS] Processing not confirmed complete within 180 seconds. Dialog left open.'
      );
    }

    await takeScreenshot(page, '05-processing-completed');

    // Locate the Close button only after successful completion
    const closeProcessingBtn = page.getByRole('button', {
      name: 'Close',
      exact: true
    }).last();

    await expect(closeProcessingBtn).toBeVisible({
      timeout: 10000
    });

    await closeProcessingBtn.click();

    console.log('[PROCESS] Completed processing dialog closed.');

  } else {

    console.log(
      '[PROCESS] No Select All button. Checking existing processed months.'
    );
  }

  // STEP 9: Activate latest processed month
  const processedMonthItems = parentAccordion.locator(
    'ul li:has(.text-green-500)'
  );

  const processedCount = await processedMonthItems.count();

  if (processedCount > 0) {

    console.log(
      `[PROCESS] Found ${processedCount} processed months.`
    );

    await processedMonthItems.last().click();

    await page.waitForTimeout(2000);

  } else {

    throw new Error('[PROCESS] No processed months found.');
  }

  await takeScreenshot(page, '05-deal-months-active');

  return resolvedDealName;
}


/**
 * Verify Finance Page live metrics and explore all functional tabs.
 */
// async function auditFinancePageTabs(page) {
//   console.log('\n[FINANCE] Auditing Finance Page tabs and live metrics...');

//   // Verify that the empty state / lock screen is replaced by live data
//   const lockScreen = page.locator('text="Insufficient Data Available"');
//   const hasLockScreen = await lockScreen.isVisible().catch(() => false);

//   if (hasLockScreen) {
//     console.warn('[FINANCE] Notice: Finance page still displays Insufficient Data lock screen.');
//     await takeScreenshot(page, '06-finance-lock-screen');
//     return;
//   }

//   // Verify Deal Name Header
//   const headerLocator = page.locator('.deal-name-header, h2:has-text(":")').first();
//   await expect(headerLocator).toBeVisible({ timeout: 10000 });
//   const headerTitle = await headerLocator.innerText();
//   console.log(`[FINANCE] Active Deal Header: "${headerTitle.trim()}"`);

//   // Iterate and verify each Finance tab
//   for (const tabName of FINANCE_TABS) {
//     const tabBtn = page.getByRole('button', { name: tabName, exact: true })
//       .or(page.getByRole('tab', { name: tabName, exact: true }))
//       .or(page.locator(`button:has-text("${tabName}")`));

//     if (await tabBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
//       // Use force click if needed to prevent backdrop blockage
//       await tabBtn.first().click({ timeout: 5000 }).catch(async () => {
//         // If an unexpected popup appeared, dismiss it
//         await page.keyboard.press('Escape');
//         await tabBtn.first().click({ force: true });
//       });

//       await page.waitForTimeout(600);
//       console.log(`[FINANCE] Verified Tab: [${tabName}] -> Active`);

//       // Special handling: Remittance Details tab auto-opens RemittanceForm modal if bank details are unset
//       if (tabName === 'Remittance Details') {
//         const remittanceCancelBtn = page.locator('.fixed.inset-0 button:has-text("Cancel")').first();
//         if (await remittanceCancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
//           console.log('[FINANCE] Auto-dismissing RemittanceForm modal to restore tab access...');
//           await remittanceCancelBtn.click();
//           await page.waitForTimeout(500);
//         }
//       }
//     } else {
//       console.log(`[FINANCE] Tab [${tabName}] not applicable for current deal structure.`);
//     }
//   }

//   await takeScreenshot(page, '06-finance-tabs-verified');

//   // Verify Summary PDF Generation button
//   const pdfBtn = page.locator('.download-summary-pdf, button[title*="Summary PDF"]').first();
//   if (await pdfBtn.isVisible().catch(() => false)) {
//     const isPdfEnabled = await pdfBtn.isEnabled().catch(() => false);
//     if (isPdfEnabled) {
//       console.log('[FINANCE] Triggering client-side Summary PDF generation...');
//       await pdfBtn.click();

//       // Wait for SweetAlert2 success prompt with generated password
//       const swalSuccess = page.locator('.swal2-popup:has-text("Download Successful")');
//       if (await swalSuccess.isVisible({ timeout: 10000 }).catch(() => false)) {
//         console.log('[FINANCE] Summary PDF generated and password alert displayed successfully.');
//         await takeScreenshot(page, '07-pdf-generation-success');
//         const gotItBtn = swalSuccess.locator('button.swal2-confirm');
//         if (await gotItBtn.isVisible()) {
//           await gotItBtn.click();
//         }
//       }
//     }
//   }
// }



// ============================================================
// MAIN PLAYWRIGHT TEST SPECIFICATION
// ============================================================



async function auditFinancePageTabs(page) {

  console.log('\n[FINANCE] Starting complete Finance tab audit...');

  const auditResults = [];

  // STEP 1: Check Finance page lock screen
  const lockScreen = page.getByText('Insufficient Data Available', {
    exact: true
  });

  if (await lockScreen.isVisible().catch(() => false)) {

    console.warn('[FINANCE] Finance page is locked.');

    await takeScreenshot(page, '06-finance-lock-screen');

    throw new Error('[FINANCE] Cannot audit tabs because Finance page is locked.');
  }

  // STEP 2: Verify Deal Header
  const headerLocator = page.locator(
    '.deal-name-header, h2:has-text(":")'
  ).first();

  await expect(headerLocator).toBeVisible({ timeout: 15000 });

  console.log(
    `[FINANCE] Active Deal: ${(await headerLocator.innerText()).trim()}`
  );

  // STEP 3: Audit individual tabs
  for (const tabName of FINANCE_TABS) {

    console.log(`\n[FINANCE] Auditing: ${tabName}`);

    const screenshotName = `06-finance-${tabName
      .toLowerCase()
      .replace(/\s+/g, '-')}`;

    try {

      // Find tab
      const tabBtn = page.getByRole('button', {
        name: tabName,
        exact: true
      }).or(
        page.getByRole('tab', {
          name: tabName,
          exact: true
        })
      ).first();

      await expect(tabBtn).toBeVisible({
        timeout: 10000
      });

      // Click tab
      await tabBtn.click();

      console.log(`[FINANCE] ${tabName} clicked.`);

      // Wait for loading to settle
      await page.waitForTimeout(2000);

      // Special handling: Remittance Details
      if (tabName === 'Remittance Details') {

        const remittanceCancelBtn = page.locator(
          '.fixed.inset-0 button:has-text("Cancel")'
        ).first();

        if (await remittanceCancelBtn.isVisible().catch(() => false)) {

          console.log('[FINANCE] Remittance form detected.');

          await takeScreenshot(
            page,
            '06-finance-remittance-form'
          );

          await remittanceCancelBtn.click();

          await page.waitForTimeout(1000);

          console.log('[FINANCE] Remittance form dismissed.');
        }
      }

      // Wait until page is interactive
      await expect(
        page.locator('body')
      ).toBeVisible();

      // Capture each individual tab
      await takeScreenshot(page, screenshotName);

      auditResults.push({
        tab: tabName,
        status: 'PASS',
        screenshot: `${screenshotName}.png`
      });

      console.log(`[FINANCE] ${tabName} screenshot completed.`);

    } catch (error) {

      console.error(
        `[FINANCE] ${tabName} audit failed: ${error.message}`
      );

      await takeScreenshot(
        page,
        `${screenshotName}-error`
      ).catch(() => { });

      auditResults.push({
        tab: tabName,
        status: 'FAIL',
        error: error.message
      });

      // Continue with next tab
    }
  }

  // STEP 4: Final audit report
  console.log('\n========== FINANCE AUDIT REPORT ==========');

  for (const result of auditResults) {

    console.log(
      `${result.status} | ${result.tab} | ${result.screenshot || result.error
      }`
    );
  }

  const passed = auditResults.filter(
    item => item.status === 'PASS'
  ).length;

  const failed = auditResults.filter(
    item => item.status === 'FAIL'
  ).length;

  console.log('==========================================');
  console.log(`TOTAL TABS : ${auditResults.length}`);
  console.log(`PASSED     : ${passed}`);
  console.log(`FAILED     : ${failed}`);
  console.log('==========================================');

  await takeScreenshot(page, '06-finance-tabs-final-state');

  // STEP 5: PDF generation
  const pdfBtn = page.locator(
    '.download-summary-pdf, button[title*="Summary PDF"]'
  ).first();

  if (await pdfBtn.isVisible().catch(() => false)) {

    if (await pdfBtn.isEnabled().catch(() => false)) {

      console.log('[FINANCE] Generating Summary PDF...');

      await pdfBtn.click();

      const swalSuccess = page.locator(
        '.swal2-popup:has-text("Download Successful")'
      );

      if (await swalSuccess.isVisible({ timeout: 10000 }).catch(() => false)) {

        await takeScreenshot(page, '07-pdf-generation-success');

        const gotItBtn = swalSuccess.locator(
          'button.swal2-confirm'
        );

        if (await gotItBtn.isVisible()) {
          await gotItBtn.click();
        }
      }
    }
  }

  // Fail the audit if any tab failed
  expect(
    failed,
    `${failed} Finance tab(s) failed. Check screenshots and logs.`
  ).toBe(0);

  console.log('[FINANCE] Complete Finance audit passed.');
}


//------------------------------------------------------------------------------------

test.describe('Payout Monitoring - Senior QA Full E2E Workflow', () => {

  test('E2E-PM-001: Bulk collection upload, status polling, monthly processing, and finance tabs verification', async ({ page }) => {
    // 1. DYNAMIC TIMEOUT: User jitni files dega, uske hisaab se timeout badhega.
    // Har file ke liye roughly 30 seconds (upload + processing) ka time lagta hai.
    const fileCount = PAYOUT_FILES.length;
    const dynamicTimeout = Math.max(300000, fileCount * 40000); // Minimum 5 mins, warna 40s per file
    test.setTimeout(dynamicTimeout);

    let validFiles = [];
    let activeDealName = '';

    // ── STEP 1: Verify Test Data Files ────────────────────────
    await test.step('01 - Verify Test Data Files on Disk', async () => {
      validFiles = getExistingPayoutFiles(PAYOUT_FILES);
      expect(validFiles.length).toBeGreaterThan(0);
      console.log(`[SYSTEM] Total valid files found to process: ${validFiles.length}`);
    });

    // ── STEP 2: Originator Authentication ─────────────────────
    await test.step('02 - Authenticate as Originator with 409 Resolution', async () => {
      await loginAsOriginator(page);
      await takeScreenshot(page, '01-originator-login-success');
    });

    // ── STEP 3: Navigate to Payout Monitoring Workspace ───────
    await test.step('03 - Navigate & Verify Payout Monitoring Workspace', async () => {
      await goToPayoutMonitoring(page);
      await takeScreenshot(page, '02-payout-monitoring-workspace');
    });


    // ── STEP 4: Bulk Upload Monthly Collection Files ──────────
    await test.step('04 - Queue Monthly Collection Files for Upload', async () => {
      // 👇 Yahan se .slice(0, 4) hata diya. Ab jitni bhi valid files hain, sab jayengi.
      await uploadPayoutFiles(page, validFiles);
      await takeScreenshot(page, '03-monthly-files-queued');
    });

    // ── STEP 5: Poll Status & Dismiss Bulk Upload Modal ────────
    await test.step('05 - Poll Progress, Handle Missing Deals & Dismiss Modal', async () => {
      // 👇 Hardcoded '4' ki jagah validFiles.length pass kiya
      const uploadFinished = await pollAndCompleteBulkUpload(page, validFiles.length);
      expect(uploadFinished).toBeTruthy();
    });

    // STEP 6
    await test.step('06 - Expand Deal Accordion & Process Collection Months', async () => {
      activeDealName = await processDealCollectionMonths(page, null);
      expect(activeDealName).toBeTruthy();
    });

    // STEP 7
    await test.step('07 - Verify Finance Page Live Metrics, Tabs & Reports', async () => {
      await auditFinancePageTabs(page);
      await page.waitForTimeout(3000);
    });

    // ── STEP 8: Final Enterprise State Verification ───────────
    await test.step('08 - Verify Final Clean State', async () => {
      await takeScreenshot(page, '08-e2e-final-state');
      console.log('\n======================================================');
      console.log(' PAYOUT MONITORING E2E TEST COMPLETED SUCCESSFULLY');
      console.log('======================================================\n');
    });

  });
});
