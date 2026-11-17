const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ======================================================
// 1. CONFIGURATION
// ======================================================

const BASE_URL = 'http://localhost:5173';

const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const DEAL_NAME = 'IHFL_136_UBI';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator');
const TEST_DATA_DIR = path.resolve(__dirname, '../../UBI-136');

// Create screenshot directory automatically
fs.mkdirSync(RESULT_DIR, { recursive: true });

// Test files
const LAN_FILE = path.join(TEST_DATA_DIR, 'LAN_INFO UBI 136.xlsx');

const PAYOUT_FILES = [
    path.join(TEST_DATA_DIR, 'Aug-25.xlsx'),
    path.join(TEST_DATA_DIR, 'Dec-25.xlsx'),
    path.join(TEST_DATA_DIR, 'Feb-26.xlsx'),
    path.join(TEST_DATA_DIR, 'IIFL_136_UBI-Apr-25.xlsx'),
];

// ======================================================
// 2. REUSABLE FUNCTIONS
// ======================================================

async function takeScreenshot(page, name) {
    await page.screenshot({
        path: path.join(RESULT_DIR, `${name}.png`),
        fullPage: true
    });
}

async function verifyTestFiles() {
    const files = [LAN_FILE, ...PAYOUT_FILES];
    for (const file of files) {
        if (!fs.existsSync(file)) {
            throw new Error(`Required test file not found: ${file}`);
        }
    }
}


async function loginAsOriginator(page) {

    console.log('Opening application...');

    await page.goto(BASE_URL);

    await page.getByRole('button', {
        name: 'Sign In'
    }).click();

    const emailInput = page.getByRole('textbox', {
        name: 'Email *'
    });

    const passwordInput = page.locator('input[type="password"]');

    await expect(emailInput).toBeVisible({ timeout: 10000 });

    await emailInput.fill(LOGIN_EMAIL);
    await passwordInput.fill(LOGIN_PASSWORD);

    console.log('Submitting Originator login...');

    await page.locator('form')
        .getByRole('button', { name: 'Sign In' })
        .click();

    const loginHereButton = page.getByRole('button', {
        name: 'Login Here'
    });

    const dashboardUrl = /\/originator\/dashboard\/?$/;

    // Wait for dashboard or active session modal
    const result = await Promise.race([
        page.waitForURL(dashboardUrl, {
            timeout: 15000
        }).then(() => 'dashboard'),

        loginHereButton.waitFor({
            state: 'visible',
            timeout: 15000
        }).then(() => 'modal')
    ]).catch(() => 'timeout');

    if (result === 'modal') {

        console.log('Active session detected. Forcing login...');

        await loginHereButton.click();

        await page.waitForURL(dashboardUrl, {
            timeout: 20000
        });

    } else if (result === 'timeout') {

        throw new Error(
            `Login failed or timed out. Current URL: ${page.url()}`
        );
    }

    await expect(page).toHaveURL(dashboardUrl);

    console.log('Originator login successful');
    console.log('Current URL:', page.url());
    await page.waitForTimeout(4000);
    await takeScreenshot(page, '01-originator-login');

    // Allow dashboard UI to become ready
    await page.waitForLoadState('domcontentloaded');

    console.log('Dashboard ready. Starting Deal Creation...');
}





async function openDealCreation(page) {

    console.log('Opening Deal Creation workflow...');

    // Step 1: Find Direct Assignment
    const directAssignment = page.getByRole('button', {
        name: 'Direct Assignment',
        exact: true
    });

    await expect(directAssignment).toBeVisible({ timeout: 15000 });

    // IMPORTANT: Hover to reveal submenu
    await directAssignment.hover();

    console.log('Hovered over Direct Assignment');

    // Capture menu state for debugging
    await page.waitForTimeout(1000);

    await takeScreenshot(page, 'DEBUG-direct-assignment-menu');

    // Print visible menu items
    const visibleItems = await page.locator(
        'button:visible, a:visible, [role="menuitem"]:visible'
    ).allTextContents();

    console.log('Visible menu items:', visibleItems);

    // Step 2: Find Deal Origination
    const dealOrigination = page.getByText('Deal Origination', {
        exact: true
    });

    await expect(dealOrigination).toBeVisible({
        timeout: 10000
    });

    await dealOrigination.click();

    console.log('Deal Origination clicked');

    // Step 3: Open Deal Creation
    const dealCreation = page.getByRole('link', {
        name: 'Deal Creation',
        exact: true
    });

    await expect(dealCreation).toBeVisible({
        timeout: 10000
    });

    await dealCreation.click();

    console.log('Deal Creation link clicked');

    // Step 4: Click Create Deal
    const createDealButton = page.getByRole('button', {
        name: 'Create Deal',
        exact: true
    });

    await expect(createDealButton).toBeVisible({
        timeout: 15000
    });

    await createDealButton.click();
    await page.waitForTimeout(1000);

    await takeScreenshot(page, '02-deal-creation-opened');

    console.log('Deal Creation page opened successfully');
}


