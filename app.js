'use strict';
const GRID=1280,GRAINS=8192,FG=160,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const randn=()=> (Math.random()+Math.random()+Math.random()-1.5)*2;
const $=id=>document.getElementById(id),setStatus=text=>$('st').textContent=text;
let ctx=null,analyser=null,outGain=null,srcNode=null,stopSrc=null,physicalModel=null,mediaNode=null;
let view='sand',modelReady=false;
class Plate{
 constructor(){this.shape='square';this.p=new Float32Array(GRAINS*2);this.E=new Float32Array(FG*FG);this.EX=this.E.slice();this.EY=this.E.slice();this.level=0;this.hit=0;this.tuned=false;this.solverFailed=false;this.reset();}
 reset(){this.mass=1;this.falling=false;this.tuned=false;this.gpuReset=true;for(let i=0;i<GRAINS;i++){let x,y;do{x=Math.random();y=Math.random();}while(this.shape==='circle'&&(x-.5)**2+(y-.5)**2>.2401);this.p[2*i]=x;this.p[2*i+1]=y;}}
 setModes(set,shape){this.set=set;this.shape=shape;set.shape=shape;this.mf=Array.from(set.f);this.amp=new Float32Array(set.f.length);this.level=0;this.lastReport=null;this.pendingReport=null;this.lastField=null;this.E.fill(0);this.EX.fill(0);this.EY.fill(0);this.reset();physicalModel?.configure(set);}
 update(){
  if(this.pendingReport){const r=this.pendingReport;this.pendingReport=null;this.lastReport=r;this.db=20*Math.log10(r.rms+1e-12);this.amp.set(r.energy);let best=0;for(let i=1;i<this.amp.length;i++)if(this.amp[i]>this.amp[best])best=i;this.freq=r.rms>1e-8?this.mf[best]:0;}
  const field=physicalModel?.field;if(field&&field!==this.lastField){this.lastField=field;this.E=field.E;this.EX=field.EX;this.EY=field.EY;this.tuned=true;
   // Approximate hopping regime. No automatic gain control or motion at silence.
   this.energyFloor=(VirtualPlate.material.gravity/(Math.SQRT2*Math.max(field.peak,1e-12)))**2;
   this.level=clamp((Math.SQRT2*field.peak/VirtualPlate.material.gravity-1)/3,0,1);
  }
 }
  shakeOff() {
    if (this.falling || this.mass <= 0) return;
    const k = Math.floor(this.mass * GRAINS);
    this.falling = true; this.fallT = 0;
    if (this.gpu) return;
    this.vel = new Float32Array(k);
    this.delay = Int32Array.from({ length: k }, () => Math.floor(Math.random() * 45));
  }
  fallStep() {
    const p = this.p, k = this.vel.length; this.fallT++;
    if (this.fallT < 16) {
      for (let i = 0; i < k; i++) { p[2 * i] = clamp(p[2 * i] + randn() * 0.006, 0, 1); p[2 * i + 1] = clamp(p[2 * i + 1] + randn() * 0.006, 0, 1); }
      return;
    }
    let all = true;
    for (let i = 0; i < k; i++) {
      if (this.fallT - 16 > this.delay[i]) { this.vel[i] += 0.0016; p[2 * i + 1] += this.vel[i]; p[2 * i] += randn() * 0.0015; }
      if (p[2 * i + 1] <= 1) all = false;
    }
    if (all) this.reset();
  }

  stepGpu() {
    const circle = this.shape === "circle", N = this.gpu.N;
    if (this.gpuReset) {                           // re-scatter the grains, but the plate starts empty: draw none yet
      this.gpuReset = false; this.gpu.step({ mode: 3, active: N, circle, drift: 0, kick: 0, fallT: 0 }); this.gpu.active = Math.floor(this.mass * N); return;
    }
    if (this.falling) {
      this.fallT++;
      this.gpu.step({ mode: this.fallT < 16 ? 1 : 2, active: Math.floor(this.mass * N), circle, drift: 0, kick: 0, fallT: this.fallT }, this.E, this.EX, this.EY);
      if (this.fallT > 105) this.reset();        // everything has dropped off the plate by now
      return;
    }
    const k = Math.floor(this.mass * N);
    if (k < 1 || !this.tuned || this.level < .001 || this.solverFailed) { this.gpu.active = k; return; }
    const a = this.level;
    this.gpu.step({ mode: 0, active: k, circle, energyFloor:this.energyFloor, drift: 0.008 * a, kick: 0.0012 * a + 0.008 * this.hit, fallT: 0 }, this.E, this.EX, this.EY);
  }

