# Cymantix

A Chladni sand simulation driven by audio. Solved square or circular plate modes
respond to sound near their resonances, and grains move toward low-vibration regions.

**Web player:** https://anharmoniclabs.github.io/cymantix/ — demo, microphone,
audio file, shared tab/system audio (where supported), or a low-volume test tone.
Audio is processed locally in the browser.

## HD web player

- **1024 × 1024 rendering**, up from 320 × 320 (10.24 times the rendered pixels).
  Subpixel grain coverage and continuous density shading replace the old blurred,
  quantized image. Up to 262,144 GPU grains, with adjustable sand amount;
  26,000-grain CPU fallback. This does not increase the solved mode grid beyond 160 × 160.
- **Crisper nodal lines:** lower grain jitter, interpolated GPU field sampling,
  and energy-limited settling steps reduce spread and overshoot. A damped
  resonance response reduces off-frequency mode smearing. Transient detection
  uses FFT magnitudes so RFT phase variation does not scatter sand under a steady tone.
- **20 Hz–20 kHz spectrum**, capped at half the actual audio sample rate.
  Each stereo channel has a 32,768-sample bass analyser and a 2,048-sample fast
  analyser. The display aggregates these into 96 logarithmic bands. Channel
  magnitudes are combined without cancelling opposite-phase stereo signals.
- **Continuous block metering** with AudioWorklet retains RMS and peak energy
  between visual frames, including short bursts. Frame-sample metering is used
  if worklets are unavailable. This is continuous level capture, not a recording
  or a claim to resolve every frequency in every short transient.
- **Automatic input matching.** A relative spectral floor and fast-attack,
  recovering loudness reference follow quiet and loud recordings without manual
  sensitivity or threshold controls. Playback gain stays unchanged. Microphone capture requests echo cancellation, noise
  suppression, and automatic gain control off; hardware/browser support varies.
- **Distinct measurements:** dominant frequency, digital input level (dBFS),
  and excited plate resonance. The square dataset has 128 modes from about
  74–7,447 Hz; the circular dataset has 131 modes from about 74–7,384 Hz.
  Out-of-resonance audio can agitate grains without inventing a plate mode.
- **Source lifecycle:** stop releases capture tracks; switching sources stops
  the old source; cancelled permissions leave the current source alone.

Frequency resolution and latency depend on the window length and sample rate.
At 48 kHz the bass bin spacing is about 1.46 Hz and its window is about 683 ms;
the fast window is about 43 ms. Rendering and modal analysis run on the visual
thread and can slow on busy devices. The microphone, audio interface, speakers,
and browser set the physical capture/playback limits. This is not a calibrated
sound-pressure or vibration instrument and cannot detect every physical vibration.

### Web verification

Serve the repository with `python -m http.server 8765`, install Playwright and
its Chromium browser in your development environment, then run:

```sh
node tools/verify-web.cjs
```

`CYMANTIX_URL` can select a different local server;
`CHROMIUM_EXECUTABLE_PATH` can select an installed Chromium binary.
The test exercises real Web Audio with generated tones, stereo cancellation,
short-burst capture, automatic quiet-input response, microphone release using a synthetic device,
file playback, plate shapes, mobile widths, and CPU/missing-RFT fallback.
It does not validate the frequency response of a physical microphone.

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
- **GPU sand.** Up to 262,144 grains advanced by a WebGL2 shader (CPU fallback: 26,000).

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
