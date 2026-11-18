const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const DealCreationPage = require('./DealCreationPage');
const { BASE_URL } = require('../fixtures/test-data');

class PayoutMonitoringPage extends BasePage {
  constructor(page) {
    super(page);
    this.uploadButton = page.getByRole('button', { name: /Upload Excel file/i });
    this.fileInput = page.locator('input[type="file"]');
    this.checkStatusBtn = page.getByRole('button', { name: 'Check Status' });
    this.missingDealsBtn = page.getByRole('button', { name: /Create Missing Deals/i });
    this.createBtn = page.getByRole('button', { name: 'Create', exact: true });
    this.searchInput = page.locator('input[placeholder*="Search folder name"]');
    this.batchHistoryBtn = page.locator('button[title*="View Batches History"], .batch-history');
    this.templateBtn = page.locator('button[title*="Download Template"], .template-excel');
    this.dealAccordion = page.locator('.accordion button, .accordion > div').first();
    this.emptyStateText = page.locator('text=No Deals Found, text=No deals found, text=Create New Deal, text=Get Started').first();
    this.createNewDealBtn = page.getByRole('button', { name: /Create New Deal/i }).or(page.getByRole('link', { name: /Create New Deal/i })).first();
  }

  async navigate() {
    await this.page.goto(`${BASE_URL}/da/deal-ori/payout-monitoring`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForURL(/\/da\/deal-ori\/payout-monitoring/, { timeout: 20000 });
    await this.captureScreenshot('07-payout-monitoring', '01-payout-monitoring-home');
  }

  async verifyWorkspaceElements() {
    await expect(this.searchInput).toBeVisible();
    await expect(this.uploadButton).toBeVisible();
    await expect(this.batchHistoryBtn).toBeVisible();
    await expect(this.templateBtn).toBeVisible();
    await this.captureScreenshot('07-payout-monitoring', '02-sidebar-controls-explored');
    console.log('Payout Monitoring workspace elements verified');
  }

  async searchFolder(folderName) {
    await this.searchInput.fill(folderName);
    await this.page.waitForTimeout(500);
    await this.captureScreenshot('07-payout-monitoring', `03-search-${folderName}`);
    console.log(`Searched for folder: ${folderName}`);
  }

  async downloadTemplate() {
    await this.templateBtn.click();
    await this.page.waitForTimeout(2000);
    console.log('Template download triggered');
  }

  async openBatchHistory() {
    await this.batchHistoryBtn.click();
    const modalHeader = this.page.locator('text=Batch History').or(this.page.locator('h3:has-text("Batch")')).first();
    await expect(modalHeader).toBeVisible({ timeout: 8000 });
    await this.captureScreenshot('07-payout-monitoring', '03-batch-history-modal');
    console.log('Batch History modal opened');
  }

  async closeBatchHistory() {
    const modalCloseBtn = this.page.locator('.fixed.inset-0 button:has(svg)').first();
    if (await modalCloseBtn.isVisible().catch(() => false)) {
      await modalCloseBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(500);
    console.log('Batch History modal closed');
  }

  async uploadMonthlyPayoutFiles(filePaths) {
    console.log(`Uploading ${filePaths.length} monthly payout files...`);

    if (await this.uploadButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.uploadButton.click();
    }

    await this.fileInput.setInputFiles(filePaths);
    await this.captureScreenshot('07-payout-monitoring', '02-payout-files-selected');

    let missingDealsFound = false;

    for (let attempt = 1; attempt <= 10; attempt++) {
      if (await this.missingDealsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        missingDealsFound = true;
        console.log(`[Payout Status] Missing Deals button appeared on attempt ${attempt}`);
        break;
      }

      if (await this.checkStatusBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await this.checkStatusBtn.click();
      }

      console.log(`Waiting for payout processing status: ${attempt}/10`);
      await this.page.waitForTimeout(3000);
    }

    await this.captureScreenshot('07-payout-monitoring', '05-payout-processing-finished');

    if (missingDealsFound) {
      await this.captureScreenshot('07-payout-monitoring', '03-missing-deals-detected');
      await this.missingDealsBtn.click();

      if (await this.createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await this.createBtn.click();
        await this.captureScreenshot('07-payout-monitoring', '04-missing-deal-submitted');
        console.log('Handled Missing Deal creation successfully.');
      }
    }

    return { success: true, missingDealsHandled: missingDealsFound };
  }

  async expandFirstDeal() {
    if (await this.dealAccordion.isVisible({ timeout: 4000 }).catch(() => false)) {
      await this.dealAccordion.click();
      await this.page.waitForTimeout(1000);
      await this.captureScreenshot('07-payout-monitoring', '06-deal-folder-expanded');
      console.log('Expanded first deal folder');
    }
  }

  async checkForEmptyDealsState() {
    console.log('[PayoutMonitoring] Checking for empty deals state...');
    
    // Wait for page to fully load
    await this.page.waitForTimeout(2000);
    
    // Check for empty state indicators
    const emptyStateVisible = await this.emptyStateText.isVisible({ timeout: 5000 }).catch(() => false);
    const createBtnVisible = await this.createNewDealBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const accordionVisible = await this.dealAccordion.isVisible({ timeout: 3000 }).catch(() => false);
    
    const isEmpty = emptyStateVisible || createBtnVisible || !accordionVisible;
    
    if (isEmpty) {
      console.log('[PayoutMonitoring] Empty deals state detected');
      await this.captureScreenshot('07-payout-monitoring', '00-empty-deals-state');
    } else {
      console.log('[PayoutMonitoring] Deals found in workspace');
    }
    
    return {
      isEmpty,
      emptyStateVisible,
      createBtnVisible,
      accordionVisible
    };
  }

  async handleEmptyDealsState() {
    console.log('[PayoutMonitoring] Handling empty deals state...');
    
    const state = await this.checkForEmptyDealsState();
    
    if (!state.isEmpty) {
      console.log('[PayoutMonitoring] No empty state - deals already exist');
      return { handled: false, reason: 'deals_exist' };
    }
    
    // Try to click "Create New Deal" button if visible
    if (state.createBtnVisible) {
      console.log('[PayoutMonitoring] Clicking "Create New Deal" button...');
      await this.createNewDealBtn.click();
      await this.page.waitForTimeout(2000);
      
      // Check if we're redirected to deal creation page
      const isDealCreation = this.page.url().includes('/deal-creation');
      if (isDealCreation) {
        console.log('[PayoutMonitoring] Successfully navigated to Deal Creation page');
        return { handled: true, navigated: true, url: this.page.url() };
      }
    }
    
    // Fallback: Use DealCreationPage to navigate and create deal
    console.log('[PayoutMonitoring] Using DealCreationPage to handle empty state...');
    const dealCreation = new DealCreationPage(this.page);
    
    // Navigate to deal creation via dashboard or direct URL
    await this.page.goto(`${BASE_URL}/da/deal-ori/deal-creation`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForURL(/\/da\/deal-ori\/deal-creation/, { timeout: 20000 });
    
    // Open the create deal modal using DealCreationPage
    await dealCreation.openCreateModal();
    
    return { handled: true, navigated: true, url: this.page.url(), usedDealCreationPage: true };
  }

  async ensureDealsExist() {
    console.log('[PayoutMonitoring] Ensuring deals exist before proceeding...');
    
    const state = await this.checkForEmptyDealsState();
    
    if (state.isEmpty) {
      console.log('[PayoutMonitoring] No deals found - initiating deal creation flow');
      return await this.handleEmptyDealsState();
    }
    
    console.log('[PayoutMonitoring] Deals exist - ready for payout monitoring operations');
    return { handled: false, reason: 'deals_exist' };
  }
}

module.exports = PayoutMonitoringPage;