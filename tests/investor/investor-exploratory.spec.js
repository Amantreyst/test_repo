const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5173';

test.describe('Investor - Exploratory, Positive & Negative Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
  });

  test('POS-001: Login with valid investor credentials', async ({ page }) => {
    await page.locator('input[type="email"]').fill('investor@test.com');
    await page.locator('input[type="password"]').fill('investor123');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(4000);
    
    const loginHere = page.getByRole('button', { name: 'Login Here' });
    if (await loginHere.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loginHere.click();
      await page.waitForTimeout(2000);
    }
    
    await page.screenshot({ path: 'tests/investor/investor-home.png', fullPage: true });
  });

  test('NEG-001: Empty credentials', async ({ page }) => {
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*login/);
  });

  test('NEG-002: Wrong password', async ({ page }) => {
    await page.locator('input[type="email"]').fill('investor@test.com');
    await page.locator('input[type="password"]').fill('wrongpass');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(2000);
  });

  test('NEG-003: SQL injection attempt', async ({ page }) => {
    await page.locator('input[type="email"]').fill("admin'--");
    await page.locator('input[type="password"]').fill("anything");
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*login/);
  });

  test('EXP-001: Check login page elements', async ({ page }) => {
    console.log('Page title:', await page.title());
    const inputs = await page.locator('input').count();
    const buttons = await page.locator('button').count();
    console.log(`Inputs: ${inputs}, Buttons: ${buttons}`);
  });
});
