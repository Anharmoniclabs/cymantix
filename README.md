# Cymantix

[Web player](https://anharmoniclabs.github.io/cymantix/): a virtual Chladni plate driven by incoming audio. Choose Demo or share a tab with audio. Drag on the plate to bow it; Shake off redistributes sand. No sensitivity knobs or pitch-to-pattern presets.

The browser integrates damped modal oscillators at the audio sample rate, using solved free-edge square steel plate modes or clamped circular modes. A fixed off-centre actuator couples the waveform to each mode through its modal mass and shape. Resonances and ring-down emerge from this system; frequencies never retune to the music.

Sand follows the gradient of time-averaged acceleration energy. The strongest 12 modes retain their phase covariance; all remaining modes contribute diagonal energy, avoiding false empty regions from discarded broadband energy. Grain transport is an approximation, not a discrete contact-mechanics simulation. A real plate requires measured geometry, mounting, damping and actuator calibration.

Rendering is 1024 × 1024, with 262,144 individual GPU grains or 26,000 CPU grains. Sand is visible before playback and stops moving after vibration decays. The FFT provides the pitch readout only. RFT research data and the earlier desktop visualizer remain separate from the web solver.

See [MODEL.md](MODEL.md) for constants and limitations. Regenerate mode data with `tools/export_modes.py` and `tools/export_clamped_circle.py`.

Verification:

```sh
node tools/verify-physics.cjs
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
