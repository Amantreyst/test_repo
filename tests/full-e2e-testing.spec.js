const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ======================================================
// 1. CONFIGURATION & CONSTANTS
// ======================================================
const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const CREATION_DEAL_NAME = 'UBI-136';
const RECON_DEAL_NAME = 'IHFL_136_UBI';

const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');
const RESULT_DIR = path.resolve(__dirname, '../UBI/result-136 Master-e2e');
fs.mkdirSync(RESULT_DIR, { recursive: true });

const LAN_FILE = path.join(TEST_DATA_DIR, 'LAN_INFO UBI 136.xlsx');
const PAYOUT_FILES = [
    path.join(TEST_DATA_DIR, 'Aug-25.xlsx'),
    path.join(TEST_DATA_DIR, 'Dec-25.xlsx'),
    path.join(TEST_DATA_DIR, 'Feb-26.xlsx'),
    path.join(TEST_DATA_DIR, 'IIFL_136_UBI-Apr-25.xlsx'),
];

const PAYOUT_TABS = ['Summary', 'Cashflow', 'Asset Classification', 'Asset Account', 'Service Fee', 'Search', 'Remittance Details', 'Asset Forecasting'];
const RECON_TABS = ['Summary', 'Difference', 'Cashflow', 'Bank', 'Asset Classification', 'Service Fee', 'Search'];

// ======================================================
// 2. CORE HELPERS
// ======================================================

