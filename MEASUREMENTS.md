# Signal measurements on the original visualization

The original first-commit plate, grain transport and renderer are preserved. Its existing RFT/FFT toggle continues to choose the sand-driving bank.

A background worker measures a copy of the same 4096-sample mono window consumed by the sand engine. It runs about every 150 ms when available; these are overlapping snapshots, not an uninterrupted recording. All input paths (demo, file, microphone, captured tab/system audio) feed this shared analyser. Captured audio is not echoed to the speakers.

Measurements include a Hann-windowed FFT spectrum, orthonormal DCT-II, nonuniform DFT projections at logarithmic frequencies plus the plate's mode frequencies, variable-length constant-Q-style projections (Q=24, limited by the available window), and the original quantized 610-sample RFT basis applied to the newest 610 samples. The panel reports RMS in digital dBFS, sampled spectral peaks, FFT/DCT energy errors, RFT quantization energy error and inverse FFT reconstruction error. DCT coefficients and RFT coefficients are not interchangeable with ordinary sinusoidal amplitudes. The sampled NUDFT/CQ peak is not a continuous pitch estimator. Low-frequency CQ windows cannot reach their requested Q with only 4096 samples.

These measurements do not add their energies together or change the original pattern generation. They do not establish calibration to a physical plate or guarantee a unique 1:1 sand pattern for every sound. FFT bin spacing is sample rate / 4096; windowing also limits resolution. Tab capture measures the audio the browser supplies and requires sharing tab audio.

Validation: `node tools/verify-signal.cjs` checks known tones at 44.1/48/96 kHz, direct DCT reference sums, inverse FFT reconstruction, off-bin NUDFT amplitude, silence and stored RFT energy. `tools/verify-measurements.cjs` exercises live browser tones, levels, source routing to the exact same PCM window, the original analysis toggle and silence.
