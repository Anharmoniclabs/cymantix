// Pivoted Cholesky of the complete covariance. Each factor combines EVERY mode;
// a single coherent tone therefore retains off-resonant interference too.
(function(root){
'use strict';
function factorCovariance(C,n,limit=24,tolerance=1e-5){
 const residual=Float64Array.from({length:n},(_,i)=>Math.max(0,C[i*n+i]));
 const total=residual.reduce((a,b)=>a+b,0),factors=[];
 if(total<1e-24)return {factors,residual,coverage:1};
 for(let k=0;k<Math.min(n,limit);k++){
  let pivot=0;for(let i=1;i<n;i++)if(residual[i]>residual[pivot])pivot=i;
  if(residual[pivot]<=total*1e-12)break;
  const v=new Float64Array(n),den=Math.sqrt(residual[pivot]);
  for(let i=0;i<n;i++){
   let value=C[i*n+pivot];for(const f of factors)value-=f[i]*f[pivot];
   v[i]=value/den;
  }
  factors.push(v);for(let i=0;i<n;i++)residual[i]=Math.max(0,residual[i]-v[i]*v[i]);
  if(residual.reduce((a,b)=>a+b,0)<=total*tolerance)break;
 }
 return {factors,residual,coverage:1-residual.reduce((a,b)=>a+b,0)/total};
}
function buildField(W,grid,C,shape='square',limit=24){
 const size=grid*grid,n=C.length**.5,{factors,residual,coverage}=factorCovariance(C,n,limit);
 const E=new Float32Array(size),F=new Float32Array(size),EX=new Float32Array(size),EY=new Float32Array(size);
 for(const vector of factors){
  F.fill(0);for(let i=0;i<n;i++){const a=vector[i];if(Math.abs(a)<1e-14)continue;const o=i*size;for(let k=0;k<size;k++)F[k]+=a*W[o+k];}
  for(let k=0;k<size;k++)E[k]+=F[k]*F[k];
 }
 // The unresolved residual energy remains present, with its cross terms explicitly
 // approximated. Never silently discard broadband energy to manufacture nodes.
 for(let i=0;i<n;i++){const a=residual[i];if(a<1e-16)continue;const o=i*size;for(let k=0;k<size;k++)E[k]+=a*W[o+k]*W[o+k];}
 let maximum=0,mean=0;for(const x of E){maximum=Math.max(maximum,x);mean+=x;}
 const count=shape==='circle'?Array.from({length:size},(_,k)=>(((k%grid+.5)/grid-.5)**2+((Math.floor(k/grid)+.5)/grid-.5)**2<=.25)?1:0).reduce((a,b)=>a+b,0):size;
 const rms=Math.sqrt(mean/count),peak=Math.sqrt(maximum);
 const inside=(x,y)=>shape!=='circle'||((x+.5)/grid-.5)**2+((y+.5)/grid-.5)**2<=.25;
 // Only the transport field is scaled; physical acceleration metrics remain in SI.
 if(maximum>1e-20)for(let k=0;k<size;k++)E[k]/=maximum;
 for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
  if(!inside(x,y))continue;
  const l=x>0&&inside(x-1,y)?x-1:x,r=x<grid-1&&inside(x+1,y)?x+1:x;
  const u=y>0&&inside(x,y-1)?y-1:y,d=y<grid-1&&inside(x,y+1)?y+1:y,k=y*grid+x;
  EX[k]=r>l?(E[y*grid+r]-E[y*grid+l])*grid/(r-l):0;
  EY[k]=d>u?(E[d*grid+x]-E[u*grid+x])*grid/(d-u):0;
 }
 return {E,EX,EY,rms,peak,coverage,rank:factors.length};
}
const api={factorCovariance,buildField};root.PlateField=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
