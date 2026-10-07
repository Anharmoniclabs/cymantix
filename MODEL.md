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
