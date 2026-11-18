const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const { BASE_URL, CREDENTIALS } = require('../fixtures/test-data');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.emailInput = page.locator('#email, input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('#password, input[name="password"], input[type="password"]');
    this.signInButton = page.locator('button[type="submit"]:has-text("Sign In"), form button:has-text("Sign In")');
    this.landingSignInBtn = page.getByRole('button', { name: 'Sign In' });
    this.loginHereButton = page.getByRole('button', { name: 'Login Here' });
  }

  async navigate() {
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  }

  async login(email = CREDENTIALS.originator.email, password = CREDENTIALS.originator.password) {
    await this.navigate();
    
    // Check if on landing page or login page
    if (!(await this.emailInput.first().isVisible().catch(() => false))) {
      if (await this.landingSignInBtn.isVisible()) {
        await this.landingSignInBtn.click();
      }
    }

    await expect(this.emailInput.first()).toBeVisible({ timeout: 10000 });
    await this.emailInput.first().fill(email);
    await this.passwordInput.first().fill(password);
    
    await this.signInButton.first().click();

    // Handle Active Session Detected modal or direct redirect
    const loginHereButton = this.page.getByRole('button', { name: 'Login Here' });
    const startTime = Date.now();

    while (Date.now() - startTime < 15000) {
      if (this.page.url().includes('/originator/dashboard')) {
        break;
      }

      if (await loginHereButton.isVisible().catch(() => false)) {
        console.log('Active session detected. Clicking "Login Here"...');
        await loginHereButton.click();
        await this.page.waitForTimeout(1000);
        break;
      }

      await this.page.waitForTimeout(500);
    }

    // Wait for successful login redirect
    await this.page.waitForURL(/\/originator\/dashboard\/?$/, { timeout: 35000 });
    await this.captureScreenshot('01-dashboard', '01-originator-dashboard-loaded');
    console.log('Successfully logged in as Originator.');
  }
}

module.exports = LoginPage;