async function takeScreenshot(page, name) {
    const filePath = path.join(RESULT_DIR, `${name}.png`);
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { }
    }
    await page.evaluate(() => {
        const scrollableElements = Array.from(document.querySelectorAll('*')).filter(el => el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 0);
        window.__screenshotOriginalStyles = [];
        scrollableElements.forEach(el => {
            window.__screenshotOriginalStyles.push({ element: el, originalStyle: el.getAttribute('style'), originalScrollTop: el.scrollTop });
            el.style.setProperty('height', `${el.scrollHeight}px`, 'important');
            el.style.setProperty('max-height', 'none', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: filePath, fullPage: true, animations: 'disabled' });
    await page.evaluate(() => {
        (window.__screenshotOriginalStyles || []).forEach(item => {
            if (item.originalStyle === null) item.element.removeAttribute('style');
            else item.element.setAttribute('style', item.originalStyle);
            item.element.scrollTop = item.originalScrollTop;
        });
        delete window.__screenshotOriginalStyles;
    });
    console.log(`[Screenshot] Saved: ${name}.png`);
}

async function loginAsOriginator(page) {
    console.log('[LOGIN] Authenticating...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    const landingSignIn = page.getByRole('button', { name: 'Sign In' });
    const emailInput = page.locator('#email, input[name="email"]');

    if (!(await emailInput.first().isVisible().catch(() => false))) {
        if (await landingSignIn.isVisible().catch(() => false)) await landingSignIn.click();
    }
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });
    await emailInput.first().fill(LOGIN_EMAIL);
    await page.locator('input[type="password"]').first().fill(LOGIN_PASSWORD);
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
    console.log('[LOGIN] Success.');
}

// ======================================================
// 3. DEAL CREATION MODULAR FUNCTIONS (From File 1)
// ======================================================
async function createAndVerifyDeal(page) {
    console.log('--- [DEAL CREATION] Starting Full Deal Creation & Verification ---');

    // ==========================================
    // PHASE 1: Basic Deal Details
    // ==========================================
    console.log('[CREATE] 1/5 Filling basic deal details...');
    const tempDealInput = page.locator('#react-select-2-input');
    await tempDealInput.fill('test');

    const dealNameInput = page.locator('input[name="dealName"]');
    await dealNameInput.fill(DEAL_NAME); // Ensure DEAL_NAME is defined globally
    await dealNameInput.press('Enter');

    const poolValueInput = page.locator('input[name="originalPoolValue"]');
    await poolValueInput.fill('20000000');
    await poolValueInput.press('Tab');

    const investorInput = page.locator('#react-select-3-input');
    await investorInput.fill('test_invest');
    await page.getByRole('option', { name: 'test_invest first' }).click();

    await takeScreenshot(page, '02-deal-basic-details');
    console.log('✅ Basic deal information entered.');

    // ==========================================
    // PHASE 2: Upload and Validate LAN
    // ==========================================
    console.log('[CREATE] 2/5 Uploading and validating LAN...');
    await page.locator('#loan-info-upload').setInputFiles(LAN_FILE);

    await expect(
        page.locator('.flex.items-center.justify-between.p-3.bg-green-50')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Validate' }).click();
    console.log('LAN validation started...');

    const validationResults = page.getByText('Validation Results');
    const duplicateLAN = page.locator('div').filter({ hasText: /^Duplicate LAN Nos Found$/ }).first();

    const result = await Promise.race([
        duplicateLAN.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'DUPLICATE'),
        validationResults.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'RESULTS')
    ]).catch(() => 'TIMEOUT');

    if (result === 'DUPLICATE') {
        console.error('❌ DUPLICATE LAN FOUND');
        await duplicateLAN.click();
        await page.locator('.w-8.h-8.bg-white\\/20.hover\\:bg-white\\/30').click();
        console.error('Browser test stopped due to duplicate LAN records.');
        await takeScreenshot(page, 'LAN-DUPLICATE-ERROR');
        throw new Error('DUPLICATE LAN FOUND - E2E TEST STOPPED');
    }

    if (result === 'TIMEOUT') {
        throw new Error('LAN validation timed out. No validation result appeared.');
    }

    await takeScreenshot(page, '03-lan-validation-results');
    console.log('✅ LAN validation completed successfully.');

    // Select Others & Add Settings
    await page.locator('label').filter({ hasText: 'Others' }).click();
    await page.getByRole('radio', { name: 'Others' }).check();
    await page.getByRole('button', { name: 'Add Settings' }).click();
    console.log('✅ LAN settings added successfully.');

    // ==========================================
    // PHASE 3: Configure Deal Settings
    // ==========================================
    console.log('[CREATE] 3/5 Configuring deal settings...');
    await page.locator('label').filter({ hasText: 'Date of Disbursement' }).click();
    await page.locator('input[name="dateofDisbursement"]').fill('2025-03-15');

    await page.getByRole('textbox', { name: /Enter payout day by month/ }).fill('10');
    await page.getByRole('textbox', { name: 'Enter assignee share' }).fill('30');

    await page.locator('select[name="benchmarkType"]').selectOption('RBLR');
    await page.getByRole('heading', { name: 'Interest Method' }).click();
    await page.getByRole('checkbox', { name: /T1 Actual Days/ }).check();

    await page.getByRole('button', { name: 'Save Settings' }).click();
    await takeScreenshot(page, '04-deal-settings');
    console.log('✅ Deal settings configured successfully.');

    // ==========================================
    // PHASE 4: Submit Deal
    // ==========================================
    console.log('[CREATE] 4/5 Submitting deal creation...');
    await takeScreenshot(page, '04-before-deal-creation');

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText(DEAL_NAME, { exact: false }).first()).toBeVisible({ timeout: 15000 });

    await takeScreenshot(page, '05-deal-created');
    console.log('✅ Deal created successfully.');

    // ==========================================
    // PHASE 5: Verify Deal Tabs & Services
    // ==========================================
    console.log('[CREATE] 5/5 Verifying deal tabs and services...');
    // Assuming the deal row has the name and test_invest text as per your original code
    const dealRow = page.getByText(`${DEAL_NAME}test_invest firstPool`, { exact: false });
    await expect(dealRow).toBeVisible({ timeout: 15000 });
    await dealRow.click();
    console.log('Deal detail page opened.');

    const overviewTab = page.getByRole('button', { name: 'Overview', exact: true });
    await expect(overviewTab).toBeVisible({ timeout: 15000 });
    await overviewTab.click();
    console.log('Verified deal tab: Overview');

    const tabs = ['Parties', 'Settings', 'Documents', 'Services'];
    for (const tab of tabs) {
        const tabButton = page.getByRole('button', { name: tab, exact: true });
        await expect(tabButton).toBeVisible({ timeout: 15000 });
        await tabButton.click();
        console.log(`Verified deal tab: ${tab}`);
    }

    await page.getByRole('button', { name: 'Create & Go' }).first().click();
    await takeScreenshot(page, '06-deal-services');
    console.log('✅ Deal services created.');
    console.log('--- [DEAL CREATION] Full workflow complete ---');
}
// ======================================================
// 4. PRE-FLIGHT CHECK & ORCHESTRATION
// ======================================================

