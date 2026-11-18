const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const { DEAL_DEFAULTS } = require('../fixtures/test-data');

class DealCreationPage extends BasePage {
  constructor(page) {
    super(page);
    this.createDealBtn = page.getByRole('button', { name: 'Create Deal' });
    this.dealNameInput = page.locator('input[name="dealName"]');
    this.poolValueInput = page.locator('input[name="originalPoolValue"]');
    this.tempDealInput = page.locator('#react-select-2-input');
    this.investorInput = page.locator('#react-select-3-input');
    this.lanFileInput = page.locator('#loan-info-upload');
    this.validateLanBtn = page.getByRole('button', { name: 'Validate' });
    this.addSettingsBtn = page.getByRole('button', { name: 'Add Settings' });
    this.editSettingsBtn = page.getByRole('button', { name: 'Edit Settings' });
    this.submitDealBtn = page.getByRole('button', { name: 'Create', exact: true });
    
    // Duplicate LAN Modal elements
    this.duplicateLanModal = page.locator('div:has-text("Duplicate LAN(s) Found")');
    this.duplicateModalCloseBtn = page.locator('div:has-text("Duplicate LAN(s) Found")').locator('button:has-text("Close"), button:has(svg)').first();
  }

  async openCreateModal() {
    await this.createDealBtn.click();
    await expect(this.dealNameInput).toBeVisible({ timeout: 10000 });
    await this.captureScreenshot('02-deal-creation', '02-create-deal-modal-open');
  }

  async fillBasicDetails({
    dealName = DEAL_DEFAULTS.generateUniqueDealName(),
    poolValue = DEAL_DEFAULTS.poolValue,
    investorSearch = DEAL_DEFAULTS.investorSearch,
    investorOptionText = DEAL_DEFAULTS.investorOptionText
  } = {}) {
    // Fill deal name
    await this.dealNameInput.fill(dealName);
    await this.dealNameInput.press('Enter');

    // Fill pool value
    await this.poolValueInput.fill(poolValue);
    await this.poolValueInput.press('Tab');

    // Fill investor selection
    if (await this.investorInput.isVisible().catch(() => false)) {
      await this.investorInput.fill(investorSearch);
      await this.page.waitForTimeout(500);
      
      const option = this.page.getByRole('option', { name: investorOptionText }).or(
        this.page.locator(`div[id*="react-select-3-option"]:has-text("${investorSearch}")`)
      ).first();
      
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
      } else {
        // Fallback: press Enter on first filtered option
        await this.investorInput.press('Enter');
      }
    }