async function openDealVerification(page) {

    console.log('Opening Deal Verification  workflow...');

    // Step 1: Find Direct Assignment
    const directAssignment = page.getByRole('button', {
        name: 'Direct Assignment',
        exact: true
    });

    await expect(directAssignment).toBeVisible({ timeout: 15000 });

    // IMPORTANT: Hover to reveal submenu
    await directAssignment.hover();

    console.log('Hovered over Direct Assignment');

    // Capture menu state for debugging
    await page.waitForTimeout(1000);

    // await takeScreenshot(page, 'DEBUG-direct-assignment-menu');

    // Print visible menu items
    const visibleItems = await page.locator(
        'button:visible, a:visible, [role="menuitem"]:visible'
    ).allTextContents();

    console.log('Visible menu items:', visibleItems);

    // Step 2: Find Deal Origination
    const dealOrigination = page.getByText('Deal Origination', {
        exact: true
    });

    await expect(dealOrigination).toBeVisible({
        timeout: 10000
    });

    await dealOrigination.click();

    console.log('Deal Origination clicked');

    // Step 3: Open Deal Creation
    const dealCreation = page.getByRole('link', {
        name: 'Deal Creation',
        exact: true
    });

    await expect(dealCreation).toBeVisible({
        timeout: 10000
    });

    await dealCreation.click();

    console.log('Deal Creation link clicked');
    console.log('Deal verification  page opened successfully');
}


// async function openDealDelete(page) {

//     console.log('Starting UBI-136 deal deletion...');

//     // 1. Open Direct Assignment menu
//     const directAssignment = page.getByRole('button', {
//         name: 'Direct Assignment',
//         exact: true
//     });

//     await expect(directAssignment).toBeVisible({ timeout: 15000 });
//     await directAssignment.hover();

//     // 2. Open Deal Origination
//     const dealOrigination = page.getByRole('button', {
//         name: 'Deal Origination',
//         exact: true
//     });

//     await expect(dealOrigination).toBeVisible({ timeout: 10000 });
//     await dealOrigination.click();

//     // 3. Open Deal Creation
//     await page.getByRole('link', {
//         name: 'Deal Creation',
//         exact: true
//     }).click();

//     console.log('Deal listing opened');

//     // 4. Wait for Active Deals
//     await expect(
//         page.getByText('Active Deals', { exact: true })
//     ).toBeVisible({ timeout: 15000 });

//     // 5. Find UBI-136 deal
//     const deal = page.getByText(
//         'UBI-136test_invest firstPool',
//         { exact: false }
//     );

//     await expect(deal).toBeVisible({ timeout: 15000 });
//     await deal.click();

//     console.log('UBI-136 deal opened');

//     // 6. Open deal action menu
//     const actionMenu = page.locator(
//         '.p-2.hover\\:bg-gray-100'
//     );

//     await expect(actionMenu).toBeVisible();
//     await actionMenu.click();

//     // 7. Click Delete Deal
//     await page.getByRole('button', {
//         name: 'Delete Deal',
//         exact: true
//     }).click();

//     console.log('Delete confirmation opened');

//     // 8. Verify confirmation dialog
//     const confirmationDialog = page.getByRole('dialog', {
//         name: 'Are you sure?'
//     });

//     await expect(confirmationDialog).toBeVisible();

//     await takeScreenshot(page, '08-delete-deal-confirmation');

//     // 9. Confirm deletion
//     await confirmationDialog.getByRole('button', {
//         name: 'Delete',
//         exact: true
//     }).click();

//     console.log('Deal deletion submitted. Waiting for OTP...');

//     // 10. OTP verification
//     await expect(
//         page.getByText('OTP Verification', { exact: false })
//     ).toBeVisible({ timeout: 15000 });

//     await takeScreenshot(page, '09-delete-deal-otp');

//     // Read OTP from environment variable
//     const otp = process.env.DELETE_OTP;

//     // if (!otp) {
//     //     throw new Error(
//     //         'DELETE_OTP is missing. Enter OTP manually or configure DELETE_OTP.'
//     //     );
//     // }

