const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5173';

test.describe('User - Exploratory, Positive & Negative Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
  });

  test('POS-001: Login with valid user credentials', async ({ page }) => {
    await page.locator('input[type="email"]').fill('user@test.com');
    await page.locator('input[type="password"]').fill('user123');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(4000);
    
    const loginHere = page.getByRole('button', { name: 'Login Here' });
    if (await loginHere.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loginHere.click();
      await page.waitForTimeout(2000);
    }
    
    await page.screenshot({ path: 'tests/user/user-home.png', fullPage: true });
  });

  test('NEG-001: Empty credentials', async ({ page }) => {
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*login/);
  });

  test('NEG-002: Invalid login', async ({ page }) => {
    await page.locator('input[type="email"]').fill('nonexistent@test.com');
    await page.locator('input[type="password"]').fill('nopass');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(2000);
  });

  test('EXP-001: Check login page elements', async ({ page }) => {
    console.log('Page title:', await page.title());
    const inputs = await page.locator('input').count();
    const buttons = await page.locator('button').count();
    console.log(`Inputs: ${inputs}, Buttons: ${buttons}`);
  });
});
