import './modal-core.js';
class PlateProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.bank=null;this.revision=0; this.pcm=new Float32Array(4096); this.cursor=0; this.endSample=0; this.reportCount=0;
    this.port.onmessage=({data})=>{
      if(data.type==='configure') {
        this.bank=new VirtualPlate.ModalBank(data.frequencies,data.gains,sampleRate,data.weights,VirtualPlate.material.dampingRatio,false);
        this.revision=data.revision;this.pcm.fill(0);this.cursor=0;this.endSample=0;this.reportCount=0;
      }
    };
  }
  process(inputs) {
    if(!this.bank) return true;
    const channels=inputs[0], length=channels[0]?.length || 128;
    for(let i=0;i<length;i++) {
      // A single point actuator: arithmetic channel downmix, with phase preserved.
      let sample=0;for(const channel of channels) sample+=channel[i];
      const mono=channels.length?sample/channels.length:0;
      this.bank.step(mono);
      this.pcm[this.cursor]=mono;this.cursor=(this.cursor+1)%this.pcm.length;this.endSample++;
    }
    if(this.bank.samples>=sampleRate*.04) {
      const report={revision:this.revision,...this.bank.report(true),endSample:this.endSample};
      // Analysis snapshots are bounded to ~8 Hz. Every sample still drives the plate.
      if(++this.reportCount%3===0) {
        report.pcm=new Float32Array(this.pcm.length);
        for(let i=0;i<this.pcm.length;i++)report.pcm[i]=this.pcm[(this.cursor+i)%this.pcm.length];
        this.port.postMessage(report,[report.pcm.buffer]);
      } else this.port.postMessage(report);
    }
    // The analysis branch stays silent. Existing source playback is unchanged.
    return true;
  }
}
registerProcessor('virtual-plate',PlateProcessor);