async function ensureDealExists(page) {
    console.log(`\n[PRE-FLIGHT] Checking if Deal "${DEAL_NAME}" exists...`);

    // 1. Navigate to Deal Creation Listing
    const directAssignment = page.getByRole('button', { name: 'Direct Assignment', exact: true });
    await expect(directAssignment).toBeVisible({ timeout: 15000 });
    await directAssignment.hover();
    await page.waitForTimeout(1000);

    await page.getByText('Deal Origination', { exact: true }).click();
    await page.getByRole('link', { name: 'Deal Creation', exact: true }).click();
    await expect(page.getByText('Active Deals', { exact: true })).toBeVisible({ timeout: 15000 });

    // 2. Check if deal exists
    const dealLocator = page.getByText(DEAL_NAME, { exact: false }).first();

    if (await dealLocator.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`✅ [PRE-FLIGHT] Deal "${DEAL_NAME}" FOUND. Skipping creation.`);
        return; // Deal hai, toh seedha Payout par jayega
    }

    // 3. Deal NOT found -> Print message and run Auto Creation
    console.log(`⚠️ [PRE-FLIGHT] Deal NOT FOUND. Printing Message: "Create New Deal"`);
    console.log(`⚠️ [PRE-FLIGHT] Triggering Auto Deal Creation Function...`);

    // Form open karein
    await page.getByRole('button', { name: 'Create Deal', exact: true }).click();
    await page.waitForTimeout(1000);

    // Naya merged function call karein
    await createAndVerifyDeal(page);

    console.log(`✅ [PRE-FLIGHT] Deal "${DEAL_NAME}" successfully auto-created. Moving to Payout Monitoring...`);
}

// ======================================================
// 5. PHASE 2: PAYOUT MONITORING
// ======================================================

async function runPayoutMonitoring(page) {
    console.log('\n[PAYOUT] Starting Payout Monitoring flow...');
    await page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });
    await expect(page.locator('input[placeholder*="Search folder name"]')).toBeVisible();

    const fileInput = page.locator('input[type="file"][accept*=".xlsx"], input[type="file"][accept*=".xls"]');
    await fileInput.first().setInputFiles(PAYOUT_FILES);
    console.log(`[PAYOUT] Queued ${PAYOUT_FILES.length} files.`);

    const modalHeader = page.getByRole('heading', { name: 'Upload Progress' });
    await expect(modalHeader).toBeVisible({ timeout: 15000 });
    let isUploadFinished = false;
    for (let i = 1; i <= 60; i++) {
        if (await page.locator('text=COMPLETED').first().isVisible().catch(() => false)) {
            isUploadFinished = true; break;
        }
        if (await page.getByRole('button', { name: 'Check Status' }).isEnabled().catch(() => false)) {
            await page.getByRole('button', { name: 'Check Status' }).click();
        }
        await page.waitForTimeout(2500);
    }
    expect(isUploadFinished).toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(modalHeader).toBeHidden({ timeout: 10000 });

    const dealLocator = page.locator('.accordion h3').first();
    await expect(dealLocator).toBeVisible({ timeout: 15000 });
    await dealLocator.click();
    await page.waitForTimeout(1500);

    const selectAllBtn = page.getByRole('button', { name: 'Select All' }).first();
    if (await selectAllBtn.isVisible().catch(() => false)) {
        await selectAllBtn.click();
        await page.getByRole('button', { name: /^Process \(\d+\)$/ }).first().click();

        const swal = page.locator('.swal2-popup');
        if (await swal.isVisible({ timeout: 6000 }).catch(() => false)) {
            await swal.locator('button.swal2-confirm').click();
        }
        await page.waitForTimeout(5000);

        const closeProcessing = page.locator('.fixed.inset-0 button:has-text("Close")').first();
        if (await closeProcessing.isVisible({ timeout: 25000 }).catch(() => false)) {
            await closeProcessing.click();
        }
    }

    const latestMonth = page.locator('ul li:has(.text-green-500)').last();
    if (await latestMonth.isVisible().catch(() => false)) {
        await latestMonth.click();
        await page.waitForTimeout(2000);
    }

    for (const tabName of PAYOUT_TABS) {
        const tabBtn = page.getByRole('button', { name: tabName, exact: true }).first();
        if (await tabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await tabBtn.click({ force: true }).catch(async () => {
                await page.keyboard.press('Escape');
                await tabBtn.click({ force: true });
            });
            await page.waitForTimeout(2000);
            await takeScreenshot(page, `03-payout-tab-${tabName.toLowerCase().replace(/\s+/g, '-')}`);
            console.log(`[PAYOUT] Audited Tab: ${tabName}`);
        }
    }
}

// ======================================================
// 6. PHASE 3: POOL RECONCILIATION
// ======================================================

