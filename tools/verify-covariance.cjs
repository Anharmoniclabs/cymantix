const assert=require('node:assert/strict');
const {ModalBank}=require('../modal-core.js');
for(const rate of [44100,48000,96000]){
 const frequencies=[20,74,108,191.7358,191.7358,425,1000,4000,7447,rate*.45];
 const bank=new ModalBank(frequencies,frequencies.map((_,i)=>Math.sin(i+.3)*12),rate);
 for(const length of [128,2048,3001]){
  const n=frequencies.length,direct=new Float64Array(n*n);
  for(let t=0;t<length;t++){
   const input=.2*Math.sin(t*.171)+.1*Math.cos(t*.311)+(t%71===0?.5:0);
   bank.step(input);for(let i=0;i<n;i++)for(let j=0;j<n;j++)direct[i*n+j]+=bank.acceleration[i]*bank.acceleration[j]/length;
  }
  const r=bank.report();let maxError=0;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)maxError=Math.max(maxError,Math.abs(r.covariance[i*n+j]-direct[i*n+j])/Math.max(1e-12,Math.sqrt(direct[i*n+i]*direct[j*n+j])));
  assert(maxError<2e-6,`${rate}/${length} covariance mismatch ${maxError}`);
  console.log({rate,length,maxRelativeCovarianceError:maxError});
 }
}
const f=Array.from({length:128},(_,i)=>74+i*57),b=new ModalBank(f,f.map(()=>1),48000),start=performance.now();
for(let n=0;n<48000;n++){b.step(Math.sin(n*.12));if(n%2048===2047)b.report();}
console.log('128-mode audio-second compute milliseconds:',(performance.now()-start).toFixed(1));
console.log('PASS: full covariance matches direct sample-by-sample summation, including degenerate modes and block boundaries.');
