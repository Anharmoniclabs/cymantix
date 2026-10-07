# Cymantix numerical model

This version is an audio-driven virtual instrument. It is not a measurement of a physical plate and has not been experimentally calibrated. The plate response and its numerical checks are separate from the approximate sand transport.

## Input and plate

Every captured audio sample, including its sign and phase, drives one fixed point actuator at normalized position (0.37, 0.31). Stereo channels are averaged; equal opposite-phase stereo cancels at this mono actuator. The capture uses the audio supplied by the browser. A YouTube URL alone does not expose its PCM: share the playing tab with audio enabled. Captured sources and microphones are not echoed through the app. File and generated test audio are audible.

The virtual material is steel: Young's modulus 200 GPa, density 7,850 kg/m³, thickness 1 mm, Poisson ratio 0.3. Bending rigidity is 18.315 N m. The square side or circular diameter is 210.239 mm. Edges are free. The rigid-body translation and tilt modes are excluded: this represents the flexural motion relative to the supported rigid-body frame, not a completely unsupported object in space. A real mount would alter the spectrum.

The square retains 128 Rayleigh–Ritz flexural modes from 74.097 to 7,447.290 Hz. A 24×24 free-beam product basis supplied the stored shapes; a 30×30 basis check gives a maximum relative frequency change of 0.000572 (0.0572%) over the retained spectrum. This is a frequency-convergence check, not a claim that every spatial derivative has that accuracy. Stored shapes use signed 16-bit quantization on a 160×160 grid.

The free circular plate uses J_m and I_m Bessel radial solutions, satisfying zero edge bending moment and effective transverse shear. Its first flexural resonance is 117.883 Hz. The generator checks published dimensionless frequency parameters for angular orders 0–3 and boundary residuals. Its generator and tests are included. These are plate modes, not stretched-membrane Bessel zeros.

Modes above 7.5 kHz are omitted. High-frequency input still enters the retained oscillators, but the omitted high-frequency resonances are not simulated. Finite grid resolution, mode truncation, idealized damping and mounting limit accuracy.

## Dynamics

Each mode follows

`q'' + 2 ζ ω q' + ω² q = F_scale φ(x_drive,y_drive) input / modal_mass`

with damping ratio ζ = 0.015 and fixed actuator scale F_scale = 1 N per full-scale digital input. There is no frequency snapping or automatic input gain. This force scale is a declared virtual coupling, not a measured microphone/speaker calibration. Modes integrate at the AudioContext sample rate using the exact zero-order-hold state transition. Continuous analog forcing differs from this piecewise-constant input, especially near Nyquist.

## Full phase covariance without quadratic audio-thread work

For normalized two-state mode vectors z_i and scalar input u,

`z_i(next) = A_i z_i + b_i u`.

Over an audio block, accumulate only `sum(z_i u)` and `sum(u²)` on the real-time thread. The complete state-product sum `S_ij = sum(z_i z_j^T)` satisfies the discrete Sylvester equation

`S_ij - A_i S_ij A_j^T = A_i sum(z_i u) b_j^T + b_i sum(u z_j^T) A_j^T + b_i b_j^T sum(u²) - z_i(end) z_j(end)^T + z_i(start) z_j(start)^T`.

A background worker solves its precomputed 4×4 system for every pair and recovers the full acceleration covariance. This replaces the previous approximation that preserved cross terms for only 12 selected modes. Independent tests compare it with direct sample-by-sample outer-product sums across sample rates, repeated eigenfrequencies, block lengths and block boundaries.

The time-averaged acceleration field is `E(x,y) = φ(x,y)^T C φ(x,y)`. The display factors the COMPLETE covariance using pivoted Cholesky. Each factor combines every retained mode; modes are not ranked and discarded. It stops at a residual trace tolerance of 1e-5 or 24 factors. Remaining diagonal energy is included. If the limit is reached, remaining residual cross terms are approximated; the UI reports retained covariance trace. That percentage is not a calibrated spatial-error bound. A sustained single tone typically needs two factors, including its off-resonant response and phase shifts.