  step() {
    if (this.gpu) { this.stepGpu(); return; }
    if (this.falling) { this.fallStep(); return; }
    const k = Math.floor(this.mass * GRAINS);
    if (k < 1 || !this.tuned || this.level < .001 || this.solverFailed) return;
    const a = this.level;
    const drift = 0.008 * a, kick = 0.0012 * a + 0.008 * this.hit, circle = this.shape === "circle";
    const { p, E, EX, EY } = this, MAXSTEP = 0.45 / FG;
    // Coarse occupancy is sufficient for contact pressure in the CPU fallback.
    const bins=320;
    const density=this.grainDensity || (this.grainDensity=new Float32Array(bins*bins));density.fill(0);
    for(let i=0;i<k;i++)density[Math.min(bins-1,(p[2*i+1]*bins)|0)*bins+Math.min(bins-1,(p[2*i]*bins)|0)]++;
    const occupancy=(x,y)=>density[clamp(y,0,bins-1)*bins+clamp(x,0,bins-1)];
    for (let i = 0; i < k; i++) {
      let x = p[2 * i], y = p[2 * i + 1];
      const sx=clamp(x*FG-.5,0,FG-1),sy=clamp(y*FG-.5,0,FG-1),ix=Math.floor(sx),iy=Math.floor(sy),tx=sx-ix,ty=sy-iy;
      const ia=iy*FG+ix,ib=iy*FG+Math.min(ix+1,FG-1),ic=Math.min(iy+1,FG-1)*FG+ix,id=Math.min(iy+1,FG-1)*FG+Math.min(ix+1,FG-1);
      const w0=(1-ty)*(1-tx),w1=(1-ty)*tx,w2=ty*(1-tx),w3=ty*tx;
      const energy=w0*E[ia]+w1*E[ib]+w2*E[ic]+w3*E[id],dx=w0*EX[ia]+w1*EX[ib]+w2*EX[ic]+w3*EX[id],dy=w0*EY[ia]+w1*EY[ib]+w2*EY[ic]+w3*EY[id];
      if(energy<=this.energyFloor)continue;
      const stableStep = Math.min(drift, 0.45 * energy / (dx*dx+dy*dy+1e-8));
      let gx = stableStep * dx, gy = stableStep * dy;
      const mag = Math.hypot(gx, gy);
      if (mag > MAXSTEP) { gx *= MAXSTEP / mag; gy *= MAXSTEP / mag; }
      const bx=Math.min(bins-1,(x*bins)|0),by=Math.min(bins-1,(y*bins)|0),crowded=clamp((occupancy(bx,by)-2)/8,0,1);
      let px=occupancy(bx+1,by)-occupancy(bx-1,by),py=occupancy(bx,by+1)-occupancy(bx,by-1);
      const pressure=0.7/GRID*crowded*a/(1+Math.hypot(px,py));gx+=px*pressure;gy+=py*pressure;
      const kk = kick * Math.sqrt(Math.max(0,energy)) + 0.5/GRID*crowded*a;
      x = Math.abs(x - gx + randn() * kk); y = Math.abs(y - gy + randn() * kk);
      if (x > 1) x = 2 - x; if (y > 1) y = 2 - y;
      x = clamp(x, 0, 1); y = clamp(y, 0, 1);
      if (circle) { const dx = x - .5, dy = y - .5, r2 = dx * dx + dy * dy; if (r2 > 0.2401) { const s = 0.49 / Math.sqrt(r2); x = .5 + dx * s; y = .5 + dy * s; } }
      p[2 * i] = x; p[2 * i + 1] = y;
    }
  }
}

