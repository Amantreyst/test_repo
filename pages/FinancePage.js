const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class FinancePage extends BasePage {
  constructor(page) {
    super(page);
    this.summaryTab = page.getByRole('button', { name: 'Summary' });
    this.cashflowTab = page.getByRole('button', { name: 'Cashflow' });
    this.assetClassificationTab = page.getByRole('button', { name: 'Asset Classification' });
    this.remittanceDetailsTab = page.getByRole('button', { name: 'Remittance Details' });
    this.emptyStatePrompt = page.locator('text=Insufficient Data Available')
      .or(page.locator('text=Process your data first'))
      .or(page.locator('text=No Deals Found'));
    this.dealAccordion = page.locator('.accordion button, .accordion > div').first();
  }

  async verifyEmptyState() {
    await expect(this.emptyStatePrompt.first()).toBeVisible({ timeout: 5000 });
    await this.captureScreenshot('07-payout-monitoring', '04-finance-page-empty-state');
    console.log('Finance Page empty state verified');
  }

  async expandFirstDeal() {
    if (await this.dealAccordion.isVisible({ timeout: 4000 }).catch(() => false)) {
      await this.dealAccordion.click();
      await this.page.waitForTimeout(1000);
      await this.captureScreenshot('07-payout-monitoring', '06-deal-folder-expanded');
      console.log('Expanded first deal folder');
    }
  }

  async exploreTab(tabName) {
    const tabMap = {
      'Summary': this.summaryTab,
      'Cashflow': this.cashflowTab,
      'Asset Classification': this.assetClassificationTab,
      'Remittance Details': this.remittanceDetailsTab,
    };

    const tab = tabMap[tabName];
    if (tab && await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(500);
      await this.captureScreenshot('07-payout-monitoring', `07-finance-tab-${tabName.toLowerCase().replace(' ', '-')}`);
      console.log(`Explored FinancePage tab: ${tabName}`);
      return true;
    }
    console.log(`Tab "${tabName}" not visible or not found`);
    return false;
  }

  async exploreAllTabs() {
    const tabs = ['Summary', 'Cashflow', 'Asset Classification', 'Remittance Details'];
    const results = {};

    for (const tabName of tabs) {
      results[tabName] = await this.exploreTab(tabName);
    }

    await this.captureScreenshot('07-payout-monitoring', '07-finance-page-tabs-verified');
    return results;
  }
}

module.exports = FinancePage;