//     // Locate OTP textbox
//     const otpInput = page.getByRole('textbox', {
//         name: /OTP|verification code/i
//     });

//     // await otpInput.fill(otp);

//     // 11. Verify OTP
//     await page.getByRole('button', {
//         name: 'Verify OTP',
//         exact: true
//     }).click();

//     console.log('OTP submitted. Verifying deal deletion...');

//     // 12. Verify deletion success
//     await expect(deal).toBeHidden({ timeout: 20000 });

//     await takeScreenshot(page, '10-deal-deleted');

//     console.log('UBI-136 DEAL DELETED SUCCESSFULLY');
// }





async function createDeal(page) {
    const tempDealInput = page.locator('#react-select-2-input');
    await tempDealInput.fill('test');

    const dealNameInput = page.locator('input[name="dealName"]');
    await dealNameInput.fill(DEAL_NAME);
    await dealNameInput.press('Enter');

    const poolValueInput = page.locator('input[name="originalPoolValue"]');
    await poolValueInput.fill('20000000');
    await poolValueInput.press('Tab');

    const investorInput = page.locator('#react-select-3-input');
    await investorInput.fill('test_invest');
    await page.getByRole('option', { name: 'test_invest first' }).click();

    await takeScreenshot(page, '02-deal-basic-details');
    console.log('Basic deal information entered');
}


async function uploadAndValidateLAN(page) {

    // 1. Upload LAN Excel file
    await page.locator('#loan-info-upload').setInputFiles(LAN_FILE);

    // 2. Verify upload is displayed
    await expect(
        page.locator('.flex.items-center.justify-between.p-3.bg-green-50')
    ).toBeVisible();

    // 3. Click Validate
    await page.getByRole('button', { name: 'Validate' }).click();

    console.log('LAN validation started...');

    // 4. Wait for validation results or duplicate LAN message
    const validationResults = page.getByText('Validation Results');

    const duplicateLAN = page.locator('div')
        .filter({ hasText: /^Duplicate LAN Nos Found$/ })
        .first();

    const result = await Promise.race([

        duplicateLAN.waitFor({
            state: 'visible',
            timeout: 15000
        }).then(() => 'DUPLICATE'),

        validationResults.waitFor({
            state: 'visible',
            timeout: 15000
        }).then(() => 'RESULTS')

    ]).catch(() => 'TIMEOUT');

    // 5. Handle duplicate LAN records
    if (result === 'DUPLICATE') {

        console.error('❌ DUPLICATE LAN FOUND');

        // Click duplicate message
        await duplicateLAN.click();

        // Close duplicate popup
        await page.locator(
            '.w-8.h-8.bg-white\\/20.hover\\:bg-white\\/30'
        ).click();

        console.error('Browser test stopped due to duplicate LAN records.');

        await takeScreenshot(page, 'LAN-DUPLICATE-ERROR');

        // Stop remaining test steps
        throw new Error('DUPLICATE LAN FOUND - E2E TEST STOPPED');
    }

    // 6. Handle timeout
    if (result === 'TIMEOUT') {
        throw new Error(
            'LAN validation timed out. No validation result appeared.'
        );
    }

    // 7. Continue if validation results appear
    await takeScreenshot(page, '03-lan-validation-results');

    console.log('LAN validation completed successfully');

    // 8. Select Others
    await page.locator('label')
        .filter({ hasText: 'Others' })
        .click();

    await page.getByRole('radio', {
        name: 'Others'
    }).check();

    // 9. Add Settings
    await page.getByRole('button', {
        name: 'Add Settings'
    }).click();

    console.log('LAN settings added successfully');
}

// ---------------------------------------------------------------------------


async function configureDealSettings(page) {

    console.log('Configuring deal settings...');

    // 1. Date of Disbursement
    await page.locator('label')
        .filter({ hasText: 'Date of Disbursement' })
        .click();

    await page.locator('input[name="dateofDisbursement"]')
        .fill('2025-03-15');

    // 2. Payout Day
    const payoutDay = page.getByRole('textbox', {
        name: /Enter payout day by month/
    });

    await payoutDay.fill('10');

    // 3. Stakeholder Information
    await page.getByRole('textbox', {
        name: 'Enter assignee share'
    }).fill('30');

    console.log('Stakeholder share configured');

    // 4. Benchmark Type
    await page.locator('select[name="benchmarkType"]')
        .selectOption('RBLR');

    console.log('Benchmark type selected');

    // 5. Interest Method
    await page.getByRole('heading', {
        name: 'Interest Method'
    }).click();

    // 6. T1 Actual Days
    await page.getByRole('checkbox', {
        name: /T1 Actual Days/
    }).check();

    // 7. Save Settings
    await page.getByRole('button', {
        name: 'Save Settings'
    }).click();

    await takeScreenshot(page, '04-deal-settings');

    console.log('Deal settings configured successfully');
}



