const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const absolutePath = path.resolve('src/public', 'boss1.png');
  const fileUrl = `file://${absolutePath}`;
  await page.goto(fileUrl);
  
  const result = await page.evaluate(() => {
    const img = document.querySelector('img');
    if (!img) return 'No image found';
    
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    // Check which columns are entirely transparent
    const transparentCols = [];
    for (let x = 0; x < canvas.width; x++) {
      let isTransparent = true;
      for (let y = 0; y < canvas.height; y++) {
        const idx = (y * canvas.width + x) * 4;
        if (data[idx + 3] > 0) { // Alpha > 0
          isTransparent = false;
          break;
        }
      }
      if (isTransparent) transparentCols.push(x);
    }
    
    // Check which rows are entirely transparent
    const transparentRows = [];
    for (let y = 0; y < canvas.height; y++) {
      let isTransparent = true;
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        if (data[idx + 3] > 0) {
          isTransparent = false;
          break;
        }
      }
      if (isTransparent) transparentRows.push(y);
    }
    
    // Group consecutive non-transparent indices to find frames
    function findActiveIntervals(transparentIndices, maxVal) {
      const active = new Array(maxVal).fill(true);
      transparentIndices.forEach(idx => active[idx] = false);
      
      const intervals = [];
      let inInterval = false;
      let start = 0;
      for (let i = 0; i < maxVal; i++) {
        if (active[i] && !inInterval) {
          start = i;
          inInterval = true;
        } else if (!active[i] && inInterval) {
          intervals.push({ start, end: i - 1, size: i - start });
          inInterval = false;
        }
      }
      if (inInterval) {
        intervals.push({ start, end: maxVal - 1, size: maxVal - start });
      }
      return intervals;
    }
    
    const colIntervals = findActiveIntervals(transparentCols, canvas.width);
    const rowIntervals = findActiveIntervals(transparentRows, canvas.height);
    
    return {
      width: canvas.width,
      height: canvas.height,
      colIntervals,
      rowIntervals
    };
  });
  
  console.log('Inspection Result:', JSON.stringify(result, null, 2));
  
  await browser.close();
})();
