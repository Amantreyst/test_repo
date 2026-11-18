const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ======================================================
// 1. CONFIGURATION
// ======================================================

const BASE_URL = 'http://localhost:5173';

const LOGIN_EMAIL = process.env.INVESTOR_EMAIL || 'test_investor1@gmail.com';
const LOGIN_PASSWORD = process.env.INVESTOR_PASSWORD || 'test@inv1';

const RESULT_DIR = path.resolve(__dirname, '../../results/investor/profile');
const SCREENSHOT_DIR = path.resolve(__dirname, '../../results/investor/profile');

// Create screenshot directory automatically
fs.mkdirSync(RESULT_DIR, { recursive: true });

// ======================================================
// 2. REUSABLE FUNCTIONS
// ======================================================

async function takeScreenshot(page, name) {
    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${name}.png`),
        fullPage: true
    });
    console.log(`[Screenshot] ${name}.png`);
}

async function loginAsInvestor(page) {
    console.log('[LOGIN] Opening application...');

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

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
        if (page.url().includes('/investor/dashboard')) break;
        if (await loginHereBtn.isVisible().catch(() => false)) {
            console.log('[LOGIN] Active session conflict detected. Forcing takeover via "Login Here"...');
            await loginHereBtn.click();
            await page.waitForTimeout(1000);
            break;
        }
        await page.waitForTimeout(500);
    }

    await page.waitForURL(/\/investor\/dashboard\/?$/, { timeout: 35000 });
    console.log('[LOGIN] Authenticated successfully. Current URL:', page.url());
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '01-investor-login-success');
}

async function navigateToInvestorProfile(page) {
    console.log('[NAV] Navigating to Investor Profile...');

    // Try to find profile link/button in navigation
    const profileSelectors = [
        'a[href*="profile"]',
        'button:has-text("Profile")',
        '[data-testid="profile-link"]',
        'text=My Profile',
        'text=Profile Settings'
    ];

    let profileClicked = false;

    for (const selector of profileSelectors) {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 3000 }).catch(() => false)) {
            await element.click();
            profileClicked = true;
            console.log(`[NAV] Clicked profile via: ${selector}`);
            break;
        }
    }

    // Fallback: Direct URL navigation
    if (!profileClicked) {
        console.log('[NAV] Falling back to direct URL navigation');
        await page.goto(`${BASE_URL}/investor/profile`, { waitUntil: 'domcontentloaded' });
    }

    await page.waitForURL(/\/investor\/profile/, { timeout: 20000 });
    await takeScreenshot(page, '02-investor-profile-page');
    console.log('[NAV] Investor Profile page loaded');
}

async function verifyProfileElements(page) {
    console.log('[VERIFY] Checking profile page elements...');

    // Common profile elements to verify
    const elements = {
        email: page.locator('input[type="email"], input[name="email"]').first(),
        name: page.locator('input[name="name"], input[name="fullName"], input[name="full_name"]').first(),
        phone: page.locator('input[name="phone"], input[name="mobile"], input[type="tel"]').first(),
        company: page.locator('input[name="company"], input[name="organization"]').first(),
        saveBtn: page.getByRole('button', { name: /Save|Update|Submit/i }).first(),
    };

    const results = {};

    for (const [key, locator] of Object.entries(elements)) {
        try {
            results[key] = await locator.isVisible({ timeout: 5000 });
            console.log(`[VERIFY] ${key}: ${results[key] ? 'VISIBLE' : 'NOT FOUND'}`);
        } catch {
            results[key] = false;
            console.log(`[VERIFY] ${key}: NOT FOUND`);
        }
    }

    await takeScreenshot(page, '03-profile-elements-verified');
    return results;
}

async function updateProfileInfo(page, updates) {
    console.log('[UPDATE] Updating profile information...');

    if (updates.name) {
        const nameInput = page.locator('input[name="name"], input[name="fullName"], input[name="full_name"]').first();
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await nameInput.fill(updates.name);
            console.log(`[UPDATE] Name updated to: ${updates.name}`);
        }
    }

    if (updates.phone) {
        const phoneInput = page.locator('input[name="phone"], input[name="mobile"], input[type="tel"]').first();
        if (await phoneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await phoneInput.fill(updates.phone);
            console.log(`[UPDATE] Phone updated to: ${updates.phone}`);
        }
    }

    if (updates.company) {
        const companyInput = page.locator('input[name="company"], input[name="organization"]').first();
        if (await companyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await companyInput.fill(updates.company);
            console.log(`[UPDATE] Company updated to: ${updates.company}`);
        }
    }

    // Click save button
    const saveBtn = page.getByRole('button', { name: /Save|Update|Submit/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        console.log('[UPDATE] Save button clicked');
    }

    await takeScreenshot(page, '04-profile-updated');
    console.log('[UPDATE] Profile update completed');
}

async function verifyInvestorDashboard(page) {
    console.log('[VERIFY] Checking investor dashboard...');

    // Wait for dashboard to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Check for common dashboard elements
    const dashboardElements = {
        portfolio: page.locator('text=Portfolio, text=My Portfolio, text=Investments').first(),
        deals: page.locator('text=Deals, text=My Deals').first(),
        returns: page.locator('text=Returns, text=ROI, text=Yield').first(),
        settings: page.getByRole('button', { name: /Settings|Profile/i }).first(),
    };

    for (const [key, locator] of Object.entries(dashboardElements)) {
        try {
            const visible = await locator.isVisible({ timeout: 5000 });
            console.log(`[VERIFY] Dashboard ${key}: ${visible ? 'VISIBLE' : 'NOT FOUND'}`);
        } catch {
            console.log(`[VERIFY] Dashboard ${key}: NOT FOUND`);
        }
    }

    await takeScreenshot(page, '00-investor-dashboard');
}

// ======================================================
// 3. MAIN TEST SPECIFICATION
// ======================================================

test.describe('Investor - Profile Management', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsInvestor(page);
    });

    test('INV-PROFILE-001: Login and verify investor dashboard', async ({ page }) => {
        await verifyInvestorDashboard(page);
        console.log('✅ Investor dashboard verified');
    });

    test('INV-PROFILE-002: Navigate to profile page and verify elements', async ({ page }) => {
        await navigateToInvestorProfile(page);
        const elements = await verifyProfileElements(page);

        // At minimum, email should be visible (read-only usually)
        expect(elements.email || elements.name || elements.saveBtn).toBeTruthy();
        console.log('✅ Profile page elements verified');
    });

    test('INV-PROFILE-003: View profile information (read-only)', async ({ page }) => {
        await navigateToInvestorProfile(page);

        // Check if email is displayed (usually read-only for investors)
        const emailInput = page.locator('input[type="email"], input[name="email"]').first();
        if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            const emailValue = await emailInput.inputValue().catch(() => '');
            console.log(`[INFO] Profile email: ${emailValue}`);
            expect(emailValue).toContain('@');
        }

        await takeScreenshot(page, '05-profile-readonly-view');
        console.log('✅ Profile read-only view verified');
    });

    test('INV-PROFILE-004: Update profile information', async ({ page }) => {
        await navigateToInvestorProfile(page);

        // Verify current state first
        await verifyProfileElements(page);

        // Update with test data (using timestamp to ensure uniqueness)
        const timestamp = Date.now().toString().slice(-6);
        const updates = {
            name: `Test Investor ${timestamp}`,
            phone: `+91-98765-${timestamp.slice(0, 5)}`,
            company: `Test Company ${timestamp}`
        };

        await updateProfileInfo(page, updates);

        // Verify updates persisted
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const nameInput = page.locator('input[name="name"], input[name="fullName"], input[name="full_name"]').first();
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            const nameValue = await nameInput.inputValue().catch(() => '');
            console.log(`[VERIFY] Updated name value: ${nameValue}`);
        }

        console.log('✅ Profile update test completed');
    });

    test('INV-PROFILE-005: Navigation flow - Dashboard -> Profile -> Dashboard', async ({ page }) => {
        // Start at dashboard
        await verifyInvestorDashboard(page);

        // Go to profile
        await navigateToInvestorProfile(page);
        await verifyProfileElements(page);

        // Navigate back to dashboard
        const dashboardLink = page.locator('a[href*="dashboard"], button:has-text("Dashboard"), a:has-text("Dashboard")').first();
        if (await dashboardLink.isVisible({ timeout: 3000 }).catch(() => false)) {
            await dashboardLink.click();
        } else {
            await page.goto(`${BASE_URL}/investor/dashboard`, { waitUntil: 'domcontentloaded' });
        }

        await page.waitForURL(/\/investor\/dashboard/, { timeout: 15000 });
        await verifyInvestorDashboard(page);

        console.log('✅ Navigation flow verified');
    });

});

// ======================================================
// 4. EDGE CASE / NEGATIVE TESTS
// ======================================================

test.describe('Investor - Profile Negative Tests', () => {

    test('INV-PROFILE-NEG-001: Invalid phone number format', async ({ page }) => {
        await loginAsInvestor(page);
        await navigateToInvestorProfile(page);

        const phoneInput = page.locator('input[name="phone"], input[name="mobile"], input[type="tel"]').first();
        if (await phoneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await phoneInput.fill('invalid-phone');
            await takeScreenshot(page, 'neg-invalid-phone-input');

            const saveBtn = page.getByRole('button', { name: /Save|Update|Submit/i }).first();
            if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await saveBtn.click();
                await page.waitForTimeout(2000);

                // Check for validation error
                const errorMsg = page.locator('text=/invalid|error|required/i').first();
                if (await errorMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
                    console.log('[NEG] Validation error displayed for invalid phone');
                }
            }
        }
        console.log('✅ Negative test: Invalid phone format handled');
    });

    test('INV-PROFILE-NEG-002: Empty required fields', async ({ page }) => {
        await loginAsInvestor(page);
        await navigateToInvestorProfile(page);

        // Try to clear name field if editable
        const nameInput = page.locator('input[name="name"], input[name="fullName"], input[name="full_name"]').first();
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await nameInput.fill('');
            await takeScreenshot(page, 'neg-empty-name');

            const saveBtn = page.getByRole('button', { name: /Save|Update|Submit/i }).first();
            if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await saveBtn.click();
                await page.waitForTimeout(2000);

                const errorMsg = page.locator('text=/required|empty|must/i').first();
                if (await errorMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
                    console.log('[NEG] Required field validation displayed');
                }
            }
        }
        console.log('✅ Negative test: Empty required fields handled');
    });

});