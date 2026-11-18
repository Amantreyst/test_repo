const path = require('path');
const fs = require('fs');
const { expect } = require('@playwright/test');
const { PATHS } = require('../fixtures/test-data');

class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Capture screenshot categorized by module/subfolder
   * @param {string} moduleFolder
   * @param {string} filename
   */
  async captureScreenshot(moduleFolder, filename) {
    const targetDir = path.join(PATHS.RESULT_DIR, moduleFolder);
    fs.mkdirSync(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, `${filename}.png`);
    await this.page.screenshot({ path: fullPath, fullPage: true });
    console.log(`[Screenshot Captured] ${moduleFolder}/${filename}.png`);
    return fullPath;
  }

  /**
   * Get text of any visible toast notification
   */
  async getToastMessage(timeout = 5000) {
    const toastLocator = this.page.locator('.Toastify__toast-body, .Toastify__toast');
    try {
      await toastLocator.first().waitFor({ state: 'visible', timeout });
      return await toastLocator.first().textContent();
    } catch {
      return null;
    }
  }

  /**
   * Check and close SweetAlert2 modal if present
   */
  async handleSwalModal() {
    const swalModal = this.page.locator('.swal2-popup');
    if (await swalModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const title = await this.page.locator('.swal2-title').textContent().catch(() => '');
      const content = await this.page.locator('.swal2-html-container').textContent().catch(() => '');
      console.log(`[Swal Alert Detected] Title: "${title?.trim()}", Message: "${content?.trim()}"`);
      
      const confirmBtn = this.page.locator('.swal2-confirm');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
      return { title: title?.trim(), content: content?.trim() };
    }
    return null;
  }
}

module.exports = BasePage;

