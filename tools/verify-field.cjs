const assert=require('node:assert/strict'),{buildField,factorCovariance}=require('../field-core.js');
const n=20,g=24,size=g*g,W=new Float32Array(n*size);
for(let i=0;i<n;i++)for(let k=0;k<size;k++)W[i*size+k]=Math.sin((i+1)*(k%g)*.1)*Math.cos((i+2)*Math.floor(k/g)*.13);
// A single coherent forcing vector spanning more than the old 12-mode limit.
const v=Float64Array.from({length:n},(_,i)=>Math.cos(i*.3)),C=Float64Array.from({length:n*n},(_,k)=>v[Math.floor(k/n)]*v[k%n]);
const field=buildField(W,g,C),exact=new Float64Array(size);let max=0;
for(let k=0;k<size;k++){let sum=0;for(let i=0;i<n;i++)sum+=v[i]*W[i*size+k];exact[k]=sum*sum;max=Math.max(max,exact[k]);}
assert.equal(field.rank,1);assert(field.coverage>1-1e-12);
for(let k=0;k<size;k++)assert(Math.abs(field.E[k]-exact[k]/max)<2e-6);
// Independent broadband modes: truncation must keep residual energy visible.
const identity=Float64Array.from({length:n*n},(_,k)=>+(Math.floor(k/n)===k%n));
const full=buildField(W,g,identity,'square',n),limited=buildField(W,g,identity,'square',2);
assert(limited.coverage<.2);for(let k=0;k<size;k++)assert(Math.abs(full.E[k]-limited.E[k])<1e-6);
assert(buildField(W,g,new Float64Array(n*n)).E.every(x=>x===0));
console.log('PASS: all-mode coherent field against direct superposition, unresolved broadband energy, silence.');
