// Analysis of the exact PCM window also consumed by the original sand engine. All transforms
// describe the same input; their energies must never be added as extra force.
(function(root) {
  'use strict';
  function fft(real, imaginary=null, inverse=false) {
    const n=real.length;
    if(n<2 || (n&(n-1))) throw Error('FFT length must be a power of two');
    const re=Float64Array.from(real), im=imaginary?Float64Array.from(imaginary):new Float64Array(n);
    for(let i=1,j=0;i<n;i++) {
      let bit=n>>1;for(;j&bit;bit>>=1) j^=bit;j^=bit;
      if(i<j) {[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}
    }
    for(let size=2;size<=n;size*=2) {
      const angle=(inverse?2:-2)*Math.PI/size, cr=Math.cos(angle), ci=Math.sin(angle);
      for(let start=0;start<n;start+=size) {
        let wr=1,wi=0;
        for(let j=0;j<size/2;j++) {
          const a=start+j,b=a+size/2, tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];
          re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
          const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;
        }
      }
    }
    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
    return {re,im};
  }
  function dct(input) {
    const n=input.length, even=new Float64Array(2*n);
    for(let i=0;i<n;i++) even[i]=even[2*n-1-i]=input[i];
    const {re,im}=fft(even), out=new Float64Array(n);
    for(let k=0;k<n;k++) {
      const theta=Math.PI*k/(2*n);
      out[k]=.5*(re[k]*Math.cos(theta)+im[k]*Math.sin(theta))*Math.sqrt((k===0?1:2)/n);
    }
    return out;
  }
  function projection(input,rate,frequencies,q=null) {
    const re=new Float64Array(frequencies.length),im=new Float64Array(frequencies.length),amplitude=new Float64Array(frequencies.length);
    frequencies.forEach((f,k)=>{
      const length=q?Math.min(input.length,Math.max(8,Math.round(q*rate/f))):input.length;
      const start=input.length-length, angle=2*Math.PI*f/rate, cr=Math.cos(angle),ci=Math.sin(angle);
      let wr=1,wi=0,weight=0;
      for(let j=0;j<length;j++) {
        const w=.5-.5*Math.cos(2*Math.PI*j/(length-1));
        re[k]+=input[start+j]*w*wr;im[k]-=input[start+j]*w*wi;weight+=w;
        const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;
      }
      re[k]*=2/weight;im[k]*=2/weight;amplitude[k]=Math.hypot(re[k],im[k]);
    });
    return {re,im,amplitude};
  }
  const sumSquares=a=>a.reduce((s,v)=>s+v*v,0);
  function peak(values,frequency) {
    let best=0;for(let k=1;k<values.length;k++)if(Math.abs(values[k])>Math.abs(values[best]))best=k;
    return {frequencyHz:Math.abs(values[best])>0?frequency(best):0,amplitude:Math.abs(values[best])};
  }
  function analyse(input,rate,modeFrequencies,rft=null) {
    const n=input.length, raw=fft(input), cosine=dct(input), energy=sumSquares(input);
    const frequencies=Array.from(new Set([...Array.from({length:160},(_,i)=>20*(Math.min(20000,rate/2-1)/20)**(i/159)),...modeFrequencies])).filter(f=>f>0&&f<rate/2).sort((a,b)=>a-b);
    const nudft=projection(input,rate,frequencies), cqt=projection(input,rate,frequencies,24);
    const windowed=Float64Array.from(input,(x,i)=>x*(.5-.5*Math.cos(2*Math.PI*i/(n-1))));
    const spectrum=fft(windowed), amplitude=Float64Array.from({length:n/2+1},(_,k)=>Math.hypot(spectrum.re[k],spectrum.im[k])*4/(n-1));
    amplitude[0]*=.5;amplitude[n/2]*=.5;
    const rebuilt=fft(raw.re,raw.im,true).re;
    let reconstructionError=0;for(let i=0;i<n;i++)reconstructionError=Math.max(reconstructionError,Math.abs(rebuilt[i]-input[i]));
    const result={rate,sampleCount:n,windowSeconds:n/rate,rms:Math.sqrt(energy/n),fft:peak(amplitude,k=>k*rate/n),dct:peak(cosine,k=>k*rate/(2*n)),nudft:peak(nudft.amplitude,k=>frequencies[k]),cqt:peak(cqt.amplitude,k=>frequencies[k]),
      fftEnergyError:Math.abs((sumSquares(raw.re)+sumSquares(raw.im))/n-energy)/Math.max(energy,1e-30),dctEnergyError:Math.abs(sumSquares(cosine)-energy)/Math.max(energy,1e-30),reconstructionError,
      // Bounded display arrays; transforms above use the full input window.
      waveform:Float32Array.from(input.slice(-512)),spectrum:Float32Array.from(amplitude),frequencies:Float32Array.from(frequencies),nudftAmplitude:Float32Array.from(nudft.amplitude),cqtAmplitude:Float32Array.from(cqt.amplitude),dctCoefficients:Float32Array.from(cosine)};
    if(rft) {
      const count=rft.n, offset=n-count, coefficients=new Float32Array(count*2);
      for(let k=0;k<count;k++)for(let j=0;j<count;j++) {
        coefficients[2*k]+=rft.matrix[(k*count+j)*2]*input[offset+j];
        coefficients[2*k+1]+=rft.matrix[(k*count+j)*2+1]*input[offset+j];
      }
      const sourceEnergy=sumSquares(input.slice(offset)),coefficientEnergy=sumSquares(coefficients);
      result.rft={sampleCount:count,coefficients,energyError:Math.abs(coefficientEnergy-sourceEnergy)/Math.max(sourceEnergy,1e-30)};
    }
    return result;
  }
  const api={fft,dct,projection,analyse};root.SignalAnalysis=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
