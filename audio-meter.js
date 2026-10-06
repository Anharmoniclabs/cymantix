// Capture block-level energy between visual frames; the output is deliberately silent.
class CymantixMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.clear();
    this.port.onmessage = ({data}) => {
      if (data === 'read') {
        this.port.postMessage({rms: Math.sqrt(this.sum / Math.max(1, this.count)), peak: this.peak, block: this.block});
      }
      this.clear();
    };
  }
  clear() { this.sum = 0; this.count = 0; this.peak = 0; this.block = 0; }
  process(inputs) {
    for (const channel of inputs[0] || []) {
      let energy = 0;
      for (const x of channel) { energy += x*x; this.peak = Math.max(this.peak, Math.abs(x)); }
      this.sum += energy; this.count += channel.length;
      this.block = Math.max(this.block, Math.sqrt(energy / channel.length));
    }
    return true;
  }
}
registerProcessor('cymantix-meter', CymantixMeter);
