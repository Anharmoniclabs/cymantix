// Exact zero-order-hold integration of a damped, linear modal oscillator.
// Shared by the AudioWorklet and numerical tests; no browser dependencies.
(function(root) {
  'use strict';
  const material = Object.freeze({youngPa: 200e9, densityKgM3: 7850, thicknessM: .001, poisson: .3,
    frequencyScaleHz: 5.5, dampingRatio: .015, forceNPerFullScale: 1, gravity: 9.80665});
  const rigidity = material.youngPa * material.thicknessM ** 3 / (12 * (1-material.poisson**2));
  const sideM = Math.sqrt(Math.sqrt(rigidity/(material.densityKgM3*material.thicknessM))/(2*Math.PI*material.frequencyScaleHz));
  function coefficients(frequency, rate, gain, damping=material.dampingRatio) {
    if (!(frequency>0 && frequency<rate/2 && damping>0 && damping<1 && Number.isFinite(gain))) throw new Error('Invalid modal parameters');
    const omega=2*Math.PI*frequency, decay=damping*omega, wd=omega*Math.sqrt(1-damping*damping);
    const e=Math.exp(-decay/rate), s=Math.sin(wd/rate), c=Math.cos(wd/rate);
    const a=e*(c+decay*s/wd), b=e*s/wd, d=e*(c-decay*s/wd), k=-omega*omega*b;
    return {a,b,c:k,d,forceQ:(1-a)*gain/(omega*omega),forceV:-k*gain/(omega*omega),omega,decay,gain};
  }
  // Invert the 4x4 discrete Sylvester operator once for each mode pair.
  // Summed state products are recovered exactly from block endpoint states and
  // state/input products. Cost per audio sample stays linear in mode count.
  function inverse4(matrix) {
    const a=matrix.map((row,i)=>[...row,...[0,1,2,3].map(j=>+(i===j))]);
    for(let k=0;k<4;k++) {
      let pivot=k;for(let i=k+1;i<4;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
      [a[k],a[pivot]]=[a[pivot],a[k]];
      const d=a[k][k];if(Math.abs(d)<1e-15)throw Error('Singular covariance operator');
      for(let j=0;j<8;j++)a[k][j]/=d;
      for(let i=0;i<4;i++)if(i!==k){const t=a[i][k];for(let j=0;j<8;j++)a[i][j]-=t*a[k][j];}
    }
    return a.map(row=>row.slice(4));
  }
  class ModalBank {
    constructor(frequencies,gains,rate,weights=frequencies.map(()=>1),damping=material.dampingRatio,prepareCovariance=true) {
      if(frequencies.length!==gains.length || weights.length!==gains.length)throw Error('Modal array mismatch');
      this.rate=rate;this.count=frequencies.length;this.weights=Float64Array.from(weights);
      this.coefficients=frequencies.map((f,i)=>coefficients(f,rate,gains[i],damping));
      this.q=new Float64Array(this.count);this.v=new Float64Array(this.count);this.acceleration=new Float64Array(this.count);
      this.energy=new Float64Array(this.count);this.displacement=new Float64Array(this.count);
      this.state=new Float64Array(this.count*2);this.start=this.state.slice();this.cross=this.state.slice();
      this.samples=0;this.inputEnergy=0;
      this.system=this.coefficients.map(p=>{
        const A=[[p.a,p.b*p.omega],[p.c/p.omega,p.d]],B=[p.forceQ*p.omega*p.omega,p.forceV*p.omega];
        const l=[-1,-2*p.decay/p.omega];
        return {A,B,L:[l[0]*A[0][0]+l[1]*A[1][0],l[0]*A[0][1]+l[1]*A[1][1]],D:p.gain+l[0]*B[0]+l[1]*B[1]};
      });
      this.pairs=[];
      if(prepareCovariance)for(let i=0;i<this.count;i++)for(let j=0;j<=i;j++) {
        const A=this.system[i].A,B=this.system[j].A;
        const K=Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>+(r===c)-A[r>>1][c>>1]*B[r%2][c%2]));
        this.pairs.push({i,j,inverse:inverse4(K)});
      }
    }
    step(input) {
      input=Number.isFinite(input)?input:0;
      for(let i=0;i<this.count;i++) {
        const p=this.coefficients[i],s=this.system[i],k=2*i,x=this.state[k],y=this.state[k+1];
        this.cross[k]+=x*input;this.cross[k+1]+=y*input;
        const nx=s.A[0][0]*x+s.A[0][1]*y+s.B[0]*input,ny=s.A[1][0]*x+s.A[1][1]*y+s.B[1]*input;
        this.state[k]=nx;this.state[k+1]=ny;
        this.q[i]=nx/(p.omega*p.omega);this.v[i]=ny/p.omega;
        const a=p.gain*input-nx-2*p.decay/p.omega*ny;this.acceleration[i]=a;
        this.energy[i]+=a*a;this.displacement[i]+=this.q[i]*this.q[i];
      }
      this.samples++;this.inputEnergy+=input*input;
    }
    recover(stats) {
      const N=this.count,n=stats.samples||1,C=new Float64Array(N*N),U=stats.cross,X=stats.state,S=stats.start,e=stats.inputEnergy;
      for(const pair of this.pairs) {
        const {i,j,inverse}=pair,I=this.system[i],J=this.system[j],rhs=new Float64Array(4);
        const iu=[U[2*i],U[2*i+1]],ju=[U[2*j],U[2*j+1]];
        for(let r=0;r<2;r++)for(let c=0;c<2;c++)rhs[2*r+c]=
          (I.A[r][0]*iu[0]+I.A[r][1]*iu[1])*J.B[c]+I.B[r]*(J.A[c][0]*ju[0]+J.A[c][1]*ju[1])+
          I.B[r]*J.B[c]*e-X[2*i+r]*X[2*j+c]+S[2*i+r]*S[2*j+c];
        const products=inverse.map(row=>row.reduce((v,a,k)=>v+a*rhs[k],0));
        let sum=0;for(let r=0;r<2;r++)for(let c=0;c<2;c++)sum+=I.L[r]*products[2*r+c]*J.L[c];
        sum+=(I.L[0]*iu[0]+I.L[1]*iu[1])*J.D+I.D*(J.L[0]*ju[0]+J.L[1]*ju[1])+I.D*J.D*e;
        C[i*N+j]=C[j*N+i]=sum/n;
      }
      return C;
    }
    report(defer=false) {
      const N=this.count,n=this.samples||1;
      const stats={samples:this.samples,cross:this.cross.slice(),state:this.state.slice(),start:this.start.slice(),inputEnergy:this.inputEnergy};
      const C=defer?null:this.recover(stats);
      // Direct diagonal sums avoid cancellation at near-static low input frequencies.
      const energy=Float64Array.from(this.energy,x=>x/n);if(C)for(let i=0;i<N;i++)C[i*N+i]=energy[i];
      const result={selected:Array.from({length:N},(_,i)=>i),covariance:C,stats,energy,
        displacement:Float64Array.from(this.displacement,x=>Math.sqrt(x/n)),q:this.q.slice(),
        rms:Math.sqrt(this.inputEnergy/n),coverage:1,seconds:n/this.rate};
      this.start.set(this.state);this.cross.fill(0);this.energy.fill(0);this.displacement.fill(0);this.inputEnergy=0;this.samples=0;
      return result;
    }
  }
  root.VirtualPlate={material,rigidity,sideM,coefficients,ModalBank};
  if(typeof module!=='undefined')module.exports=root.VirtualPlate;
})(globalThis);
