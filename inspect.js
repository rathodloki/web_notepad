const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const absolutePath = path.resolve('src/public', 'boss1.png');
  const fileUrl = `file://${absolutePath}`;
  await page.goto(fileUrl);
  const dimensions = await page.evaluate(() => {
    const img = document.querySelector('img');
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  console.log('boss1.png dimensions:', dimensions);
  
  await browser.close();
})();
