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
    await page.waitForFunction(()=>physicalModel.analysis?.rftState==='ready');
    assert(await page.evaluate(()=>physicalModel.analysis.rft.energyError<.002 && physicalModel.analysis.fftEnergyError<1e-8 && physicalModel.analysis.dctEnergyError<1e-8));

    assert(await page.evaluate(()=>plate.lastReport && plate.lastReport.rms>0 && Math.max(...plate.E)>0 && plate.mass>0));
    await page.evaluate(()=>{
      const tone=ctx.createOscillator(), gain=ctx.createGain();tone.frequency.value=440;gain.gain.value=.035;
      tone.connect(gain);tone.start();useSource(gain,true,()=>tone.stop());plate.reset();plate.mass=.65;
    });
    await page.waitForTimeout(5000);
    assert(await page.evaluate(()=>plate.hit<.1 && Math.abs(plate.pitch-440)<10));
    await page.waitForFunction(()=>Math.abs(physicalModel.analysis?.fft.frequencyHz-440)<15);
    await page.locator('#signalDetails summary').click();
    assert(await page.locator('#signalStatus').innerText().then(text=>text.includes('NUDFT')&&text.includes('RFT ready')));
    await page.screenshot({path:'/tmp/cymantix-refined-original.png',fullPage:true});
    // Exercise the actual tab-capture source handler using a real synthetic MediaStream.
    await page.evaluate(()=>{
      window.captureDestination=ctx.createMediaStreamDestination();window.captureTone=ctx.createOscillator();
      captureTone.frequency.value=880;captureTone.connect(captureDestination);captureTone.start();
      navigator.mediaDevices.getDisplayMedia=async()=>captureDestination.stream;
    });
    await page.click('#bTab');
    await page.waitForFunction(()=>Math.abs(physicalModel.analysis?.fft.frequencyHz-880)<15);
    assert(await page.evaluate(()=>outGain.gain.value===0 && physicalModel.analysis.reconstructionError<1e-8 && plate.lastReport.rms>0));
    await page.evaluate(()=>{
      captureTone.stop();const track=captureDestination.stream.getAudioTracks()[0];track.stop();track.dispatchEvent(new Event('ended'));
    });
    assert(await page.locator('#st').innerText().then(text=>text.includes('sharing ended')));
    await page.click('#bDemo');
    await page.click('#bShape');
    await page.waitForFunction(()=>plate.shape==='circle' && plate.lastReport?.energy.length===plate.mf.length && plate.mass>0);
    assert(await page.evaluate(()=>Math.abs(plate.mf[0]-224.748)<.1), 'Clamped circular fundamental');
    await page.click('#bShake');
    assert(await page.evaluate(()=>plate.falling));
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(base+'?cpu');await page.click('#bDemo');await page.waitForTimeout(1000);
    assert(await page.evaluate(()=>!plate.gpu && plate.lastReport && Math.max(...plate.E)>0));
    assert.deepEqual(errors,[]);
    console.log('PASS: original controls, HD GPU/CPU, five live transforms, signal view, captured MediaStream routing/no echo, capture ended, steady tone, circular plate, shake, mobile.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
