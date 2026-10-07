# Cymantix

[Web player](https://anharmoniclabs.github.io/cymantix/): a virtual Chladni plate driven by incoming audio. Choose Demo or share a tab with audio. Drag on the plate to bow it; Shake off redistributes sand. No sensitivity knobs or pitch-to-pattern presets.

The browser integrates damped modal oscillators at the audio sample rate, using solved free-edge square steel plate modes or clamped circular modes. A fixed off-centre actuator couples the waveform to each mode through its modal mass and shape. Resonances and ring-down emerge from this system; frequencies never retune to the music.

Sand follows the gradient of time-averaged acceleration energy. The strongest 12 modes retain their phase covariance; all remaining modes contribute diagonal energy, avoiding false empty regions from discarded broadband energy. Grain transport is an approximation, not a discrete contact-mechanics simulation. A real plate requires measured geometry, mounting, damping and actuator calibration.

Rendering is 1024 × 1024, with 262,144 individual GPU grains or 26,000 CPU grains. Sand is visible before playback and stops moving after vibration decays. Density-dependent contact spreading prevents grains from collapsing into invisible piles; sub-cell drift and bilinear sampling preserve nodal detail. [Before/after comparison](docs/sand-transport/README.md). FFT, orthonormal DCT-II, NUDFT, constant-Q and the stored 610-point RFT all read PCM snapshots from the **same AudioWorklet input** that drives the plate. A worker runs the analysis so it cannot block the audio-rate solver. Open **Live signal** to see the captured waveform, spectrum, measured peaks and numerical energy/reconstruction checks.

These transforms analyse the single actuator signal; summing their outputs as independent forces would count the same sound repeatedly. The finite plate response is not a lossless one-to-one encoding of sound. Stereo is arithmetically downmixed to the one point actuator, preserving phase (opposite channels can cancel). The FFT/DCT cover their entire discrete band to Nyquist; NUDFT and constant-Q probe 160 logarithmic frequencies plus each retained plate resonance. The RFT's 610-sample window is shorter than the 4096-sample FFT/DCT window; its coefficients are not claimed to be independent physical Fourier bins.

See [MODEL.md](MODEL.md) for constants and limitations. Regenerate mode data with `tools/export_modes.py` and `tools/export_clamped_circle.py`.

Verification:

```sh
node tools/verify-physics.cjs
node tools/verify-signal.cjs
python -m http.server 8765
# in another terminal, with Playwright and Chromium installed:
node tools/verify-web.cjs
```

## Desktop (Linux, PipeWire/Pulse)

The desktop app is the earlier transform-based visualizer; it does not run the browser's audio-rate solver.

```sh
cd desktop
python -m venv .venv
.venv/bin/pip install -r requirements.txt
./run.sh
```
