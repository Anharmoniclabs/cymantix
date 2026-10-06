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

Choosing the figure: the plate keeps its real mode frequencies (no retuning). The ~0.7 s smoothed
power spectrum is passed through each mode's resonance curve, `R = 1/(1+(Q(r−1/r))²)` with
`Q = 1/(2ζ)`, and the mode the music drives hardest is shown; a note between modes drives the
nearer one harder, and overtones can ring a higher mode. Power is tilted by `f` so drums and bass
do not pick every figure. One mode is shown at a time, held at least 1.2 s, with a jolt as it
changes: a literal superposition of all excited modes leaves sand only where every nodal set
crosses, which reads as scattered dots. The mode shapes are solved offline from plate physics;
the grains are simulated live and form the figure themselves. The shaking level is measured
against the recent peak, so quiet tab audio works as well as loud.

Hits: the original player's transient detector is restored (positive spectral flux of the newest
~23 ms in low/mid/high bands against each band's running average). A hit raises the sand's
mobility and throws grains off the lines in proportion to the local vibration; between beats they
slide back into the figure.

The circular option uses clamped Kirchhoff plate modes. Its radial profiles satisfy the
clamped boundary equation and are checked by `tools/export_clamped_circle.py`.

`tools/verify-physics.cjs` checks resonance, detuning, linear amplitude, quadratic energy,
exact ring-down, phase cancellation, silence, 20 kHz input, and nodal actuation. The browser
check verifies the original controls, HD GPU/CPU paths, demo, steady tone, circular plate,
shake-off, and mobile layout.

This is a defined virtual plate model. It is not a calibrated measurement of a particular
physical plate: real dimensions, boundary hardware, material variation, actuator coupling,
and damping would need measured parameters for that.
