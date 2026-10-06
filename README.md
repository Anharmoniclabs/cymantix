# Cymantix

A Chladni sand plate that reacts to music. Audio drives a modeled steel plate, every mode a
damped oscillator at the audio sample rate. The figure is the plate mode the music drives
hardest at its real resonance frequency, and simulated sand gathers on its nodal lines.
See [MODEL.md](MODEL.md) for the model and its limits.

**Web player:** https://anharmoniclabs.github.io/cymantix/ — play a demo, an audio
file, a shared tab's audio, or the microphone. Everything runs in your browser.

## Sand refinement

The original web layout and controls are preserved. Sand now renders at
1024 × 1024 instead of 320 × 320, with individual grain coverage rather than
blurred density pixels. Interpolated GPU field sampling, lower jitter and
energy-limited settling sharpen nodal lines. FFT-based transient detection
avoids false impacts from RFT coefficient phase changes under steady tones;
damped resonance weighting reduces off-frequency pattern smearing.
The underlying solved mode grid remains 160 × 160.

## The plate

- **Real plate modes.** The square plate's modes are solved offline for a free-edge Kirchhoff
  plate with Ritz's method over free-free beam functions (`desktop/plate_modes.py`; checked
  against the published eigenvalues, e.g. 13.47, 19.64, 24.31 vs 13.47, 19.60, 24.27). A circular
  plate (Bessel modes) is one click away. `tools/export_modes.py` writes the web data.
- **Sand physics.** Agitation energy is summed incoherently, E = Σ aᵢ²Wᵢ², since modes at
  different frequencies don't interfere. Sand slides down ∇E to the nodal lines, with the slide
  clamped by magnitude (no diagonal bias).
- **Steady figures.** A mode's score rises fast and falls slowly, and modes picked into the top
  ten are held ~0.8 s, because sand needs seconds to settle. Drum hits still strike instantly.
- **Peak-based excitation.** Spectral peaks excite nearby modes weighted by closeness in cents,
  strength, and how much the mode moves at the driving point.
- **Bowing.** Drag across the plate: the pointer position picks the modes that move most there
  (a node can't be bowed), speed is the bow pressure, and the sound runs through the same ears.
- **GPU sand.** 262,144 grains advanced by a WebGL2 shader (CPU fallback: 26,000).

The ideas above come from reading other open-source Chladni projects (chladni-tui, MMM-Chladni,
Resonance Lab, Chladni Plate Visualizer); the code here is an independent implementation.

The desktop app has the four transforms and the backdrop glow, but not yet the solved modes,
circular plate, bowing or GPU sand.

## Transforms

The plate hears through four transforms at once — **FFT**, **DCT**, the **RFT**, and a
**constant-Q** bank (one tuned filter per plate mode: long windows for low modes, short
for high ones). Each scores every mode against its own loudness reference and a mode
rings if any of them hears it. Over an 80-tone sweep, the constant-Q bank picks the
nearest plate mode on 77/80 tones against 36–45/80 for the others; the fused set keeps
that. (The constant-Q bank is evaluated at the mode frequencies, which favours it in this
test.) The desktop app has a *Transforms* menu to switch each one on or off.

## Light

Only the backdrop glows, and gently. The glow takes the colour of the pitch: a pitch is
transposed up by whole octaves until it lands in the visible band (405–810 THz is exactly one
octave), then turned into RGB, so every pitch class has the colour it would have as light
(A440 is orange-red, C4 green) and an octave never changes the hue. The pitch is read from the
spectrum peak (parabolic interpolation, within a few cents from 55 Hz to 5 kHz). Several ringing
pitches mix additively.

It is deliberately safe: the plate itself is never lit, nothing pulses with the beat, and both
the colour and the brightness change over roughly a second (even a hard on/off input at 8 Hz
moves the glow by under 0.4% of its range per frame). The desktop app has a *Backdrop glow* toggle.

## The RFT

The plate listens through the Resonant Fourier Transform (L. M. Minier,
*What I Got Wrong*, Eqs. 1–2):

```
f_k = {(k+1) φ},   Φ_nk = N^-1/2 exp(i 2π f_k n),   U = Φ (Φ^H Φ)^-1/2
```

`U` is unitary (energy-preserving). Dimensions are Fibonacci, the best-conditioned
(κ(G) → 2.848): **web** N = 1597 / 610, **desktop** N = 2584 / 987. A plain FFT is one
click away for comparison. No advantage over the FFT is claimed; the paper retracts
those claims and this only uses the finite construction.

`tools/export_rft.py` regenerates `data/rft_*.bin` (int16-quantised `U^H`) for the web
player.

## Desktop app (Linux, PipeWire/Pulse)

Listens to whatever your system plays and shows MPRIS transport controls.

```
cd desktop && python -m venv .venv && .venv/bin/pip install -r requirements.txt && ./run.sh
```

The first run builds the RFT matrices (~45 s) and caches them in `~/.cache/cymatic-widget/`.
