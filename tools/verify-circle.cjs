// Regression: an existing rim pile must respond to a frequency change without
// a shake/reset. The fixture changes only initial grain placement.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.env.CYMANTIX_URL||'http://127.0.0.1:8765/';
try {
for(const cpu of [false,true]) {
  const page=await browser.newPage({viewport:{width:900,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const original=WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource=function(shader,source){
      return original.call(this,shader,source.replace('float rr=0.49*sqrt(r1)','float rr=0.487'));
    };
  });
  await page.goto(base+(cpu?'?cpu':''));await page.waitForFunction(()=>modeSets.square);
  await page.click('#bShape');await page.waitForFunction(()=>plate.shape==='circle');
  if(cpu)await page.evaluate(()=>{
    for(let i=0;i<GRAINS;i++){const angle=2*Math.PI*i/GRAINS;plate.p[2*i]=.5+.487*Math.cos(angle);plate.p[2*i+1]=.5+.487*Math.sin(angle);}
  });
  await page.waitForTimeout(250);
  const distribution=()=>page.evaluate(()=>{
    const pixels=g.getImageData(0,0,cv.width,cv.height).data,W=cv.width;
    let interior=0,rim=0,total=0;
    for(let y=100;y<W;y++)for(let x=0;x<W;x++){
      const i=4*(y*W+x),radius=Math.hypot(x/W-.5,y/W-.5);
      if(pixels[i]>100 && pixels[i+1]>70 && pixels[i]>pixels[i+2]*1.15) {
        total++;if(radius<.45)interior++;else if(radius>.475)rim++;
      }
    }
    return {interior:interior/Math.max(1,total),rim:rim/Math.max(1,total),total};
  });
  const initial=await distribution();assert(initial.rim>.9,JSON.stringify({cpu,initial}));
  await page.click('#bDemo');
  await page.evaluate(()=>{
    window.transitionTone=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=.1;
    transitionTone.frequency.value=38;transitionTone.connect(gain);transitionTone.start();useSource(gain,true,()=>transitionTone.stop());
  });
  await page.waitForTimeout(3000);
  const low=await distribution();
  await page.evaluate(()=>transitionTone.frequency.setValueAtTime(22*9.003137350295527,ctx.currentTime));
  await page.waitForTimeout(8000);
  const high=await distribution();
  assert(high.interior>.25,`Rim pile did not re-enter plate: ${JSON.stringify({cpu,initial,low,high})}`);
  assert(await page.evaluate(()=>Math.abs(plate.pitch-198.069)<10 && plate.set.boundary==='free'));
  assert.deepEqual(errors,[]);
  await page.locator('#cv').screenshot({path:`/tmp/cymantix-circle-transition-${cpu?'cpu':'gpu'}.png`});
  console.log(JSON.stringify({renderer:cpu?'CPU':'GPU',initial,at38Hz:low,after198Hz:high,status:'PASS'}));
  await page.close();
}
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
