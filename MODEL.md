# Cymantix virtual plate model

Cymantix now maps incoming audio into a defined linear vibration model before moving sand.
The browser AudioWorklet integrates each modal oscillator at the audio sample rate:

`q̈ + 2ζω q̇ + ω²q = (F / M) x(t)`

where `x(t)` is the audio waveform, `ζ = 0.03`, and the actuator is at normalized
plate position `(0.37, 0.31)`. The modeled plate is isotropic steel with `E = 200 GPa`,
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

Auto-tune: a real plate is tuned by tension or size. When one pitch dominates for ~0.15 s,
all mode frequencies are scaled together (within ×0.6–×1.7) so that pitch lands on a
well-coupled mode, and refitted when the pitch moves. Mode shapes and per-mode physics are
unchanged; without this the five modes below 200 Hz answer every bass note the same way.

The circular option uses clamped Kirchhoff plate modes. Its radial profiles satisfy the
clamped boundary equation and are checked by `tools/export_clamped_circle.py`.

`tools/verify-physics.cjs` checks resonance, detuning, linear amplitude, quadratic energy,
exact ring-down, phase cancellation, silence, 20 kHz input, and nodal actuation. The browser
check verifies the original controls, HD GPU/CPU paths, demo, steady tone, circular plate,
shake-off, and mobile layout.

This is a defined virtual plate model. It is not a calibrated measurement of a particular
physical plate: real dimensions, boundary hardware, material variation, actuator coupling,
and damping would need measured parameters for that.
