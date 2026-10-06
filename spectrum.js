// Two time scales per stereo channel: bass resolution and fast upper-band response.
// This measures digital audio, not calibrated sound pressure or physical displacement.
class WidebandAudio {
  constructor(context, input) {
    this.context = context;
    this.ceiling = Math.min(20000, context.sampleRate / 2);
    this.floor = -78;
    this.values = new Float32Array(96).fill(-120);
    this.previous = new Float32Array(96).fill(-120);
    this.bands = Array.from({length: 96}, (_, i) => [
      20 * (this.ceiling / 20) ** (i / 96),
      20 * (this.ceiling / 20) ** ((i + 1) / 96)
    ]);
    this.splitter = context.createChannelSplitter(2);
    input.connect(this.splitter);
    this.channels = [0, 1].map(channel => [32768, 2048].map(size => {
      const node = context.createAnalyser();
      node.fftSize = size; node.smoothingTimeConstant = 0;
      this.splitter.connect(node, channel);
      return {node, data: new Float32Array(size / 2), step: context.sampleRate / size};
    }));
    this.rms = 0; this.peak = 0; this.block = 0; this.pitch = 0;
    this.flux = 0; this.bass = 0; this.mid = 0; this.air = 0;
    this.meterState = 'starting'; this.resetVersion = 0;
    this.startMeter(input);
  }
  async startMeter(input) {
    try {
      await this.context.audioWorklet.addModule('audio-meter.js');
      this.meter = new AudioWorkletNode(this.context, 'cymantix-meter');
      this.meter.port.onmessage = ({data}) => {
        this.rms = data.rms; this.peak = data.peak; this.block = data.block;
        this.meterAt = performance.now();
      };
      input.connect(this.meter); this.meter.connect(this.context.destination);
      this.meterState = 'continuous';
    } catch (error) {
      this.meterState = 'frame';
      console.warn('Continuous meter unavailable; using frame samples.', error);
    }
  }
  reset() {
    this.values.fill(-120); this.previous.fill(-120);
    this.rms = this.peak = this.block = this.pitch = this.flux = 0;
    this.meter?.port.postMessage('reset');
    // Native analysers keep their last window after a source change.
    this.validAfter = this.context.currentTime + 32768 / this.context.sampleRate;
  }
  read(samples) {
    this.meter?.port.postMessage('read');
    if (!this.meter || performance.now() - (this.meterAt || 0) > 250) {
      let sum = 0, peak = 0;
      for (const x of samples) { sum += x*x; peak = Math.max(peak, Math.abs(x)); }
      this.rms = Math.sqrt(sum / samples.length); this.peak = peak; this.block = this.rms;
    }
    for (const channel of this.channels) for (const ear of channel) ear.node.getFloatFrequencyData(ear.data);
    const waiting = this.context.currentTime < (this.validAfter || 0);
    let flux = 0, bass = 0, mid = 0, air = 0, strongest = -120, pitch = 0;
    const peaks = [];
    for (let b = 0; b < this.bands.length; b++) {
      const [lo, hi] = this.bands[b];
      let value = -120;
      for (const ears of this.channels) {
        const ear = ears[lo < 240 && !waiting ? 0 : 1];
        const first = Math.max(1, Math.floor(lo / ear.step));
        const end = Math.min(ear.data.length - 2, Math.ceil(hi / ear.step));
        for (let k = first; k <= end; k++) value = Math.max(value, ear.data[k]);
      }
      this.values[b] = value;
      const energy = Math.max(0, Math.min(1, (value - this.floor) / 60));
      flux += Math.max(0, energy - Math.max(0, (this.previous[b] - this.floor) / 60));
      this.previous[b] = value;
      if (hi <= 250) bass = Math.max(bass, energy);
      else if (lo < 4000) mid = Math.max(mid, energy);
      else air = Math.max(air, energy);
    }
    // Dominant sinusoidal component, interpolated in dB; do not call it a fundamental.
    for (const ears of this.channels) for (let scale = 0; scale < 2; scale++) {
      if (waiting && scale === 0) continue;
      const {data, step} = ears[scale];
      const lo = Math.max(2, Math.ceil((scale ? 240 : 20) / step));
      const hi = Math.min(data.length - 2, Math.ceil((scale ? this.ceiling : 240) / step));
      for (let k = lo; k <= hi; k++) {
        if (data[k] <= this.floor || data[k] < data[k-1] || data[k] < data[k+1]) continue;
        const curve = data[k-1] - 2 * data[k] + data[k+1];
        const offset = Number.isFinite(curve) && Math.abs(curve) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5*(data[k-1]-data[k+1])/curve)) : 0;
        const frequency = Math.min(this.ceiling, (k + offset) * step);
        peaks.push({frequency, db: data[k]});
        if (data[k] > strongest) { strongest = data[k]; pitch = frequency; }
      }
    }
    this.pitch = pitch;
    this.peaks = peaks.filter(peak => peak.db >= strongest - 36);
    this.flux = Math.min(1, flux / 8);
    this.bass = bass; this.mid = mid; this.air = air;
  }
  at(frequency) {
    const index = Math.floor(Math.log(frequency / 20) / Math.log(this.ceiling / 20) * this.values.length);
    return this.values[Math.max(0, Math.min(this.values.length - 1, index))];
  }
}
