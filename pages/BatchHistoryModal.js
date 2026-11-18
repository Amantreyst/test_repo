const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class BatchHistoryModal extends BasePage {
  constructor(page) {
    super(page);
    this.triggerButton = page.locator('button[title*="View Batches History"], .batch-history');
    this.modalHeader = page.locator('text=Batch History').or(page.locator('h3:has-text("Batch")')).first();
    this.closeButton = page.locator('.fixed.inset-0 button:has(svg)').first();
    this.batchTable = page.locator('table, [role="grid"]').first();
  }

  async open() {
    await this.triggerButton.click();
    await expect(this.modalHeader).toBeVisible({ timeout: 8000 });
    await this.captureScreenshot('07-payout-monitoring', '03-batch-history-modal');
    console.log('Batch History modal opened');
  }

  async close() {
    if (await this.closeButton.isVisible().catch(() => false)) {
      await this.closeButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(500);
    console.log('Batch History modal closed');
  }

  async verifyModalContent() {
    await expect(this.modalHeader).toBeVisible();
    
    if (await this.batchTable.isVisible({ timeout: 3000 }).catch(() => false)) {
      const rows = await this.batchTable.locator('tbody tr, [role="row"]').count();
      console.log(`Batch History table has ${rows} rows`);
      await this.captureScreenshot('07-payout-monitoring', '03-batch-history-with-data');
    }
  }
}

module.exports = BatchHistoryModal;