async function runPoolReconciliation(page) {
    console.log('\n[RECON] Starting Pool Reconciliation flow...');
    await page.goto(`${BASE_URL}/da/deal-ori/pool-recon`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/pool-recon/, { timeout: 20000 });

    const dealCard = page.getByRole('heading', { name: RECON_DEAL_NAME, exact: true }).or(page.getByText(RECON_DEAL_NAME, { exact: true }));
    if (!(await dealCard.first().isVisible({ timeout: 5000 }).catch(() => false))) {
        await page.locator('.flex.items-center.gap-2.cursor-pointer > .transform').first().click();
    }
    await dealCard.first().click();
    await page.waitForTimeout(1500);

    const migrateBtn = page.getByRole('button', { name: /Migrate files from payout/i }).first();
    if (await migrateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await migrateBtn.click();
        await expect(page.getByRole('dialog', { name: 'Are you sure?' })).toBeVisible();
        await page.getByRole('button', { name: 'Yes, migrate' }).click();
        await page.waitForTimeout(2000);
    }

    await page.locator('.border-b > div:nth-child(2)').first().click();
    await page.waitForTimeout(800);
    const selectAll = page.getByRole('button', { name: 'Select All' }).first();
    if (await selectAll.isVisible().catch(() => false)) await selectAll.click();

    const processBtn = page.getByRole('button', { name: /^Process \(\d+\)$/ }).first();
    if (await processBtn.isVisible().catch(() => false)) {
        await processBtn.click();

        const rem = page.getByRole('dialog', { name: 'Reminder' });
        if (await rem.isVisible({ timeout: 8000 }).catch(() => false)) await rem.getByRole('button', { name: 'Continue' }).click();

        const bank = page.getByRole('dialog', { name: 'Bank Data Issue' });
        if (await bank.isVisible({ timeout: 8000 }).catch(() => false)) await bank.getByRole('button', { name: 'Skip & Continue' }).click();

        for (let i = 1; i <= 60; i++) {
            const body = await page.locator('.fixed.inset-0, [role="dialog"]').first().innerText().catch(() => '');
            if (/COMPLETED/i.test(body) && /100\s*%/i.test(body)) break;
            if (await page.getByRole('button', { name: 'Check Status' }).isEnabled().catch(() => false)) {
                await page.getByRole('button', { name: 'Check Status' }).click().catch(() => { });
            }
            await page.waitForTimeout(2500);
        }
        await page.keyboard.press('Escape');
    }

    const monthRow = page.locator('div').filter({ hasText: new RegExp(`${RECON_DEAL_NAME}:.*`) }).nth(5);
    if (await monthRow.isVisible({ timeout: 5000 }).catch(() => false)) await monthRow.click();
    await page.waitForTimeout(2000);

    for (const tabName of RECON_TABS) {
        const tabBtn = page.getByRole('button', { name: tabName, exact: true }).first();
        if (await tabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await tabBtn.click({ force: true }).catch(async () => {
                await page.keyboard.press('Escape');
                await tabBtn.click({ force: true });
            });
            await page.waitForTimeout(2000);
            await takeScreenshot(page, `04-recon-tab-${tabName.toLowerCase().replace(/\s+/g, '-')}`);
            console.log(`[RECON] Audited Tab: ${tabName}`);
        }
    }
}

// ======================================================
// 7. MAIN ORCHESTRATOR
// ======================================================

test.describe('Master E2E - Deal Creation -> Payout -> Recon', () => {
    test('Full System Validation Pipeline', async ({ page }) => {
        test.setTimeout(600000);

        try {
            await test.step('01 - Authentication', async () => {
                await loginAsOriginator(page);
            });

            await test.step('02 - Pre-flight Check & Conditional Deal Creation', async () => {
                await ensureDealExists(page);
            });

            await test.step('03 - Payout Monitoring Pipeline', async () => {
                await runPayoutMonitoring(page);
            });

            await test.step('04 - Pool Reconciliation Pipeline', async () => {
                await runPoolReconciliation(page);
            });

            await test.step('05 - Final State', async () => {
                await takeScreenshot(page, '05-master-final-state');
                console.log('\n======================================================');
                console.log(' 🚀 MASTER E2E PIPELINE COMPLETED SUCCESSFULLY');
                console.log('======================================================\n');
            });
        } catch (error) {
            await takeScreenshot(page, 'FAILED-MASTER-E2E');
            console.error('🚨 MASTER E2E FAILED:', error.message);
            throw error;
        }
    });
});