# Cymantix

A live virtual steel plate driven by captured audio, with GPU sand and an inspectable vibration field.

**[Open Cymantix](https://anharmoniclabs.github.io/cymantix/)**

Share a YouTube/browser tab with audio, load an audio file, use a microphone, or run generated test tones. Every input sample drives damped flexural modal equations. The full phase covariance produces the spatial acceleration field; approximate grains settle in its quieter regions. Switch between sand and field views to inspect the response.

The web app uses browser AudioWorklet, background workers and WebGL2. GPU mode draws 65,536 grains, with an 8,192-grain CPU fallback. No TPU backend is connected. Input audio stays in the browser.

FFT, DCT, NUDFT, constant-Q and RFT measurements inspect the captured signal alongside the simulation. Digital measurements are not physical calibration. The model retains flexural resonances to 7.5 kHz, and the grain transport remains approximate. See [MODEL.md](MODEL.md) for equations, parameters, test commands, citations and limitations.

For development, serve the repository over localhost (`python3 -m http.server 8765`). Audio capture requires a secure context and browser permission. The GitHub Actions workflow runs numerical and browser checks.

The `desktop/` directory remains the historical desktop implementation; it does not yet share this revised web solver. Original versions and later experiments remain recoverable in Git history.