const plate=new Plate();plate.gpu=initGpu();
const cv=$('cv'),g=cv.getContext('2d',{alpha:false,willReadFrequently:!plate.gpu}),off=document.createElement('canvas');off.width=off.height=GRID;const og=off.getContext('2d',{alpha:false,willReadFrequently:true});const sandPixels=og.createImageData(GRID,GRID),sandWords=new Uint32Array(sandPixels.data.buffer);
const fieldCanvas=document.createElement('canvas');fieldCanvas.width=fieldCanvas.height=FG;const fg=fieldCanvas.getContext('2d');let paintedField=null;
function draw(){
 if(view==='field'){
  if(paintedField!==plate.lastField){paintedField=plate.lastField;const im=fg.createImageData(FG,FG);for(let k=0;k<plate.E.length;k++){const a=Math.sqrt(plate.E[k]),t=clamp(a,0,1);im.data[4*k]=18+226*t*t;im.data[4*k+1]=28+191*t;im.data[4*k+2]=39+121*t;im.data[4*k+3]=255;}fg.putImageData(im,0,0);}
  g.imageSmoothingEnabled=true;g.drawImage(fieldCanvas,0,0,GRID,GRID);
 }else if(plate.gpu){plate.gpu.render();g.drawImage(plate.gpu.canvas,0,0,GRID,GRID);}else{
  sandWords.fill(0xff1c1510);for(let i=0;i<GRAINS;i++){const x=Math.min(GRID-2,Math.floor(plate.p[2*i]*(GRID-1))),y=Math.min(GRID-2,Math.floor(plate.p[2*i+1]*(GRID-1)));if(y<0||y>=GRID-1)continue;const k=y*GRID+x;sandWords[k]=0xff8cc6e8;if(i%3)sandWords[k+1]=0xff709eb9;if(i%3===2)sandWords[k+GRID]=0xff709eb9;}og.putImageData(sandPixels,0,0);g.drawImage(off,0,0);
 }
 if(plate.shape==='circle'){g.beginPath();g.rect(0,0,GRID,GRID);g.arc(GRID/2,GRID/2,GRID*.497,0,Math.PI*2);g.fillStyle='#0c1219';g.fill('evenodd');}
 // Mark the modeled drive point, not a draggable shape or generated preset.
 g.strokeStyle='#7ed7d280';g.lineWidth=1;g.beginPath();g.arc(GRID*.37,GRID*.31,4,0,Math.PI*2);g.stroke();
}
function ensureCtx(){
 if(ctx){ctx.resume();return;}
 ctx=new (window.AudioContext||window.webkitAudioContext)();analyser=ctx.createAnalyser();analyser.fftSize=4096;outGain=ctx.createGain();analyser.connect(outGain);outGain.connect(ctx.destination);
 physicalModel=new PhysicalPlateModel(ctx,analyser,r=>{plate.pendingReport=r;},message=>{plate.solverFailed=true;plate.level=0;setStatus(message);});physicalModel.configure(plate.set);
}
function mark(id){for(const b of ['bTab','bFile','bMic','bDemo','bTone'])$(b).classList.toggle('go',b===id);}
function useSource(node,audible,stop){if(stopSrc)stopSrc();if(srcNode)srcNode.disconnect();srcNode=node;stopSrc=stop||null;physicalModel?.configure(plate.set);plate.pendingReport=null;plate.level=0;node.connect(analyser);outGain.gain.value=audible?1:0;}
function stopAudio(){if(stopSrc)stopSrc();if(srcNode)srcNode.disconnect();srcNode=null;stopSrc=null;mark(null);setStatus('Audio stopped. The plate is ringing down.');}
async function startTab(){try{ensureCtx();const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());setStatus('No audio shared. Select a tab and enable “Share tab audio”.');return;}const source=ctx.createMediaStreamSource(stream);useSource(source,false,()=>stream.getTracks().forEach(t=>t.stop()));mark('bTab');stream.getAudioTracks()[0].addEventListener('ended',()=>{if(srcNode===source)stopAudio();});setStatus('Measuring shared tab audio. Playback remains in its original tab.');}catch(e){setStatus('Tab capture: '+e.message);}}
async function startMic(){try{ensureCtx();const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});const source=ctx.createMediaStreamSource(stream);useSource(source,false,()=>stream.getTracks().forEach(t=>t.stop()));stream.getAudioTracks()[0].addEventListener('ended',()=>{if(srcNode===source)stopAudio();});mark('bMic');setStatus('Microphone input. Digital levels include the microphone and device gain.');}catch(e){setStatus('Microphone: '+e.message);}}
function tone(frequency,demo=false){ensureCtx();const oscillator=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.2;oscillator.connect(gain);oscillator.frequency.value=frequency;oscillator.start();let timer=null;useSource(gain,true,()=>{if(timer)clearInterval(timer);oscillator.stop();});mark(demo?'bDemo':'bTone');if(demo){let i=0;const resonances=plate.mf.filter(f=>f>100&&f<1500);timer=setInterval(()=>{const f=resonances[(++i*3)%resonances.length];oscillator.frequency.setTargetAtTime(f,ctx.currentTime,.06);setStatus('Resonance sweep: '+f.toFixed(1)+' Hz. This is generated test audio.');},7000);}setStatus((demo?'Resonance sweep: ':'Sine input: ')+frequency.toFixed(1)+' Hz · −17 dBFS RMS.');return oscillator;}
$('bTab').onclick=startTab;$('bMic').onclick=startMic;$('bStop').onclick=stopAudio;$('bFile').onclick=()=> $('fi').click();
$('au').onended=()=>{if(srcNode===mediaNode)stopAudio();};
let objectURL=null;$('fi').onchange=async()=>{const file=$('fi').files[0];if(!file)return;ensureCtx();const audio=$('au');if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(file);audio.src=objectURL;audio.style.display='block';mediaNode=mediaNode||ctx.createMediaElementSource(audio);useSource(mediaNode,true,()=>audio.pause());await audio.play();mark('bFile');setStatus('Measuring '+file.name);};
$('bDemo').onclick=()=>tone(plate.mf.find(f=>f>400),true);$('bTone').onclick=()=>{const f=Number($('testHz').value);if(Number.isFinite(f)&&f>=20&&f<=20000)tone(f);else setStatus('Enter a frequency from 20 to 20,000 Hz.');};
$('bShake').onclick=()=>plate.reset();
for(const [id,value]of [['bSand','sand'],['bField','field']])$(id).onclick=()=>{view=value;$('bSand').classList.toggle('on',value==='sand');$('bField').classList.toggle('on',value==='field');$('viewCaption').textContent=value==='sand'?'Individual grains responding to the computed field. Approximate transport; no pattern presets.':'Time-averaged acceleration: dark = quieter, light = stronger vibration. Display brightness is normalized; the RMS readout keeps physical units.';};
async function loadModes(shape){
 if(shape==='circle')return loadFreeCircle(FG);
 const response=await fetch('data/modes_square.bin');if(!response.ok)throw Error('Square model unavailable');const data=await response.arrayBuffer(),dv=new DataView(data),n=dv.getUint32(0,true);if(dv.getUint32(4,true)!==FG)throw Error('Mode grid mismatch');const q=new Int16Array(data,8+6*n),W=Float32Array.from(q,x=>x/32767);return {f:new Float32Array(data,8,n),la:new Uint8Array(data,8+4*n,n),lb:new Uint8Array(data,8+5*n,n),W,physical:true,boundary:'free'};
}
const modeSets={};async function useShape(shape){try{$('bShape').disabled=true;const set=modeSets[shape]||(modeSets[shape]=await loadModes(shape));plate.setModes(set,shape);modelReady=true;paintedField=null;$('bShape').textContent=shape==='square'?'Circle':'Square';$('engineBadge').textContent=(plate.gpu?'GPU · 65,536 grains':'CPU · 8,192 grains')+' · '+set.f.length+' modes';$('plateInfo').textContent='210.24 mm '+(shape==='square'?'square':'diameter')+' · 1 mm steel · free edges';}catch(e){setStatus(e.message);}finally{$('bShape').disabled=false;}}
$('bShape').onclick=()=>useShape(plate.shape==='square'?'circle':'square');
let displayedSignal=null;
function readout(){
 const a=physicalModel?.analysis,r=plate.lastReport,f=plate.lastField;if(r){$('inputDb').textContent=r.rms>1e-10?plate.db.toFixed(1):'−∞';$('modeHz').textContent=plate.freq?plate.freq.toFixed(1):'—';}
 if(f){$('plateRms').textContent=f.rms.toFixed(2);$('levelMeter').style.width=100*plate.level+'%';const age=Math.max(0,(physicalModel.endSample-f.endSample)/ctx.sampleRate);$('responseStatus').textContent=(age>.5?'Field processing delayed':plate.level>0?'Grains mobilized':'Below modeled hopping threshold')+' · field '+Math.round(age*1000)+' ms behind audio';$('precision').textContent=`${plate.mf.length} modes integrated at ${ctx.sampleRate.toLocaleString()} samples/s. Full modal covariance; ${f.rank} spatial factors retain ${(100*f.coverage).toFixed(3)}% of covariance trace. Residual diagonal energy included. Field computation ${f.computeMs.toFixed(1)} ms.`;}
 if(!a||a===displayedSignal)return;displayedSignal=a;
 $('signalStatus').textContent=`${a.rate.toLocaleString()} Hz · ${a.sampleCount} samples · ${(1000*a.windowSeconds).toFixed(1)} ms`;
 $('peakHz').textContent=a.rms>1e-8?a.fft.frequencyHz.toFixed(1):'—';for(const key of ['fft','dct','nudft','cqt'])$(key+'Value').textContent=a[key].frequencyHz.toFixed(1)+' Hz';$('rftValue').textContent=a.rft?'610 coefficients':a.rftState;
 $('checks').textContent=`FFT/DCT relative energy errors: ${a.fftEnergyError.toExponential(1)} / ${a.dctEnergyError.toExponential(1)}. Inverse FFT maximum error ${a.reconstructionError.toExponential(1)}. RFT ${a.rft?'energy error '+a.rft.energyError.toExponential(1):a.rftState}. Frequency bin spacing ${(a.rate/a.sampleCount).toFixed(2)} Hz. Constant-Q windows are limited by the snapshot length.`;
 const c=$('signalCanvas'),p=c.getContext('2d'),w=c.width,h=c.height;p.fillStyle='#101821';p.fillRect(0,0,w,h);p.strokeStyle='#293743';p.lineWidth=1;for(const y of [54,100,175]){p.beginPath();p.moveTo(0,y);p.lineTo(w,y);p.stroke();}p.strokeStyle='#e8c58b';p.beginPath();for(let i=0;i<a.waveform.length;i++){const x=i*w/(a.waveform.length-1),y=54-a.waveform[i]*40;i?p.lineTo(x,y):p.moveTo(x,y);}p.stroke();p.strokeStyle='#7ed7d2';p.beginPath();for(let x=0;x<w;x++){const freq=20*((a.rate/2)/20)**(x/(w-1)),bin=Math.min(a.spectrum.length-1,Math.round(freq*a.sampleCount/a.rate)),db=20*Math.log10(a.spectrum[bin]+1e-12),y=180-clamp((db+100)/100,0,1)*75;x?p.lineTo(x,y):p.moveTo(x,y);}p.stroke();p.fillStyle='#8e9fab';p.font='11px system-ui';p.fillText('Waveform · full scale ±1',4,13);p.fillText('Spectrum · −100 to 0 dBFS',4,95);for(const [x,text]of [[4,'20 Hz'],[w*.33,'200 Hz'],[w*.66,'2 kHz'],[w-55,(a.rate/2000).toFixed(1)+' kHz']])p.fillText(text,x,201);
}
let last=0,clock=0,lastReadout=0,lastFrameMs=0,frameInterval=0;function loop(t){requestAnimationFrame(loop);if(t-last<(plate.gpu?15:32))return;const frameStart=performance.now();frameInterval=t-last;const dt=Math.min(.05,(t-last)/1000);last=t;if(!modelReady)return;plate.update();if(plate.gpu){clock+=dt;while(clock>=1/60){plate.step();clock-=1/60;}}else{plate.step();}draw();if(t-lastReadout>=100){readout();lastReadout=t;}lastFrameMs=performance.now()-frameStart;}
for(const id of ['bTab','bMic','bFile','bDemo','bTone'])$(id).disabled=true;
useShape('square').then(()=>{if(modelReady)for(const id of ['bTab','bMic','bFile','bDemo','bTone'])$(id).disabled=false;});requestAnimationFrame(loop);
