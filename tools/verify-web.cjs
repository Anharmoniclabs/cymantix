// Serve with python -m http.server 8765; run with Playwright installed.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1100,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.CYMANTIX_URL || 'http://127.0.0.1:8765/';
  try {
    await page.goto(base);
    await page.waitForFunction(()=>modeSets.square && plate.rftState !== 'building');
    assert.deepEqual(await page.locator('button').evaluateAll(els=>els.map(e=>e.id)),['bDemo','bTab','bShake','bShape']);
    assert.equal(await page.locator('input').count(),0);
    assert(await page.evaluate(()=>!!plate.gpu && cv.width===1024 && plate.gpu.canvas.width===1024));
    await page.click('#bDemo');
    await page.waitForTimeout(1200);
    assert(await page.evaluate(()=>plate.level>.1 && plate.mass>0));
    await page.evaluate(()=>{
      const tone=ctx.createOscillator(), gain=ctx.createGain();tone.frequency.value=440;gain.gain.value=.035;
      tone.connect(gain);tone.start();useSource(gain,true,()=>tone.stop());plate.reset();plate.mass=.65;
    });
    await page.waitForTimeout(5000);
    assert(await page.evaluate(()=>plate.hit<.1 && Math.abs(plate.pitch-440)<10));
    await page.screenshot({path:'/tmp/cymantix-refined-original.png',fullPage:true});
    await page.click('#bShape');
    await page.waitForFunction(()=>plate.shape==='circle');
    await page.click('#bShake');
    assert(await page.evaluate(()=>plate.falling));
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(base+'?cpu');await page.click('#bDemo');await page.waitForTimeout(1000);
    assert(await page.evaluate(()=>!plate.gpu && plate.level>.1));
    assert.deepEqual(errors,[]);
    console.log('PASS: original four controls, no inputs, HD GPU, demo, stable tone, circular plate, shake, mobile, CPU fallback.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
