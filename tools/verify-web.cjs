// Run against a local HTTP server: NODE_PATH=/path/to/node_modules node tools/verify-web.cjs
// Optional CHROMIUM_EXECUTABLE_PATH; otherwise Playwright's installed Chromium is used.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const base = process.env.CYMANTIX_URL || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const errors = [], results = [];
  const page = await browser.newPage({viewport: {width: 1440, height: 1050}});
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    await page.waitForFunction(() => plate.rftState !== 'building' && modeSets.square);
    assert(await page.evaluate(() => !!plate.gpu), 'WebGL2 sand should start');
    await page.click('#bTone');
    await page.waitForFunction(() => wideband.meterState === 'continuous');
    for (const frequency of [20, 30, 55, 110, 220, 440, 1000, 4000, 7500, 9000, 12000, 16000, 19000, 20000]) {
      await page.evaluate(f => toneOsc.frequency.setValueAtTime(f, ctx.currentTime), frequency);
      await page.waitForTimeout(1000);
      const result = await page.evaluate(() => ({frequency: wideband.pitch, level: plate.level, energy: Math.max(...plate.E), rms: wideband.rms}));
      assert(Math.abs(result.frequency-frequency)/frequency < 0.035, `${frequency} Hz measured ${result.frequency}`);
      assert(result.energy > 0 && result.level > .1, `${frequency} Hz must move sand`);
      results.push({inputHz: frequency, measuredHz: +result.frequency.toFixed(2)});
    }
    // Quiet recordings automatically recover after a loud passage, without playback gain.
    assert(await page.locator('#sensitivity, #noiseFloor').count() === 0, 'Manual sensitivity controls must be removed');
    await page.evaluate(() => { toneOsc.frequency.setValueAtTime(440, ctx.currentTime); srcNode.gain.value = 1e-5; });
    await page.waitForFunction(() => plate.level > .1 && Math.abs(wideband.pitch - 440) < 10 && wideband.rms < .00001, null, {timeout: 10000});
    assert(await page.evaluate(() => inputGain.gain.value === 1 && srcNode.gain.value < .000011), 'Auto response must not amplify playback');
    await page.evaluate(() => { srcNode.gain.value = 0; });
    await page.waitForFunction(() => plate.level < .01, null, {timeout: 10000});
    // Anti-phase stereo cancels in mono: both channels must still be detected and excite the plate.
    await page.evaluate(() => {
      const oscillator = ctx.createOscillator(), left = ctx.createGain(), right = ctx.createGain(), merge = ctx.createChannelMerger(2);
      oscillator.frequency.value = 1000; left.gain.value = .1; right.gain.value = -.1;
      oscillator.connect(left); oscillator.connect(right); left.connect(merge,0,0); right.connect(merge,0,1); oscillator.start();
      useSource(merge, false, () => oscillator.stop());
    });
    await page.waitForTimeout(1000);
    assert(await page.evaluate(() => Math.abs(wideband.pitch-1000)<10 && plate.level>.1 && Math.max(...plate.E)>0), 'Anti-phase stereo should remain visible');
    await page.click('#bStop');
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => !srcNode && plate.level === 0 && wideband.pitch === 0), 'Stop must clear source and signal');
    // The worklet must retain a burst even if the visual thread misses that audio window.
    await page.evaluate(async () => {
      const data = ctx.createBuffer(1, Math.ceil(ctx.sampleRate*.002), ctx.sampleRate); data.getChannelData(0).fill(.5);
      const source = ctx.createBufferSource(); source.buffer = data;
      window.testMeter = new AudioWorkletNode(ctx, 'cymantix-meter');
      window.testBurst = new Promise(resolve => testMeter.port.onmessage = ({data}) => resolve(data));
      source.connect(testMeter); testMeter.connect(ctx.destination); source.start();
    });
    await page.waitForTimeout(250);
    const burst = await page.evaluate(async () => { testMeter.port.postMessage('read'); const data=await testBurst; testMeter.disconnect(); return data; });
    assert(burst.peak === .5 && burst.block > .1, 'Continuous meter must retain a 2 ms burst');
    await page.click('#bMic');
    await page.waitForFunction(() => srcNode?.mediaStream);
    await page.evaluate(() => window.testTrack = srcNode.mediaStream.getAudioTracks()[0]);
    await page.click('#bStop');
    assert(await page.evaluate(() => testTrack.readyState === 'ended'), 'Stop must release microphone');
    await page.click('#bShape');
    await page.waitForFunction(() => plate.shape === 'circle');
    await page.click('#bDemo');
    await page.waitForTimeout(2000);
    assert(await page.evaluate(() => plate.level > .1 && plate.top), 'Circular demo should react');
    await page.click('#bShape');
    await page.waitForFunction(() => plate.shape === 'square');
    await page.click('#bTone');
    await page.waitForTimeout(3500);
    assert(await page.evaluate(() => plate.hit < .1 && plate.amp[8] < plate.amp[9] * .2), 'Steady tone must not create false beat scatter or strong off-resonance modes');
    await page.screenshot({path: '/tmp/cymantix-desktop.png', fullPage: true});
    // File playback and source replacement use one media-element source and release captures.
    const wav=Buffer.alloc(44+44100*2); wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(44100,24); wav.writeUInt32LE(88200,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
    for(let i=0;i<44100;i++)wav.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*880*i/44100)),44+2*i);
    await page.locator('#fileInput').setInputFiles({name:'test-tone.wav',mimeType:'audio/wav',buffer:wav});
    await page.waitForTimeout(600);
    assert(await page.evaluate(() => !$('player').paused && Math.abs(wideband.pitch-880)<20), 'File playback must analyse audio');
    await page.click('#bStop');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({width, height:844});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px layout must not overflow`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/cymantix-mobile.png',fullPage:true});
    // No WebGL and missing analysis assets must remain usable.
    const fallback = await browser.newPage();
    fallback.on('pageerror',e=>errors.push(e.message));
    await fallback.route('**/data/rft_*.bin', route=>route.abort());
    await fallback.goto(base+'?cpu');
    await fallback.click('#bDemo');
    await fallback.waitForTimeout(1500);
    assert(await fallback.evaluate(()=>!plate.gpu && plate.level>.1 && plate.rftState==='failed'), 'CPU/FFT fallback should work');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status:'PASS', toneSweep:results, checks:['GPU render','20 Hz–20 kHz sweep','automatic quiet-input response and silence','anti-phase stereo','stop/reset','2 ms burst retention','microphone release','square/circular demo','file playback','390/768/1440px layout','CPU and missing-RFT fallback'], pageErrors:errors},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
