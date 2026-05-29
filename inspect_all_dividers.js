const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const absolutePath = path.resolve('src/public', 'boss1.png');
  const fileUrl = `file://${absolutePath}`;
  await page.goto(fileUrl);
  
  const dividers = await page.evaluate(() => {
    const img = document.querySelector('img');
    if (!img) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    // Find vertical grid line columns by looking for local peaks of average brightness
    // along the vertical slice (scanning across x)
    const xPeaks = [];
    const colAvgs = [];
    for (let x = 0; x < canvas.width; x++) {
      let brightnessSum = 0;
      for (let y = 0; y < canvas.height; y++) {
        const idx = (y * canvas.width + x) * 4;
        // brightness formula
        brightnessSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
      }
      colAvgs.push(brightnessSum / canvas.height);
    }
    
    // Find local maxima in colAvgs
    for (let x = 10; x < canvas.width - 10; x++) {
      let isPeak = true;
      const windowSize = 5;
      for (let w = -windowSize; w <= windowSize; w++) {
        if (colAvgs[x + w] > colAvgs[x]) {
          isPeak = false;
          break;
        }
      }
      // Check if it's a solid brightness peak
      if (isPeak && colAvgs[x] > 18) {
        xPeaks.push({ x, val: colAvgs[x] });
        x += windowSize; // Skip ahead
      }
    }
    
    // Do the same for horizontal rows (scanning across y)
    const yPeaks = [];
    const rowAvgs = [];
    for (let y = 0; y < canvas.height; y++) {
      let brightnessSum = 0;
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        brightnessSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
      }
      rowAvgs.push(brightnessSum / canvas.width);
    }
    
    for (let y = 5; y < canvas.height - 5; y++) {
      let isPeak = true;
      const windowSize = 5;
      for (let w = -windowSize; w <= windowSize; w++) {
        if (rowAvgs[y + w] > rowAvgs[y]) {
          isPeak = false;
          break;
        }
      }
      if (isPeak && rowAvgs[y] > 18) {
        yPeaks.push({ y, val: rowAvgs[y] });
        y += windowSize;
      }
    }
    
    return { xPeaks, yPeaks };
  });
  
  console.log('Detected Vertical Dividers (X):', dividers.xPeaks);
  console.log('Detected Horizontal Dividers (Y):', dividers.yPeaks);
  
  await browser.close();
})();
