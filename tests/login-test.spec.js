const { test, expect } = require('@playwright/test');

test.describe('Login functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('login page loads correctly', async ({ page }) => {
    // Check URL
    await expect(page).toHaveURL(/.*\/login/);

    // Check form elements exist
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
  });

  test('login with empty credentials', async ({ page }) => {
    // Click sign in without entering credentials
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(1000);
  });

  test('login form interaction', async ({ page }) => {
    // Fill in credentials
    await page.locator('input[type="email"]').fill('test_ori1@gmail.com');
    await page.locator('input[type="password"]').fill('test@ori1');
  });
});
