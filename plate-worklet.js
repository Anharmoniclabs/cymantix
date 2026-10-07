import './modal-core.js';
class PlateProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.bank=null;this.revision=0;
    this.port.onmessage=({data})=>{
      if(data.type==='configure') {
        this.bank=new VirtualPlate.ModalBank(data.frequencies,data.gains,sampleRate,data.weights);
        this.revision=data.revision;
      }
    };
  }
  process(inputs) {
    if(!this.bank) return true;
    const channels=inputs[0], length=channels[0]?.length || 128;
    for(let i=0;i<length;i++) {
      // A single point actuator: arithmetic channel downmix, with phase preserved.
      let sample=0;for(const channel of channels) sample+=channel[i];
      this.bank.step(channels.length?sample/channels.length:0);
    }
    if(this.bank.samples>=sampleRate*.04) this.port.postMessage({revision:this.revision,...this.bank.report()});
    // The analysis branch stays silent. Existing source playback is unchanged.
    return true;
  }
}
registerProcessor('virtual-plate',PlateProcessor);