async function submitDeal(page) {

    console.log('Submitting deal creation...');

    await takeScreenshot(page, '04-before-deal-creation');

    await page.getByRole('button', {
        name: 'Create',
        exact: true
    }).click();

    await expect(
        page.getByText(DEAL_NAME, { exact: false }).first()
    ).toBeVisible({ timeout: 15000 });

    await takeScreenshot(page, '05-deal-created');

    console.log('Deal created successfully');

}


async function verifyDealTabs(page) {

    // 1. Open the deal detail page (this was the missing step)
    const dealRow = page.getByText('IHFL_136_UBItest_invest firstPool', { exact: false });
    await expect(dealRow).toBeVisible({ timeout: 15000 });
    await dealRow.click();
    console.log('Deal detail page opened');

    // 2. Overview tab
    const overviewTab = page.getByRole('button', { name: 'Overview', exact: true });
    await expect(overviewTab).toBeVisible({ timeout: 15000 });
    await overviewTab.click();
    console.log('Verified deal tab: Overview');

    // 3. Walk every tab
    const tabs = ['Parties', 'Settings', 'Documents', 'Services'];
    for (const tab of tabs) {
        const tabButton = page.getByRole('button', { name: tab, exact: true });
        await expect(tabButton).toBeVisible({ timeout: 15000 });
        await tabButton.click();
        console.log(`Verified deal tab: ${tab}`);
    }

    // 4. Services already active from the loop — click Create & Go
    await page.getByRole('button', { name: 'Create & Go' }).nth(1).click();
    await takeScreenshot(page, '06-deal-services');

    const tabs1 = ['Parties', 'Settings', 'Documents', 'Services'];
    for (const tab of tabs1) {
        const tabButton = page.getByRole('button', { name: tab, exact: true });
        await expect(tabButton).toBeVisible({ timeout: 15000 });
        await tabButton.click();
        console.log(`Verified deal tab: ${tab}`);
    }

    await page.getByRole('button', { name: 'Create & Go' }).first().click();
    console.log('Deal services created');
}

// Helper Function: Deal Details khol kar Services tab tak jata hai
// async function openServicesTab(page) {
//     console.log('Navigating back to Deal Details -> Services tab...');

//     // 1. Check if we are already on the page (Deal Row visible hai kya)
//     const dealRow = page.getByText('IHFL_136_UBItest_invest firstPool', { exact: false });
//     if (await dealRow.isVisible({ timeout: 3000 }).catch(() => false)) {
//         await dealRow.click();
//         await page.waitForTimeout(1000); // Wait for Modal to open
//     }

//     // 2. Walk every tab to reach Services
//     const tabs = ['Overview', 'Parties', 'Settings', 'Documents', 'Services'];
//     for (const tab of tabs) {
//         const tabButton = page.getByRole('button', { name: tab, exact: true });
//         await expect(tabButton).toBeVisible({ timeout: 15000 });
//         await tabButton.click();
//         await page.waitForTimeout(500); // Wait for tab content to render
//         console.log(`Navigated to tab: ${tab}`);
//     }
// }

// Main Function: Dono services ko activate karega
// async function verifyDealTabs(page) {
//     console.log('--- Verifying Deal Tabs and Activating Services ---');

//     // ==========================================
//     // STEP 1: Activate Pool Reconciliation
//     // ==========================================
//     await openServicesTab(page);

//     // Target specific card for Pool Reconciliation
//     const poolCard = page.locator('div').filter({ hasText: 'Pool reconciliation' }).last();
//     const poolCreateBtn = poolCard.getByRole('button', { name: 'Create & Go' });

//     if (await poolCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
//         console.log('Activating Pool Reconciliation...');
//         await poolCreateBtn.click();
//         await page.waitForTimeout(3000); // Wait for API to process and state to update
//     } else {
//         console.log('Pool Reconciliation is already active (or button not found).');
//     }

//     // ==========================================
//     // STEP 2: Activate Payout Monitoring
//     // ==========================================
//     // Modal close ho gaya hoga, toh wapas navigate karenge (Codegen flow ke mutabik)
//     await openServicesTab(page);

//     // Target specific card for Payout Monitoring
//     const payoutCard = page.locator('div').filter({ hasText: 'payout monitoring' }).last();
//     const payoutCreateBtn = payoutCard.getByRole('button', { name: 'Create & Go' });