    await this.captureScreenshot('02-deal-creation', '03-basic-details-entered');
    console.log(`Filled basic details with Deal Name: ${dealName}`);
    return dealName;
  }

  async uploadAndValidateLAN(filePath) {
    console.log(`Uploading LAN file: ${filePath}`);
    await this.lanFileInput.setInputFiles(filePath);

    // Verify upload tag shows in UI
    await expect(
      this.page.locator('.bg-green-50, :has-text(".xlsx")').first()
    ).toBeVisible({ timeout: 10000 });

    await this.captureScreenshot('03-lan-validation', '01-lan-file-selected');

    // Click validate
    await this.validateLanBtn.click();

    // Check for duplicate LAN modal popup
    const dupModalAppeared = await this.page.locator('text=Duplicate LAN(s) Found')
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    if (dupModalAppeared) {
      console.warn('⚠️ Duplicate LANs detected in existing deals! Handling duplicate dialog...');
      await this.captureScreenshot('05-duplicate-handling', '01-duplicate-lan-dialog-detected');
      
      // Close the duplicate modal gracefully
      const closeBtn = this.page.getByRole('button', { name: 'Close' })
        .or(this.page.locator('button:has-text("Close")'))
        .last();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
      return { status: 'DUPLICATE_LANS_DETECTED', isValid: false };
    }

    // Wait for validation results banner
    const resultHeader = this.page.getByText('Validation Results', { exact: false }).first();
    await expect(resultHeader).toBeVisible({ timeout: 25000 });
    await this.captureScreenshot('03-lan-validation', '02-lan-validation-results');

    console.log('LAN validation completed successfully');
    return { status: 'VALIDATED', isValid: true };
  }

  async configureDealSettings({
    dealType = 'Others',
    disbursementDate = DEAL_DEFAULTS.dateOfDisbursement,
    payoutDay = DEAL_DEFAULTS.payoutDay,
    assigneeShare = DEAL_DEFAULTS.assigneeShare,
    assignorShare = DEAL_DEFAULTS.assignorShare,
    benchmarkType = DEAL_DEFAULTS.benchmarkType
  } = {}) {
    // Select Deal Type radio
    const radioBtn = this.page.getByRole('radio', { name: dealType });
    if (await radioBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await radioBtn.check();
    } else {
      await this.page.locator(`input[type="radio"][value="${dealType}"]`).check({ force: true });
    }

    // Open settings modal
    const settingsBtn = (await this.editSettingsBtn.isVisible()) ? this.editSettingsBtn : this.addSettingsBtn;
    await settingsBtn.click();

    const disbursementInput = this.page.locator('input[name="dateofDisbursement"]');
    await expect(disbursementInput).toBeVisible({ timeout: 8000 });

    // Fill settings fields
    await disbursementInput.fill(disbursementDate);

    const payoutInput = this.page.locator('input[name="payoutDay"]').or(
      this.page.getByRole('textbox', { name: /Enter payout day/i })
    ).first();
    await payoutInput.fill(payoutDay);

    const assigneeInput = this.page.locator('input[name="assigneeShare"]').or(
      this.page.getByRole('textbox', { name: /assignee share/i })
    ).first();
    await assigneeInput.fill(assigneeShare);

    const assignorInput = this.page.locator('input[name="assignorShare"]').or(
      this.page.getByRole('textbox', { name: /assignor share/i })
    ).first();
    await assignorInput.fill(assignorShare);

    const benchmarkSelect = this.page.locator('select[name="benchmarkType"]');
    if (await benchmarkSelect.isVisible().catch(() => false)) {
      await benchmarkSelect.selectOption(benchmarkType);
    }

    const t1Checkbox = this.page.getByRole('checkbox', { name: /T1 Actual Days/i });
    if (await t1Checkbox.isVisible().catch(() => false)) {
      await t1Checkbox.check();
    }

    await this.captureScreenshot('04-deal-settings', '01-deal-settings-modal');

    // Save Settings
    await this.page.getByRole('button', { name: 'Save Settings' }).click();
    await this.page.waitForTimeout(1000);
    console.log('Deal settings configured and saved');
  }

  async submitDeal(dealName) {
    await this.submitDealBtn.click();

    // Check if duplicate deal name error appears (toast or alert)
    const toastMsg = await this.getToastMessage(4000);
    const swalAlert = await this.handleSwalModal();

    if (toastMsg && toastMsg.toLowerCase().includes('already exists')) {
      console.warn(`⚠️ Duplicate Deal Name Detected: "${toastMsg}"`);
      await this.captureScreenshot('05-duplicate-handling', '02-duplicate-deal-toast-detected');
      return { success: false, reason: 'DUPLICATE_DEAL_NAME', message: toastMsg };
    }

    if (swalAlert && swalAlert.title.toLowerCase().includes('invalid')) {
      return { success: false, reason: 'INVALID_INPUT', message: swalAlert.content };
    }

    // Wait for deal to appear in list or modal to close
    try {
      await expect(this.page.getByText(dealName, { exact: false }).first()).toBeVisible({ timeout: 20000 });
      await this.captureScreenshot('02-deal-creation', '04-deal-created-successfully');
      console.log(`Deal "${dealName}" created successfully and listed.`);
      return { success: true, dealName };
    } catch {
      // Check if modal closed
      const isModalStillOpen = await this.dealNameInput.isVisible().catch(() => false);
      if (isModalStillOpen) {
        await this.captureScreenshot('02-deal-creation', '04-deal-creation-modal-state');
      }
      return { success: !isModalStillOpen, dealName };
    }
  }

  async verifyDealTabsAndGo() {
    const tabs = ['Parties', 'Settings', 'Documents', 'Services'];

    for (const tab of tabs) {
      const tabButton = this.page.getByRole('button', { name: tab, exact: true });
      if (await tabButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tabButton.click();
        await this.page.waitForTimeout(500);
        console.log(`Verified deal tab: ${tab}`);
      }
    }

    // Return to Services and click Create & Go
    const servicesTab = this.page.getByRole('button', { name: 'Services', exact: true });
    if (await servicesTab.isVisible()) {
      await servicesTab.click();
      const createAndGoBtn = this.page.getByRole('button', { name: 'Create & Go' }).first();
      if (await createAndGoBtn.isVisible()) {
        await createAndGoBtn.click();
        await this.captureScreenshot('02-deal-creation', '05-services-create-and-go');
      }
    }
  }
}

module.exports = DealCreationPage;