Audio-thread statistics travel directly to the field worker through a MessageChannel, so a slow render thread cannot queue old field inputs. The worker coalesces display requests to the latest available block. Heavy field reconstruction runs in a worker at a maximum of 12.5 updates per second. GPU grains step at 60 Hz; the CPU fallback uses a 30 Hz transport/display target, so its settling speed can differ. When it cannot keep up, display snapshots are skipped; audio integration continues for every sample. The UI reports field age and computation time. Browser rendering is not hard real time. The GPU runs 65,536 grains; CPU fallback runs 8,192.

## Sand and field views

The field view displays normalized RMS acceleration as brightness. The plate RMS readout remains in m/s², averaged over the plate area. The marker indicates the fixed actuator location. Grain migration uses the gradient of this computed field, bounded subcell steps, vibration-dependent agitation, and approximate occupancy pressure. A local estimated hopping threshold (sqrt(2) times RMS acceleration greater than gravity) halts transport in quiet regions. This estimate is exact only for a single sinusoid's peak/RMS relationship, not arbitrary music. Low-acceleration rolling, inverse Chladni patterns, individual ballistic trajectories, friction coefficients, air drag and resolved three-dimensional grain collisions are not modeled. Grains are retained within the visible boundary, so edge loss is also not modeled.

The local rest threshold prevents continued drift along a quiet nodal stripe into a tiny global minimum. Silence creates no agitation. Sand positions persist through frequency changes. Redistribute explicitly scatters the grains. Switching plate geometry starts a new instrument and scatters them.

Broadband music generally does not produce the clean stationary figures of a single resonant sine. The app does not invent symmetric geometry to hide that fact.

## Signal measurements

FFT, orthonormal DCT-II, nonuniform DFT projections, variable-window constant-Q-style projections (Q=24, limited to the available snapshot), and the stored quantized 610-point RFT matrix inspect the same captured mono PCM. The first four use a 4096-sample window; RFT uses its newest 610 samples. These are diagnostic views, not five extra forces. FFT peak frequency uses local log-magnitude interpolation; its accuracy depends on spectral separation, noise and windowing. DCT peaks are cosine-basis coefficients, not phase-independent sinusoidal amplitudes. NUDFT/CQ peaks refer to sampled frequencies. Low-frequency CQ windows cannot achieve the requested Q within a short snapshot.

Levels are digital dBFS. Numerical energy/reconstruction errors check transforms, not physical calibration or sensor accuracy. PCM snapshots update about every 120 ms when available; they are not an uninterrupted recording.

## Reproducible checks

- `node tools/verify-physics.cjs`: resonance amplitudes, detuning, linearity, quadratic energy, ring-down, phase cancellation, silence, high-frequency force and nodal drive.
- `node tools/verify-worklet.cjs`: exact captured PCM windows and opposite-phase stereo cancellation.
- `node tools/verify-covariance.cjs`: exact covariance versus direct outer products.
- `node tools/verify-field.cjs`: coherent all-mode spatial reconstruction, broadband residual energy and silence.
- `node tools/verify-grains.cjs`: nodal collection, quiet-region rest and silence freeze.
- `node tools/verify-signal.cjs`: FFT reconstruction/energy, DCT reference sums, off-bin NUDFT, sample rates and RFT quantization.
- `node tools/verify-circle-model.cjs`: circular boundary and reference frequencies.
- `python tools/verify-square.py`: square basis convergence (requires NumPy).
- `node tools/verify-music.cjs`: an eight-tone mixture changes the computed field without resetting the grains.
- `node tools/verify-lab.cjs`: actual browser worklet, live fields, transforms, captured MediaStream route, no capture echo, both renderers, geometry switches, silence and mobile layout. Requires Playwright and a local server on port 8765.

## References

- A. W. Leissa, *Vibration of Plates*, NASA SP-160 (1969): https://ntrs.nasa.gov/citations/19700009156
- S. J. D. D'Alessio, *Forced free vibrations of a square plate*, SN Applied Sciences 3, 60 (2021): https://doi.org/10.1007/s42452-020-04062-6
- IIT Delhi Virtual Labs, free circular plate boundary equations: https://wvtps-iitd.vlabs.ac.in/exp/circular-plate/theory.html

These references support the plate formulation and limits; they do not validate this implementation by endorsement. There is no TPU service, neural pattern generator or server-side audio upload in this application.