//     if (await payoutCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
//         console.log('Activating Payout Monitoring...');
//         await payoutCreateBtn.click();
//         await page.waitForTimeout(3000); // Wait for API to process and state to update
//     } else {
//         console.log('Payout Monitoring is already active (or button not found).');
//     }

//     // Final Screenshot
//     await takeScreenshot(page, '06-deal-services');
//     console.log('✅ Both deal services activated successfully.');
// }

async function openPayoutMonitoring(page) {
    await page.getByRole('button', { name: 'Deal Origination' }).click();
    await page.getByRole('link', { name: 'Payout Monitoring' }).click();
    await page.getByRole('button', { name: 'Upload Excel file(s) with' }).click();
    console.log('Payout Monitoring page opened');
}

async function uploadPayoutFiles(page) {
    await page.locator('input[type="file"]').setInputFiles(PAYOUT_FILES);
    await takeScreenshot(page, '07-payout-files-uploaded');
    console.log('Four payout Excel files uploaded');

    const checkStatusButton = page.getByRole('button', { name: 'Check Status' });
    const missingDealsButton = page.getByRole('button', { name: 'Create Missing Deals (1)' });

    let missingDealsFound = false;

    for (let attempt = 1; attempt <= 12; attempt++) {
        if (await missingDealsButton.isVisible().catch(() => false)) {
            missingDealsFound = true;
            break;
        }
        if (await checkStatusButton.isVisible().catch(() => false)) {
            await checkStatusButton.click();
        }
        console.log(`Checking payout upload status: ${attempt}/12`);
        await page.waitForTimeout(3000);
    }

    if (!missingDealsFound) {
        missingDealsFound = await missingDealsButton.isVisible().catch(() => false);
    }

    expect(missingDealsFound, 'Expected missing deals action was not displayed after status checks').toBeTruthy();

    await takeScreenshot(page, '08-payout-processing-status');
    await missingDealsButton.click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await takeScreenshot(page, '09-missing-deals-created');
    console.log('Missing deals creation submitted');
}

// ======================================================
// 3. CUSTOM STEP WRAPPER FOR ERROR TRACKING
// ======================================================
// This prints the exact function name that fails
async function runStep(stepName, fn) {
    try {
        await test.step(stepName, async () => {
            await fn();
        });
    } catch (error) {
        console.error(`\n❌ [ERROR] Failed in step: "${stepName}"`);
        console.error(`   Reason: ${error.message.split('\n')[0]}\n`);
        throw error; // Re-throw so Playwright marks the test as failed
    }
}

// ======================================================
// 4. MAIN END-TO-END TEST
// ======================================================

test.describe('Originator - UBI-136 Deal E2E Testing', () => {

    test('Login, create deal, validate LAN and upload payout files', async ({ page }) => {
        await verifyTestFiles();

        // Set timeout before actions begin (3 minutes)
        test.setTimeout(180000);

        try {
            console.log('Starting step 1: Login');
            await runStep('01 - Originator Login', () => loginAsOriginator(page));
            console.log('Step 1 done, starting step 2');
            await runStep('02 - Open Deal Creation', () => openDealCreation(page));
            console.log('Step 2 done, starting step 3');
            await runStep('03 - Enter Deal Details', () => createDeal(page));
            console.log('Step 3 done, starting step 4');
            await runStep('04 - Upload and Validate LAN', () => uploadAndValidateLAN(page));

            await runStep('05 - Configure Deal Settings', () => configureDealSettings(page));

            await runStep('06 - Submit and Create Deal', () => submitDeal(page));
            await runStep('07 - Verify Deal Tabs and Services', () => verifyDealTabs(page));
            // await runStep('06 - Open Deal Verification', () => openDealVerification(page));
            // await runStep('08 - Open Deal Deletion', () => openDealDelete(page));

            // Uncomment these when you are ready for the payout flow
            // await runStep('08 - Open Payout Monitoring', () => openPayoutMonitoring(page));
            // await runStep('09 - Upload and Process Payout Files', () => uploadPayoutFiles(page));
            await page.waitForTimeout(3000);
            await takeScreenshot(page, '7-final-e2e-result');
            console.log('✅ E2E TEST COMPLETED SUCCESSFULLY');

        } catch (error) {
            // Capture screenshot at the failure point
            await page.screenshot({
                path: path.join(RESULT_DIR, 'FAILED-E2E.png'),
                fullPage: true
            }).catch(() => { });

            console.error('🚨 E2E TEST FAILED:', error.message);
            throw error;
        }
    });
});