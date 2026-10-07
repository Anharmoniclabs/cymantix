# Signal measurements

The current web version drives its plate from every audio sample. FFT, DCT, NUDFT, constant-Q-style projections and the stored quantized RFT matrix run alongside it on captured PCM snapshots. They are not added as duplicate forcing.

See [MODEL.md](MODEL.md#signal-measurements) for the current measurement definitions, window lengths, precision limits and tests. The prior first-commit visualization with diagnostic-only additions remains available at commit c6e6c1e.
