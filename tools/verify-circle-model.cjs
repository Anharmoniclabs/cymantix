const assert=require('node:assert/strict'),fs=require('node:fs');
const {profiles,boundary,radialScale,frequencyScaleHz}=JSON.parse(fs.readFileSync('data/free-circle.json'));
assert.equal(boundary,'free');assert.equal(frequencyScaleHz,22);
// Published free-edge Kirchhoff frequency parameters for nu=0.3; excludes rigid motions.
for(const [m,expected] of [[0,9.0031],[1,20.4746],[2,5.3583],[3,12.439]]) {
 const p=profiles.find(p=>p.m===m);assert(Math.abs(p.frequency/22-expected)<.002);
}
for(const p of profiles) {
 assert(p.frequency>0 && p.frequency<=7500);
 assert.equal(p.radial.length,513);assert(p.radial.every(Number.isFinite));
 assert(Math.abs(p.radial.at(-1)*radialScale)>.01,'Free edge cannot be a universal nodal ring');
}
const radial=profiles.find(p=>p.m===0&&p.n===1).radial;
assert(radial.some(x=>x>0)&&radial.some(x=>x<0),'First axisymmetric flexural mode must have an interior nodal circle');
console.log('PASS: independent free-edge frequency benchmarks, nonzero rim profiles, interior axisymmetric node, finite bounded modal data.');
