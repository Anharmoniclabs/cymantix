const assert=require('node:assert/strict');
const {ModalBank,coefficients,sideM,rigidity,material}=require('../modal-core.js');
const rate=48000;
function tone(f0,f,input=.1,gain=2) {
  const bank=new ModalBank([f0],[gain],rate);
  for(let n=0;n<rate*2;n++)bank.step(input*Math.sin(2*Math.PI*f*n/rate));
  bank.report();
  for(let n=rate*2;n<rate*3;n++)bank.step(input*Math.sin(2*Math.PI*f*n/rate));
  return bank.report();
}
const results=[];
for(const frequency of [74,440,1000]) {
  const measured=tone(frequency,frequency).displacement[0];
  const expected=.1*2/(2*material.dampingRatio*(2*Math.PI*frequency)**2*Math.sqrt(2));
  const error=Math.abs(measured/expected-1);
  assert(error<.003,`Resonance ${frequency} Hz error ${error}`);
  results.push({frequencyHz:frequency,relativeAmplitudeError:error});
}
assert(tone(440,484).displacement[0]<tone(440,440).displacement[0]/5,'Detuning must reduce resonance');
const low=tone(440,440,.05),high=tone(440,440,.1);
assert(Math.abs(high.displacement[0]/low.displacement[0]-2)<1e-10);
assert(Math.abs(high.energy[0]/low.energy[0]-4)<1e-10);
const decayBank=new ModalBank([74],[2],rate);
for(let i=0;i<4800;i++)decayBank.step(.1);
const p=coefficients(74,rate,2),wd=p.omega*Math.sqrt(1-material.dampingRatio**2);
const envelope=()=>Math.hypot(decayBank.q[0],(decayBank.v[0]+p.decay*decayBank.q[0])/wd);
const before=envelope();for(let i=0;i<4800;i++)decayBank.step(0);
assert(Math.abs(envelope()/before/Math.exp(-p.decay*.1)-1)<1e-10,'Exact free ring-down');
const coherent=new ModalBank([440,440],[2,-2],rate);
for(let n=0;n<rate;n++)coherent.step(Math.sin(2*Math.PI*440*n/rate));
const report=coherent.report();
assert(report.covariance[2]<0,'Opposite-phase covariance must be negative');
assert(Math.abs(report.covariance[0]+2*report.covariance[2]+report.covariance[3])/report.energy[0]<1e-10,'Equal spatial shapes must cancel');
const silence=new ModalBank([74,1000,7400],[1,1,1],rate);
for(let n=0;n<1000;n++)silence.step(0);
assert(silence.report().energy.every(x=>x===0),'Silence cannot inject energy');
const wide=new ModalBank([74,1000,7400],[1,1,1],rate);
for(let n=0;n<rate;n++)wide.step(.1*Math.sin(2*Math.PI*20000*n/rate));
assert(wide.report().energy.every(x=>Number.isFinite(x)&&x>0),'High-frequency force must be integrated');
const node=new ModalBank([440],[0],rate);
for(let n=0;n<1000;n++)node.step(1);
assert(node.q[0]===0,'An actuator on a node cannot excite that mode');
console.log(JSON.stringify({status:'PASS',sideM,rigidityNm:rigidity,resonance:results,checks:['detuning','linear displacement','quadratic energy','exact ring-down','phase cancellation','silence','20 kHz input','nodal drive']},null,2));
