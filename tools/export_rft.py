#!/usr/bin/env python3
"""Export the RFT analysis operator U^H for the web player.

  f_k = {(k+1) phi},  Phi_nk = N^-1/2 exp(i 2 pi f_k n),  U = Phi (Phi^H Phi)^-1/2

Output data/rft_<N>.bin: float32 scale, then N*N complex values (re, im
interleaved, row-major) as int16; value = int16 * scale. Fibonacci N only
(best-conditioned, kappa(G) -> 2.848).
"""
import math
import struct
import sys

import numpy as np

PHI = (1 + math.sqrt(5)) / 2


def build(N):
    f = np.mod((np.arange(N) + 1) * PHI, 1.0)
    n = np.arange(N)[:, None]
    Phi = np.exp(2j * np.pi * np.mod(n * f[None, :], 1.0)) / math.sqrt(N)
    w, V = np.linalg.eigh(Phi.conj().T @ Phi)
    U = Phi @ ((V * w ** -0.5) @ V.conj().T)
    print(f"N={N} kappa(G)={w.max() / w.min():.4f} "
          f"unitarity={np.abs(U.conj().T @ U - np.eye(N)).max():.1e}")
    return U.conj().T


if __name__ == "__main__":
    for N in map(int, sys.argv[1:] or ["1597", "610"]):
        UH = build(N)
        scale = float(max(np.abs(UH.real).max(), np.abs(UH.imag).max())) / 32767
        q = np.empty((N, N, 2), dtype="<i2")
        q[..., 0] = np.round(UH.real / scale)
        q[..., 1] = np.round(UH.imag / scale)
        with open(f"data/rft_{N}.bin", "wb") as fh:
            fh.write(struct.pack("<f", scale))
            fh.write(q.tobytes())
