const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
for(const cpu of [false,true]){
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.bringToFront();
 await page.goto('http://127.0.0.1:8765/'+(cpu?'?cpu':''));await page.waitForFunction(()=>modelReady);
 await page.click('#bDemo');await page.waitForFunction(()=>plate.lastField&&physicalModel.analysis?.rft);
 await page.waitForTimeout(6000);
 const report=await page.evaluate(()=>({visibility:document.visibilityState,gpu:!!plate.gpu,modes:plate.mf.length,rank:plate.lastField.rank,coverage:plate.lastField.coverage,rms:plate.lastField.rms,level:plate.level,computeMs:plate.lastField.computeMs,fft:physicalModel.analysis.fft.frequencyHz,workletSeconds:physicalModel.endSample/ctx.sampleRate,lag:(physicalModel.endSample-plate.lastField.endSample)/ctx.sampleRate,fftError:physicalModel.analysis.fftEnergyError}));
 assert.equal(report.gpu,!cpu);assert(report.modes===128);assert(report.coverage>.99);assert(report.rms>0&&report.level>0);assert(report.lag<1,`Display latency exceeds one second: ${JSON.stringify(report)}`);assert(report.fftError<1e-10);
 await page.screenshot({path:`/tmp/cymantix-lab-${cpu?'cpu':'gpu'}.png`,fullPage:true});
 await page.click('#bField');await page.screenshot({path:`/tmp/cymantix-field-${cpu?'cpu':'gpu'}.png`,fullPage:true});
 await page.click('#bStop');await page.waitForFunction(()=>plate.level===0&&physicalModel.analysis.rms<1e-6);
 // Test channel routing with an actual MediaStream while replacing only chooser UI.
 await page.evaluate(()=>{window.capturedTone=ctx.createOscillator();capturedTone.frequency.value=660;const gain=ctx.createGain();gain.gain.value=.2;window.capturedStream=ctx.createMediaStreamDestination();capturedTone.connect(gain);gain.connect(capturedStream);capturedTone.start();navigator.mediaDevices.getDisplayMedia=async()=>capturedStream.stream;});
 await page.click('#bTab');await page.waitForFunction(()=>Math.abs(physicalModel.analysis?.fft.frequencyHz-660)<20);assert(await page.evaluate(()=>outGain.gain.value===0));
 await page.click('#bShape');await page.waitForFunction(()=>plate.shape==='circle'&&plate.lastField);assert(await page.evaluate(()=>plate.set.boundary==='free'));
 await page.click('#bStop');await page.waitForFunction(()=>plate.level===0);
 // Exercise the real file/decode/media-element route with a generated WAV.
 const wav=Buffer.alloc(44+48000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(96000,40);for(let i=0;i<48000;i++)wav.writeInt16LE(Math.round(6500*Math.sin(2*Math.PI*550*i/48000)),44+2*i);
 await page.locator('#fi').setInputFiles({name:'test-tone.wav',mimeType:'audio/wav',buffer:wav});await page.waitForFunction(()=>Math.abs(physicalModel.analysis?.fft.frequencyHz-550)<2);assert(await page.evaluate(()=>outGain.gain.value===1));
 await page.click('#bStop');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log(cpu?'CPU':'GPU',report);await page.close();
}
console.log('PASS: live worklet, covariance field, five transforms, square/circle, GPU/CPU, shared-tab routing/no echo, silence, mobile.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
