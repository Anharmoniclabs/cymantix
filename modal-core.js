// Exact zero-order-hold integration of a damped, linear modal oscillator.
// Shared by the AudioWorklet and numerical tests; no browser dependencies.
(function(root) {
  'use strict';
  const material = Object.freeze({youngPa: 200e9, densityKgM3: 7850, thicknessM: .001, poisson: .3,
    frequencyScaleHz: 5.5, dampingRatio: .015, forceNPerFullScale: .1, gravity: 9.80665});
  const rigidity = material.youngPa * material.thicknessM ** 3 / (12 * (1-material.poisson**2));
  const sideM = Math.sqrt(Math.sqrt(rigidity/(material.densityKgM3*material.thicknessM))/(2*Math.PI*material.frequencyScaleHz));
  function coefficients(frequency, rate, gain, damping=material.dampingRatio) {
    if (!(frequency>0 && frequency<rate/2 && damping>0 && damping<1 && Number.isFinite(gain))) throw new Error('Invalid modal parameters');
    const omega=2*Math.PI*frequency, decay=damping*omega, wd=omega*Math.sqrt(1-damping*damping);
    const e=Math.exp(-decay/rate), s=Math.sin(wd/rate), c=Math.cos(wd/rate);
    const a=e*(c+decay*s/wd), b=e*s/wd, d=e*(c-decay*s/wd), k=-omega*omega*b;
    return {a,b,c:k,d,forceQ:(1-a)*gain/(omega*omega),forceV:-k*gain/(omega*omega),omega,decay,gain};
  }
  class ModalBank {
    constructor(frequencies, gains, rate, weights=frequencies.map(()=>1), damping=material.dampingRatio) {
      if(frequencies.length!==gains.length || weights.length!==gains.length) throw new Error('Modal array mismatch');
      this.rate=rate; this.count=frequencies.length; this.weights=Float64Array.from(weights);
      this.coefficients=frequencies.map((f,i)=>coefficients(f,rate,gains[i],damping));
      this.q=new Float64Array(this.count); this.v=new Float64Array(this.count); this.acceleration=new Float64Array(this.count);
      this.energy=new Float64Array(this.count); this.displacement=new Float64Array(this.count);
      this.selected=Array.from({length:Math.min(12,this.count)},(_,i)=>i);
      this.covariance=new Float64Array(this.selected.length**2); this.samples=0; this.inputEnergy=0;
    }
    step(input) {
      input=Number.isFinite(input)?input:0;
      for(let i=0;i<this.count;i++) {
        const p=this.coefficients[i],q=this.q[i],v=this.v[i];
        const nextQ=p.a*q+p.b*v+p.forceQ*input, nextV=p.c*q+p.d*v+p.forceV*input;
        this.q[i]=nextQ; this.v[i]=nextV;
        const acceleration=p.gain*input-2*p.decay*nextV-p.omega*p.omega*nextQ;
        this.acceleration[i]=acceleration;
        this.energy[i]+=acceleration*acceleration; this.displacement[i]+=nextQ*nextQ;
      }
      const selected=this.selected, n=selected.length;
      for(let i=0;i<n;i++) for(let j=0;j<=i;j++) this.covariance[i*n+j]+=this.acceleration[selected[i]]*this.acceleration[selected[j]];
      this.samples++; this.inputEnergy+=input*input;
    }
    report() {
      const n=this.samples || 1, energy=Float64Array.from(this.energy,x=>x/n);
      const covariance=Float64Array.from(this.covariance,x=>x/n);
      let total=0,retained=0;
      for(let i=0;i<this.count;i++) total+=energy[i]*this.weights[i];
      for(const i of this.selected) retained+=energy[i]*this.weights[i];
      const result={selected:this.selected.slice(),covariance,energy,displacement:Float64Array.from(this.displacement,x=>Math.sqrt(x/n)),rms:Math.sqrt(this.inputEnergy/n),coverage:total>1e-24?retained/total:1,seconds:n/this.rate};
      this.selected=Array.from(energy.keys()).sort((a,b)=>energy[b]*this.weights[b]-energy[a]*this.weights[a]).slice(0,12);
      this.covariance=new Float64Array(this.selected.length**2);this.energy.fill(0);this.displacement.fill(0);this.samples=0;this.inputEnergy=0;
      return result;
    }
  }
  root.VirtualPlate={material,rigidity,sideM,coefficients,ModalBank};
  if(typeof module!=='undefined') module.exports=root.VirtualPlate;
})(globalThis);
