const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fft,dct,projection,analyse}=require('../signal-analysis.js');
for(const rate of [44100,48000,96000]) {
  const n=4096, f=523.25, input=Float64Array.from({length:n},(_,i)=>.3*Math.sin(2*Math.PI*f*i/rate+.8));
  const result=analyse(input,rate,[74.1,440,f,880,7400]);
  assert(result.fftEnergyError<1e-10 && result.dctEnergyError<1e-10);
  assert(result.reconstructionError<1e-10);
  assert(Math.abs(result.fft.frequencyHz-f)<=rate/n);
  assert(Math.abs(projection(input,rate,[f]).amplitude[0]-.3)<.0002,'NUDFT must resolve off-bin tone amplitude');
}
// Compare DCT with its defining cosine sum, independently of the FFT implementation.
const small=Float64Array.from({length:32},(_,i)=>Math.sin(i*.79)+Math.cos(i*.32));
const cosine=dct(small);
for(let k=0;k<32;k++){
  let expected=0;for(let j=0;j<32;j++)expected+=small[j]*Math.cos(Math.PI*k*(j+.5)/32);
  expected*=Math.sqrt((k===0?1:2)/32);assert(Math.abs(cosine[k]-expected)<1e-12);
}
const silence=analyse(new Float32Array(4096),48000,[440]);assert.equal(silence.rms,0);assert(silence.spectrum.every(x=>x===0));
const binary=fs.readFileSync('data/rft_610.bin'),matrix=new Float32Array(610*610*2),scale=binary.readFloatLE(0);
for(let i=0;i<matrix.length;i++)matrix[i]=binary.readInt16LE(4+2*i)*scale;
const rft=analyse(Float32Array.from({length:4096},(_,i)=>.2*Math.sin(i*.27)),48000,[440],{n:610,matrix}).rft;
assert(rft.energyError<.002,'Stored quantized RFT must approximately preserve energy');
// Execute the real worklet with deterministic PCM and compare its exported window
// against exactly what entered the processor; no analyser polling is involved.
let Processor;const reports=[];
const sandbox={AudioWorkletProcessor:class{constructor(){this.port={postMessage:r=>reports.push(r)};}},sampleRate:48000,VirtualPlate:require('../modal-core.js'),registerProcessor:(name,type)=>Processor=type};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('plate-worklet.js','utf8').replace("import './modal-core.js';",''),sandbox);
const processor=new Processor();processor.port.onmessage({data:{type:'configure',revision:7,frequencies:[440],gains:[1],weights:[1]}});
const source=[];for(let block=0;block<60;block++) {
  const channel=Float32Array.from({length:128},(_,i)=>Math.sin((block*128+i)*.021));source.push(...channel);processor.process([[channel]]);
}
const report=reports.find(r=>r.pcm);assert(report);assert.equal(report.revision,7);
assert.deepEqual(Array.from(report.pcm),source.slice(report.endSample-4096,report.endSample));
console.log('PASS: FFT/DCT energy, inverse FFT reconstruction, off-bin NUDFT, 44.1/48/96 kHz, DCT reference, silence, quantized RFT, exact worklet PCM routing.');
