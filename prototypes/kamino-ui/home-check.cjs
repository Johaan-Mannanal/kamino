const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const BASE_URL=(process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5188').replace(/\/$/,'');
const outDir=process.env.KAMINO_EVIDENCE_DIR || path.join(__dirname,'evidence','generated');fs.mkdirSync(outDir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({...(process.env.KAMINO_BROWSER_EXECUTABLE?{executablePath:process.env.KAMINO_BROWSER_EXECUTABLE}:{}),headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0;
 const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
 await page.goto(BASE_URL + '/');await page.waitForSelector('#story canvas');await page.waitForTimeout(350);
 check(await page.locator('#story').evaluate(n=>n.getBoundingClientRect().top===0),'story starts at page origin with no header-sized dead gap');
 await page.evaluate(()=>window.scrollTo(0,25));await page.waitForFunction(()=>Number(document.querySelector('#story').dataset.progress)>.005);check(true,'first wheel movement immediately advances animation');
 const step=await page.locator('#story').evaluate(n=>parseFloat(n.style.getPropertyValue('--story-travel'))/4);
 await page.evaluate(y=>window.scrollTo(0,y),step*.7);await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#story').dataset.progress)-.7)<.001);
 const half=await page.locator('.story-panel').evaluateAll(nodes=>nodes.slice(0,2).map(n=>({opacity:Number(getComputedStyle(n).opacity),transform:getComputedStyle(n).transform})));
 await page.waitForTimeout(300);const settled=await page.locator('.story-panel').evaluateAll(nodes=>nodes.slice(0,2).map(n=>Number(getComputedStyle(n).opacity)));check(settled[0]===0&&settled[1]===1,'caption finishes its animation even when paused between phases');check(await page.locator('.story-panel[aria-hidden="false"]').count()===1,'one readable caption owns the intermediate state');
 check(await page.locator('footer').count()===0,'homepage has no footer');
 await page.screenshot({path:path.join(outDir,'home-text-transition.png')});
 for(const width of [1440,1366,1024,800]){
   await page.setViewportSize({width,height:width===1366?768:900});await page.waitForTimeout(100);
   const distance=await page.locator('#story').evaluate(n=>parseFloat(n.style.getPropertyValue('--story-travel'))/4);await page.evaluate(y=>window.scrollTo(0,y),distance);await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#story').dataset.progress)-1)<.001);
   const rects=await page.evaluate(()=>{const r=s=>{const a=document.querySelector(s).getBoundingClientRect();return {left:a.left,right:a.right,top:a.top,bottom:a.bottom};};return {canvas:r('#story-viewer'),photos:r('#capture-thumbs'),phone:r('#capture-phone')};});
   check(rects.canvas.bottom+12<=rects.photos.top,`photo row has reserved clearance below canvas at ${width}px`);
   check(rects.phone.right+10<=rects.canvas.left,`phone has reserved clearance beside canvas at ${width}px`);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}px`);
   await page.screenshot({path:path.join(outDir,`home-capture-${width}.png`)});
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-chapter="4"]').click();await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#story').dataset.progress)-4)<.001);
 const button=page.locator('.story-panel [data-demo]');const before=await button.evaluate(n=>getComputedStyle(n).backgroundColor);await button.hover();await page.waitForTimeout(300);check(await button.evaluate(n=>getComputedStyle(n).backgroundColor)!==before,'quiet button gains a smooth hover background');
 check(await button.evaluate(n=>getComputedStyle(n).transitionDuration.includes('0.24s')),'hover backgrounds use a timed transition');
 await page.screenshot({path:path.join(outDir,'home-end-preview.png')});await page.locator('[data-chapter="0"]').click();await page.waitForFunction(()=>Number(document.querySelector('#story').dataset.progress)<.001);check(await page.locator('[data-story-panel="0"]').evaluate(n=>Number(getComputedStyle(n).opacity))>.99,'reverse scrolling restores the opening text');
 await page.screenshot({path:path.join(outDir,'home-refined-preview.png')});
 check(errors.length===0,'no browser runtime errors');fs.writeFileSync(path.join(outDir,'home-results.json'),JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
