const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8'),sandbox={Float32Array,Int32Array,Math,VirtualPlate:require('../modal-core.js')};vm.createContext(sandbox);
vm.runInContext(source.slice(0,source.indexOf('const plate=new Plate()'))+';globalThis.Plate=Plate;',sandbox);
const p=new sandbox.Plate();p.level=1;p.tuned=true;p.energyFloor=.001;
for(let y=0;y<160;y++)for(let x=0;x<160;x++){const k=y*160+x,u=(x+.5)/160-.5;p.E[k]=u*u;p.EX[k]=2*u;}
for(let i=0;i<400;i++)p.step();
let inQuiet=0;for(let i=0;i<p.p.length/2;i++)if(Math.abs(p.p[2*i]-.5)<.04)inQuiet++;
assert(inQuiet>p.p.length*.4,`Nodal strip must collect grains: ${inQuiet}`);
const quiet=[];for(let i=0;i<p.p.length/2;i++)if(Math.abs(p.p[2*i]-.5)<.025)quiet.push([i,p.p[2*i],p.p[2*i+1]]);
p.step();for(const [i,x,y]of quiet){assert.equal(p.p[2*i],x);assert.equal(p.p[2*i+1],y);}
const before=p.p.slice();p.level=0;for(let i=0;i<10;i++)p.step();assert.deepEqual(p.p,before);
console.log('PASS: nodal strip collection, local quiet-region rest without continued collapse, silence freeze.',{inQuiet});
