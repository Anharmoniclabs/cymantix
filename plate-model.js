// Browser bridge between physical mode shapes and the continuous audio-rate solver.
class PhysicalPlateModel {
  constructor(context, input, receive, fail) {
    this.context=context;this.input=input;this.receive=receive;this.fail=fail;this.revision=0;this.scale=1;
    this.ready=this.start();
  }
  async start() {
    try {
      await this.context.audioWorklet.addModule('plate-worklet.js');
      this.node=new AudioWorkletNode(this.context,'virtual-plate');
      this.node.port.onmessage=({data})=>{
        if(data.revision!==this.revision)return;
        const energy=new Float64Array(this.set.f.length), displacement=new Float64Array(this.set.f.length);
        this.indices.forEach((original,i)=>{energy[original]=data.energy[i];displacement[original]=data.displacement[i];});
        this.receive({...data,energy,displacement,selected:data.selected.map(i=>this.indices[i])});
      };
      this.node.onprocessorerror=()=>this.fail('The plate solver stopped. Reload to restart it.');
      this.input.connect(this.node);this.node.connect(this.context.destination);
      if(this.set)this.configure(this.set);
    } catch(error) {this.fail('Continuous plate simulation is unavailable: '+error.message);}
  }
  retune(scale) {this.scale=scale;this.configure(this.set);}
  configure(set) {
    if(set!==this.set)this.scale=1;
    this.set=set;this.revision++;
    if(!this.node || !set.physical)return;
    const {material,sideM}=VirtualPlate, grid=Math.sqrt(set.W.length/set.f.length);
    const cellArea=sideM*sideM/(grid*grid);
    const frequencies=[],gains=[],weights=[];this.indices=[];
    // Bilinear actuator location in the same cell-centred grid as the mode data.
    const x=.37*grid-.5,y=.31*grid-.5,ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
    for(let i=0;i<set.f.length;i++) {
      const frequency=set.f[i]*this.scale;
      if(frequency>=this.context.sampleRate/2)continue;
      const offset=i*grid*grid;let integral=0;
      for(let k=0;k<grid*grid;k++)integral+=set.W[offset+k]**2;
      const at=(xx,yy)=>set.W[offset+yy*grid+xx];
      const drive=(1-ty)*((1-tx)*at(ix,iy)+tx*at(ix+1,iy))+ty*((1-tx)*at(ix,iy+1)+tx*at(ix+1,iy+1));
      const mass=material.densityKgM3*material.thicknessM*cellArea*integral;
      if(!(mass>0))throw new Error('Non-positive modal mass');
      frequencies.push(frequency);gains.push(material.forceNPerFullScale*drive/mass);weights.push(integral/(grid*grid));this.indices.push(i);
    }
    this.node.port.postMessage({type:'configure',revision:this.revision,frequencies,gains,weights});
  }
}
async function loadClampedCircle(grid) {
  const response=await fetch('data/clamped-circle.json');if(!response.ok)throw new Error('Circular plate data unavailable');
  const {profiles}=await response.json(),frequencies=[],la=[],lb=[],fields=[];
  for(const profile of profiles) for(const sine of profile.m===0?[false]:[false,true]) {
    const w=new Float32Array(grid*grid);let maximum=0;
    for(let y=0;y<grid;y++) for(let x=0;x<grid;x++) {
      const xx=2*(x+.5)/grid-1, yy=2*(y+.5)/grid-1, radius=Math.hypot(xx,yy);
      if(radius>1)continue;
      const t=radius*(profile.radial.length-1),index=Math.min(profile.radial.length-2,Math.floor(t)),fraction=t-index;
      const radial=profile.radial[index]*(1-fraction)+profile.radial[index+1]*fraction;
      const angle=profile.m*Math.atan2(yy,xx),value=radial*(sine?Math.sin(angle):Math.cos(angle));
      w[y*grid+x]=value;maximum=Math.max(maximum,Math.abs(value));
    }
    for(let i=0;i<w.length;i++)w[i]/=maximum;
    frequencies.push(profile.frequency);la.push(profile.m);lb.push(profile.n);fields.push(w);
  }
  const W=new Float32Array(fields.length*grid*grid);fields.forEach((w,i)=>W.set(w,i*grid*grid));
  return {f:Float32Array.from(frequencies),la:Uint8Array.from(la),lb:Uint8Array.from(lb),W,physical:true};
}
