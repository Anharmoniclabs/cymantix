const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const elements=new Map();
const sandbox={console,VirtualPlate:require('../modal-core.js'),navigator:{},document:{getElementById(id){if(!elements.has(id))elements.set(id,{classList:{toggle(){}},disabled:false});return elements.get(id);}}};
vm.createContext(sandbox);
vm.runInContext(script.slice(0,script.indexOf('// ============================================================ render'))+'\nglobalThis.Plate=Plate;',sandbox);
const plate=new sandbox.Plate(),size=160*160;
const W=new Float32Array(size*2);for(let y=0;y<160;y++)for(let x=0;x<160;x++){W[y*160+x]=(x+.5)/160-.5;W[size+y*160+x]=1;}
plate.setModes({f:new Float32Array([440,880]),la:[1,2],lb:[2,3],W,physical:true},'square');
const g2=sandbox.VirtualPlate.material.gravity**2;
plate.amp.set([1,1]);
plate.buildField({selected:[0],covariance:new Float64Array([g2]),energy:new Float64Array([g2,g2]),coverage:.5});
assert(plate.E[80*160+80]>.7,'Unselected mode energy must fill the spurious central node');
plate.buildField({selected:[0],covariance:new Float64Array([g2]),energy:new Float64Array([g2,0]),coverage:1});
assert(plate.E[80*160+80]<.001,'Single mode must retain its nodal line');
plate.tuned=true;plate.level=0;const before=plate.p.slice();plate.step();assert.deepEqual(plate.p,before,'Silent plate must preserve settled grains');
plate.level=1;for(let i=0;i<120;i++)plate.step();
const active=Math.floor(plate.mass*26000);let initial=0,final=0;
for(let i=0;i<active;i++){initial+=Math.abs(before[2*i]-.5);final+=Math.abs(plate.p[2*i]-.5);}
assert(final<initial*.8,'Grains must converge toward actual mode nodes');
assert(plate.p.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
assert(plate.mass>0,'Sand must be present before audio');
console.log('PASS: JavaScript syntax, full modal energy, single-mode nodes, silence freeze, nodal settling, finite bounded grains, visible initial sand.');
