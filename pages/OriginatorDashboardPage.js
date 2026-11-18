const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const { BASE_URL } = require('../fixtures/test-data');

class OriginatorDashboardPage extends BasePage {
  constructor(page) {
    super(page);
    this.directAssignmentBtn = page.getByRole('button', { name: 'Direct Assignment' });
    this.dealOriginationBtn = page.getByRole('button', { name: 'Deal Origination' });
    this.dealCreationLink = page.getByRole('link', { name: 'Deal Creation' });
    this.payoutMonitoringLink = page.getByRole('link', { name: 'Payout Monitoring' });
  }

  async verifyDashboardMetrics() {
    await expect(this.page).toHaveURL(/\/originator\/dashboard/);
    await this.captureScreenshot('01-dashboard', '02-originator-metrics-view');
  }

  async navigateToDealCreation() {
    // Try UI navigation first
    try {
      if (await this.directAssignmentBtn.isVisible({ timeout: 5000 })) {
        await this.directAssignmentBtn.click();
        await this.page.waitForTimeout(500);

        if (await this.dealOriginationBtn.isVisible({ timeout: 3000 })) {
          await this.dealOriginationBtn.hover();
          await this.dealOriginationBtn.click();
          await this.page.waitForTimeout(500);
        }

        if (await this.dealCreationLink.isVisible({ timeout: 3000 })) {
          await this.dealCreationLink.click();
        } else {
          // Direct fallback if dropdown collapsed
          await this.page.goto(`${BASE_URL}/da/deal-ori/deal-creation`);
        }
      } else {
        await this.page.goto(`${BASE_URL}/da/deal-ori/deal-creation`);
      }
    } catch {
      await this.page.goto(`${BASE_URL}/da/deal-ori/deal-creation`);
    }

    await this.page.waitForURL(/\/da\/deal-ori\/deal-creation/, { timeout: 20000 });
    await this.captureScreenshot('02-deal-creation', '01-deal-creation-page');
    console.log('Navigated to Deal Creation page');
  }

  async navigateToPayoutMonitoring() {
    try {
      if (await this.directAssignmentBtn.isVisible({ timeout: 5000 })) {
        await this.directAssignmentBtn.click();
        await this.page.waitForTimeout(500);

        if (await this.dealOriginationBtn.isVisible({ timeout: 3000 })) {
          await this.dealOriginationBtn.hover();
          await this.dealOriginationBtn.click();
          await this.page.waitForTimeout(500);
        }

        if (await this.payoutMonitoringLink.isVisible({ timeout: 3000 })) {
          await this.payoutMonitoringLink.click();
        } else {
          await this.page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`);
        }
      } else {
        await this.page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`);
      }
    } catch {
      await this.page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`);
    }

    await this.page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });
    await this.captureScreenshot('07-payout-monitoring', '01-payout-monitoring-page');
    console.log('Navigated to Payout Monitoring page');
  }
}

module.exports = OriginatorDashboardPage;

