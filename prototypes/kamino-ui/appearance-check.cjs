const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const BASE_URL=(process.env.KAMINO_BASE_URL || 'http://127.0.0.1:5188').replace(/\/$/,'');
const outDir=process.env.KAMINO_EVIDENCE_DIR || path.join(__dirname,'evidence','generated');fs.mkdirSync(outDir,{recursive:true});
(async()=>{
const browser=await chromium.launch({...(process.env.KAMINO_BROWSER_EXECUTABLE?{executablePath:process.env.KAMINO_BROWSER_EXECUTABLE}:{}),headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS '+label);};
await page.addInitScript(()=>sessionStorage.setItem('kamino-font-preview','editorial'));
await page.goto(BASE_URL);await page.waitForSelector('.projected-grid');
check(await page.locator('.site-header .brand').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))>=23,'wordmark is larger');
check(await page.locator('.nav-upload').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))>=14,'header navigation is larger');
check(await page.locator('footer').count()===0,'footer removed from DOM');
check(await page.locator('.font-preview,.font-trigger,#font-options').count()===0,'font toggle and menu are removed');
check(await page.evaluate(()=>document.documentElement.dataset.typography)==='studio','Studio replaces any old saved font preview');
check((await page.locator('[data-story-panel="0"] h1').evaluate(n=>getComputedStyle(n).fontFamily)).includes('Segoe UI'),'Studio typography is applied');
await page.mouse.move(900,180);await page.waitForTimeout(400);check(await page.locator('.cursor-glow').evaluate(n=>getComputedStyle(n).opacity)==='1','fine pointer shows a subtle glow');check(await page.locator('.cursor-glow').evaluate(n=>getComputedStyle(n).pointerEvents)==='none','glow cannot intercept buttons or inputs');
for(const route of ['upload','workspace','creating']){
 await page.evaluate(value=>location.hash=value,route);await page.waitForFunction(value=>document.documentElement.dataset.page===value,route);await page.mouse.move(850,220);check(await page.locator('.cursor-glow').evaluate(n=>getComputedStyle(n).display)==='none',`cursor glow is absent on ${route}`);
}
await page.evaluate(()=>location.hash='home');await page.waitForSelector('#story');await page.mouse.move(800,240);await page.waitForTimeout(400);check(await page.locator('.cursor-glow').evaluate(n=>getComputedStyle(n).opacity)==='1','cursor glow returns only on the homepage');
const travel=await page.locator('#story').evaluate(n=>parseFloat(n.style.getPropertyValue('--story-travel'))/4);
let previous=0;for(const p of [1.1,1.2]){await page.evaluate(y=>window.scrollTo(0,y),travel*p);await page.waitForFunction(value=>Math.abs(Number(document.querySelector('#story').dataset.progress)-value)<.001,p);const scale=await page.locator('.story-progress-fill').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a);check(Math.abs(scale-p/4)<.001&&scale>previous,`progress advances continuously at chapter ${p}`);previous=scale;}
await page.locator('[data-chapter="4"]').click();await page.waitForFunction(()=>Number(document.querySelector('#story').dataset.progress)>3.999);check(await page.getByRole('progressbar',{name:'Homepage progress'}).getAttribute('aria-valuenow')==='100','end of story reports full progress');check(await page.locator('#scroll-label').innerText()==='','extra closing line removed');
await page.setViewportSize({width:390,height:844});await page.goto(BASE_URL + '/#home');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'larger mobile header fits without overflow');check(await page.locator('.font-trigger').count()===0,'mobile header has no font toggle');
await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.cursor-glow').evaluate(n=>getComputedStyle(n).display)==='none','reduced motion disables cursor glow');
check(errors.length===0,'no runtime errors');fs.writeFileSync(path.join(outDir,'appearance-results.json'),JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
