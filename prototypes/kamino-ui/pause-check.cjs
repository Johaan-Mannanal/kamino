const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const BASE_URL=(process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5188').replace(/\/$/,'');
const outDir=process.env.KAMINO_EVIDENCE_DIR || path.join(__dirname,'evidence','generated');fs.mkdirSync(outDir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({...(process.env.KAMINO_BROWSER_EXECUTABLE?{executablePath:process.env.KAMINO_BROWSER_EXECUTABLE}:{}),headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0;
 const check=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS '+label);};
 await page.goto(BASE_URL + '/');await page.waitForSelector('#story');
 const step=await page.locator('#story').evaluate(n=>parseFloat(n.style.getPropertyValue('--story-travel'))/4);
 const targets=[.45,.5,.55,.7,1.45,1.5,1.55,1.7,2.5,3.5,2.55,1.55,.5];
 for(const p of targets){
  await page.evaluate(y=>scrollTo(0,y),p*step);await page.waitForFunction(value=>Math.abs(Number(document.querySelector('#story').dataset.progress)-value)<.003,p);await page.waitForTimeout(320);
  const state=await page.evaluate(()=>{const active=[...document.querySelectorAll('.story-panel')].filter(n=>n.getAttribute('aria-hidden')==='false');return {count:active.length,opacity:Number(getComputedStyle(active[0]).opacity),animations:document.querySelector('#story-copy').getAnimations({subtree:true}).filter(a=>a.playState==='running').length,scroll:scrollY,progress:Number(document.querySelector('#story').dataset.progress)};});
  check(state.count===1&&state.opacity>.99&&state.animations===0,`pause at ${p} has one fully readable caption and no unfinished text animation`);
  await page.waitForTimeout(100);check(await page.evaluate(()=>scrollY)===state.scroll,`pause at ${p} does not snap or move the page`);
 }
 await page.screenshot({path:path.join(outDir,'paused-between-phases.png')});
 check(errors.length===0,'no browser runtime errors');fs.writeFileSync(path.join(outDir,'pause-results.json'),JSON.stringify({checks,errors,targets},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
