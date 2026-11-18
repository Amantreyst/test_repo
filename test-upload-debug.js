const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('response', res => {
    if (res.url().includes('bulk-upload')) {
      console.log('[NETWORK RES]', res.url(), res.status());
    }
  });

  await page.goto('http://localhost:5173/login');
  await page.locator('#email, input[name="email"]').first().fill('test_ori1@gmail.com');
  await page.locator('#password, input[name="password"]').first().fill('test@ori1');
  await page.locator('button[type="submit"]:has-text("Sign In")').first().click();

  const loginHere = page.getByRole('button', { name: 'Login Here' });
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (page.url().includes('dashboard')) break;
    if (await loginHere.isVisible().catch(() => false)) {
      await loginHere.click();
      break;
    }
    await page.waitForTimeout(500);
  }
  await page.waitForURL(/dashboard/);

  await page.goto('http://localhost:5173/da/deal-ori/payout-monitoring');
  await page.waitForURL(/payout-monitoring/);

  console.log('[NODE] Setting input files...');
  const fileInput = page.locator('input[type="file"][accept*=".xlsx"]');
  await fileInput.first().setInputFiles('c:/Users/Dell/OneDrive/Desktop/learnig/UBI-136/May-25.xlsx');
  
  await page.waitForTimeout(8000);

  const modal = page.locator('.fixed.inset-0');
  if (await modal.isVisible()) {
    console.log('[MODAL TEXT]:', await modal.innerText());
  } else {
    console.log('[MODAL NOT VISIBLE]');
  }

  await browser.close();
})();
