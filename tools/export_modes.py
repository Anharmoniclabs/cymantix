#!/usr/bin/env python3
"""Export plate mode shapes for the web player (see desktop/plate_modes.py).

data/modes_<shape>.bin, little-endian:
    uint32 count, uint32 FG
    float32 freq[count]            Hz
    uint8   la[count], lb[count]   mode labels (square: dominant beam indices; circle: m, n)
    int16   W[count][FG*FG]        mode shape, row-major [y][x], value = int16 / 32767, max|W| = 1
"""
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "desktop"))
import plate_modes as pm  # noqa: E402


def write(shape, d):
    count = len(d["freq"])
    with open(f"data/modes_{shape}.bin", "wb") as fh:
        fh.write(struct.pack("<II", count, pm.FG))
        fh.write(d["freq"].astype("<f4").tobytes())
        fh.write(d["la"].astype(np.uint8).tobytes())
        fh.write(d["lb"].astype(np.uint8).tobytes())
        fh.write(np.round(d["W"] * 32767).astype("<i2").tobytes())
    print(shape, count, "modes", f"{d['freq'].min():.0f}-{d['freq'].max():.0f} Hz")


if __name__ == "__main__":
    for shape in ("square", "circle"):
        write(shape, pm.load(shape))
