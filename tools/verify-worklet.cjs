const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let Processor;const reports=[];
const scope={AudioWorkletProcessor:class{constructor(){this.port={postMessage:r=>reports.push(r)};}},sampleRate:48000,VirtualPlate:require('../modal-core.js'),registerProcessor:(_,type)=>Processor=type};
vm.createContext(scope);vm.runInContext(fs.readFileSync('plate-worklet.js','utf8').replace("import './modal-core.js';",''),scope);
const processor=new Processor(),configure=()=>processor.port.onmessage({data:{type:'configure',revision:1,frequencies:[440,700],gains:[2,1],weights:[1,1]}});configure();
const source=[];for(let block=0;block<60;block++){const x=Float32Array.from({length:128},(_,i)=>Math.sin((block*128+i)*.021));source.push(...x);processor.process([[x]]);}
const snapshot=reports.find(r=>r.pcm);assert(snapshot);assert.deepEqual(Array.from(snapshot.pcm),source.slice(snapshot.endSample-4096,snapshot.endSample));assert(snapshot.stats.samples>0);assert.equal(snapshot.covariance,null);
reports.length=0;configure();for(let block=0;block<60;block++){const x=Float32Array.from({length:128},(_,i)=>Math.sin((block*128+i)*.021));processor.process([[x,Float32Array.from(x,v=>-v)]]);}
assert(reports.every(r=>r.rms===0&&r.energy.every(x=>x===0)));
console.log('PASS: exact continuous PCM snapshots, deferred covariance, opposite-phase stereo cancellation.');
