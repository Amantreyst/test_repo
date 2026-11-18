const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ORIGINATOR_EMAIL || 'test_ori1@gmail.com';
const LOGIN_PASSWORD = process.env.ORIGINATOR_PASSWORD || 'test@ori1';

const RESULT_DIR = path.resolve(__dirname, '../../results/originator/payout-monitoring/01-explore');

async function takeScreenshot(page, name) {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const filePath = path.join(RESULT_DIR, `${name}.png`);

  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }

  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[Screenshot Replaced] 01-explore/${name}.png`);
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
// EXPLORATORY TESTS: PAYOUT MONITORING
// ============================================================
test.describe('Payout Monitoring - Exploratory Testing', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsOriginator(page);
    await page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });
  });

  test('EXP-001: Payout Monitoring Workspace & Filter Sidebar Exploration', async ({ page }) => {
    console.log('Exploring Payout Monitoring main view...');

    await expect(page).toHaveURL(/.*payout-monitoring/);
    await takeScreenshot(page, '01-payout-monitoring-workspace');

    // Explore Search Input
    const searchInput = page.locator('input[placeholder*="Search folder name"]');
    await expect(searchInput).toBeVisible();

    // Explore Upload Action Button
    const uploadBtn = page.locator('button[title*="Upload Excel file"], .add-deal-btn');
    await expect(uploadBtn).toBeVisible();

    // Explore Batch History Button
    const batchHistoryBtn = page.locator('button[title*="View Batches History"], .batch-history');
    await expect(batchHistoryBtn).toBeVisible();

    // Explore Download Template Button
    const templateBtn = page.locator('button[title*="Download Template"], .template-excel');
    await expect(templateBtn).toBeVisible();

    await takeScreenshot(page, '02-sidebar-controls-explored');
  });

  test('EXP-002: Batch History Modal Exploration', async ({ page }) => {
    console.log('Opening Batch History modal...');

    const batchHistoryBtn = page.locator('button[title*="View Batches History"], .batch-history');
    await batchHistoryBtn.click();

    // Check modal visibility
    const modalHeader = page.locator('text=Batch History').or(page.locator('h3:has-text("Batch")')).first();
    await expect(modalHeader).toBeVisible({ timeout: 8000 });

    await takeScreenshot(page, '03-batch-history-modal');

    // Close modal via modal close button or backdrop
    const modalCloseBtn = page.locator('.fixed.inset-0 button:has(svg)').first();
    if (await modalCloseBtn.isVisible().catch(() => false)) {
      await modalCloseBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(500);
  });

  test('EXP-003: Finance Page Empty State & Data Guards Exploration', async ({ page }) => {
    console.log('Exploring Finance Page default / empty state...');

    const emptyStatePrompt = page.locator('text=Insufficient Data Available').or(
      page.locator('text=Process your data first')
    ).or(page.locator('text=No Deals Found'));

    await takeScreenshot(page, '04-finance-page-initial-state');
    console.log('Explored Finance Page default data guards.');
  });

});
