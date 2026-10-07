# Cymantix virtual plate model

Cymantix now maps incoming audio into a defined linear vibration model before moving sand.
The browser AudioWorklet integrates each modal oscillator at the audio sample rate:

`q̈ + 2ζω q̇ + ω²q = (F / M) x(t)`

where `x(t)` is the audio waveform, `ζ = 0.015`, and the actuator is at normalized
plate position `(0.37, 0.31)`. The modeled plate is isotropic steel with `E = 200 GPa`,
`ρ = 7850 kg/m³`, thickness `h = 1 mm`, and Poisson ratio `ν = 0.30`. The square
side length is derived from those constants and the exported mode-frequency scale.

For every audio block, the solver reports modal acceleration covariance. The sand field is
computed from the full covariance, including cross terms for the strongest 12 modes, so phase-coherent modes can
reinforce or cancel:

`E(x,y) ≈ <a(x,y,t)²> / g²`

All other retained plate modes contribute their individual acceleration energy. Their cross terms are omitted; the coherent percentage readout describes this approximation, not the fraction of total energy displayed.

Grains move down the gradient of this field toward low-acceleration nodal regions. The
GPU path only advances and renders the grains; it does not choose the pattern.
For transport the field is divided by its own maximum, so the pattern shape stays visible at any
music level; the absolute acceleration only sets the shaking level (sand mobility and the meter).

The circular option uses clamped Kirchhoff plate modes. Its radial profiles satisfy the
clamped boundary equation and are checked by `tools/export_clamped_circle.py`.

`tools/verify-physics.cjs` checks resonance, detuning, linear amplitude, quadratic energy,
exact ring-down, phase cancellation, silence, 20 kHz input, and nodal actuation. The browser
check verifies the original controls, HD GPU/CPU paths, demo, steady tone, circular plate,
shake-off, and mobile layout.

This is a defined virtual plate model. It is not a calibrated measurement of a particular
physical plate: real dimensions, boundary hardware, material variation, actuator coupling,
and damping would need measured parameters for that.

## Captured-signal analysis

The worklet copies an ordered 4096-sample PCM window approximately every 120 ms from the same mono samples integrated by the physical solver. No display-frame waveform polling supplies these transforms. A dedicated worker computes FFT, orthonormal DCT-II, nonuniform-frequency DFT, constant-Q projections, and the repository's quantized 610-point unitary RFT. Busy workers skip analysis snapshots, never physical input samples. Reports carry a configuration revision and sample counter so stale source/plate reports are rejected.

The live signal panel shows the waveform, Fourier spectrum, peaks, FFT inverse reconstruction error, FFT/DCT Parseval errors and RFT quantization energy error. NUDFT uses a Hann-windowed projection at 160 logarithmic frequencies from 20 Hz to the lesser of 20 kHz and Nyquist, plus every modeled resonance; constant-Q uses Q=24 windows capped at 4096 samples. These sampled analyses do not claim infinite frequency resolution. FFT/DCT use all their bins; DCT values are orthonormal cosine coefficients, not Fourier amplitudes.

Audio capture requests echo cancellation, noise suppression and automatic gain control off; browser/OS capture and resampling can still affect the signal. Captured playback is muted locally to avoid echo. The tests exercise the capture handler with a synthetic MediaStream; they do not claim an end-to-end measurement of YouTube's codec or the user's audio device.

Definitions: [SciPy DCT-II](https://docs.scipy.org/doc/scipy/reference/generated/scipy.fft.dct.html), [AudioWorklet PCM inputs](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).

## Grain transport and visible area

Grains now use density-dependent contact spreading to resist unlimited overlap during vibration. Drift is capped below half a field cell, and CPU fields use the same bilinear sampling convention as the GPU. The pressure term is an approximate visual granular model; it is disabled with the rest of transport at zero drive. See the [330 Hz before/after comparison](docs/sand-transport/README.md) and overcrowded-node regression test.
