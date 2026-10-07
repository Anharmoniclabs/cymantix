const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/');
 await page.click('#bDemo');
 await page.evaluate(()=>{
   window.testTone=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=.2;
   testTone.frequency.value=523.25;testTone.connect(gain);testTone.start();useSource(gain,true,()=>testTone.stop());
   const analyse=plate.analyse.bind(plate);
   plate.analyse=samples=>{window.lastSandPCM=Array.from(samples);analyse(samples);};
   const post=Worker.prototype.postMessage;
   Worker.prototype.postMessage=function(data,...args){
     if(data.pcm)window.measurementPCM=Array.from(data.pcm);
     return post.call(this,data,...args);
   };
 });
 await page.waitForFunction(()=>signalReport?.rftState==='ready'&&Math.abs(signalReport.fft.frequencyHz-523.25)<20);
 const report=await page.evaluate(()=>({fft:signalReport.fft.frequencyHz,rms:signalReport.rms,fftError:signalReport.fftEnergyError,dctError:signalReport.dctEnergyError,rftError:signalReport.rft.energyError,originalModeCount:plate.modes.length}));
 assert(Math.abs(report.rms-.2/Math.sqrt(2))<.005);assert(report.fftError<1e-10&&report.dctError<1e-10&&report.rftError<.002);
 // Intercept an actual frame: measurements receive a clone of the exact sand buffer.
 assert(await page.evaluate(()=>{
   let same=false;const original=plate.analyse.bind(plate);
   plate.analyse=samples=>{same=measurementPCM.every((v,i)=>v===samples[i]);original(samples);};
   signalBusy=false;signalLast=-Infinity;measureSignal(buf,performance.now());plate.analyse(buf);plate.analyse=original;return same;
 }));
 await page.evaluate(()=>testTone.frequency.setValueAtTime(880,ctx.currentTime));
 await page.waitForFunction(()=>Math.abs(signalReport.fft.frequencyHz-880)<20);
 await page.click('#bAn');assert(await page.evaluate(()=>plate.analysis==='FFT'));
 await page.click('#measurements summary');
 await page.screenshot({path:'/tmp/cymantix-original-measurements.png'});
 await page.evaluate(()=>{stopSrc();stopSrc=null;});
 await page.waitForFunction(()=>signalReport.rms<1e-6);
 assert.deepEqual(errors,[]);console.log('PASS: original controls, five live analyses, exact shared PCM window, 523.25/880 Hz, RMS, energy checks, silence.');console.log(report);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
