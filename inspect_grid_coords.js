const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const absolutePath = path.resolve('src/public', 'boss1.png');
  const fileUrl = `file://${absolutePath}`;
  await page.goto(fileUrl);
  
  const coords = await page.evaluate(() => {
    const img = document.querySelector('img');
    if (!img) return 'No image';
    
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    // We want to find the first vertical line that runs from near the top to the bottom.
    // In spritesheets, grid lines have a solid color (e.g. grey, white, or blue).
    // Let's analyze column by column to find the column that has a vertical grid line.
    // The vertical line dividing the labels and the frames should be around x = 50 to x = 150.
    // Let's count non-black pixels or look for a line of constant color.
    
    // Let's print the average color of some columns around x = 50 to 120
    const colStats = [];
    for (let x = 0; x < canvas.width; x++) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (let y = 0; y < canvas.height; y++) {
        const idx = (y * canvas.width + x) * 4;
        rSum += data[idx];
        gSum += data[idx+1];
        bSum += data[idx+2];
      }
      const rAvg = rSum / canvas.height;
      const gAvg = gSum / canvas.height;
      const bAvg = bSum / canvas.height;
      colStats.push({ x, avg: (rAvg + gAvg + bAvg) / 3, rAvg, gAvg, bAvg });
    }
    
    // Find the horizontal lines by doing the same for rows around y = 10 to 60
    const rowStats = [];
    for (let y = 0; y < canvas.height; y++) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        rSum += data[idx];
        gSum += data[idx+1];
        bSum += data[idx+2];
      }
      const rAvg = rSum / canvas.width;
      const gAvg = gSum / canvas.width;
      const bAvg = bSum / canvas.width;
      rowStats.push({ y, avg: (rAvg + gAvg + bAvg) / 3, rAvg, gAvg, bAvg });
    }
    
    return {
      width: canvas.width,
      height: canvas.height,
      colStats: colStats.slice(50, 150), // labels border is likely here
      rowStats: rowStats.slice(10, 60)    // header border is likely here
    };
  });
  
  // Let's analyze the stats in Node
  // We look for local peaks of avg color which represent the white/grey grid lines!
  const colStats = coords.colStats;
  const rowStats = coords.rowStats;
  
  console.log('Columns stats (50 to 150):');
  colStats.forEach(s => {
    if (s.avg > 15) { // Threshold for grid line
      console.log(`Column ${s.x}: avg=${s.avg.toFixed(1)} (R:${s.rAvg.toFixed(1)}, G:${s.gAvg.toFixed(1)}, B:${s.bAvg.toFixed(1)})`);
    }
  });
  
  console.log('\nRow stats (10 to 60):');
  rowStats.forEach(s => {
    if (s.avg > 15) {
      console.log(`Row ${s.y}: avg=${s.avg.toFixed(1)} (R:${s.rAvg.toFixed(1)}, G:${s.gAvg.toFixed(1)}, B:${s.bAvg.toFixed(1)})`);
    }
  });
  
  await browser.close();
})();
