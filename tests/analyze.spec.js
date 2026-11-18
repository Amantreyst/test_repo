const { test, expect } = require('@playwright/test');

test('analyze login page', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const html = await page.content();
  console.log('=== PAGE CONTENT ===');
  console.log(html.substring(0, 2000));
  
  // Take screenshot
  await page.screenshot({ path: 'login-screenshot.png', fullPage: true });
  
  // Get all inputs
  const inputs = await page.locator('input').all();
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const name = await inputs[i].getAttribute('name');
    const id = await inputs[i].getAttribute('id');
    const placeholder = await inputs[i].getAttribute('placeholder');
    console.log(`Input ${i}: type=${type}, name=${name}, id=${id}, placeholder=${placeholder}`);
  }
  
  // Get all buttons
  const buttons = await page.locator('button').all();
  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].textContent();
    const type = await buttons[i].getAttribute('type');
    console.log(`Button ${i}: type=${type}, text="${text}"`);
  }
});
