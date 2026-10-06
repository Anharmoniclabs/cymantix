# Cymantix

A Chladni sand plate that reacts to music. Sound drives a virtual square plate
(modes `cos(nπx)cos(mπy) − s·cos(mπx)cos(nπy)`, `f ≈ F₀(n²+m²)`); each mode is
excited by the energy near its own resonance, loudness sets the drive, and the
sand slides to the nodal lines.

**Web player:** https://anharmoniclabs.github.io/cymantix/ — play a demo, an audio
file, a shared tab's audio, or the microphone. Everything runs in your browser.

## The analysis transform

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
