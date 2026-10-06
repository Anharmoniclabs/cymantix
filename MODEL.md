# Cymantix virtual plate model

Cymantix now maps incoming audio into a defined linear vibration model before moving sand.
The browser AudioWorklet integrates each modal oscillator at the audio sample rate:

`q̈ + 2ζω q̇ + ω²q = (F / M) x(t)`

where `x(t)` is the audio waveform, `ζ = 0.03`, and the actuator is at the centre of
the square, or at r = 0.6 on the circle. The modeled plate is isotropic steel with `E = 200 GPa`,
`ρ = 7850 kg/m³`, thickness `h = 1 mm`, and Poisson ratio `ν = 0.30`. The square
side length is derived from those constants and the exported mode-frequency scale.

For every audio block, the solver reports modal acceleration covariance. The sand field is
computed from the full covariance, including cross terms, so phase-coherent modes can
reinforce or cancel:

`E(x,y) = <a(x,y,t)²> / g²`

where each mode's reported acceleration is its resonant amplitude `ω·q̇`. Total `q̈` includes the
broadband force/mass term, which every mode shares off resonance and which lets the lowest
modes win whatever the pitch; `ω·q̇` equals `q̈` at resonance and falls away on both sides.

Grains move down the gradient of this field toward low-acceleration nodal regions. The
GPU path only advances and renders the grains; it does not choose the pattern.
For transport the field is divided by its own maximum, so the pattern shape stays visible at any
music level; the absolute acceleration only sets the shaking level (sand mobility and the meter).

Figure ladder and tuning (ideas from chladni-tui's mode ladder and Chladni's centre-bolted plate):
the square is driven at its centre, so only its 20 fully symmetric modes ring; the circle on a
diameter at r = 0.6, so each degenerate pair rings only its cos member. These modes, lowest first,
form a ladder. The peak of a ~0.5 s smoothed spectrum (with hysteresis, so a chord does not flip
between its notes) is placed on the ladder by its position between 65 Hz and 1.1 kHz, and the
whole mode set is scaled so that pitch sits exactly on the chosen mode's resonance. A new figure
is held at least 1.2 s and the plate is jolted as it changes. The chosen mode's shape alone guides
the sand (before the first lock, the ladder mode the solver rings hardest); mixing modes would
leave sand only where every nodal set crosses, which reads as scattered dots. The pitch peak is
tilted by sqrt(f) toward melody and chords so drums and bass do not pick every figure, and the
shaking level is measured against the recent peak, so quiet tab audio works as well as loud. Mode shapes and per-mode physics are unchanged; the plate is a tunable one.

The circular option uses clamped Kirchhoff plate modes. Its radial profiles satisfy the
clamped boundary equation and are checked by `tools/export_clamped_circle.py`.

`tools/verify-physics.cjs` checks resonance, detuning, linear amplitude, quadratic energy,
exact ring-down, phase cancellation, silence, 20 kHz input, and nodal actuation. The browser
check verifies the original controls, HD GPU/CPU paths, demo, steady tone, circular plate,
shake-off, and mobile layout.

This is a defined virtual plate model. It is not a calibrated measurement of a particular
physical plate: real dimensions, boundary hardware, material variation, actuator coupling,
and damping would need measured parameters for that.
