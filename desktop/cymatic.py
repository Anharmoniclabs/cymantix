#!/usr/bin/env python3
"""Cymatic plate desktop widget.

Listens to whatever your system is playing (via the PipeWire/Pulse sink
monitor, so YouTube, local players, anything) and lets a virtual plate of sand
settle into Chladni figures driven by the music. Shows the current track and
transport controls for any MPRIS player (Firefox/Chrome YouTube, VLC, mpv,
Spotify, Elisa, ...).

Controls: drag = move, wheel = resize, click buttons / progress bar,
right-click = menu.
"""
import json
import math
import os
import subprocess
import sys
import threading
import time
import urllib.request

import numpy as np
from PyQt6.QtCore import QPointF, QRectF, Qt, QThread, QTimer, pyqtSignal
from PyQt6.QtGui import (QActionGroup, QBrush, QColor, QFont, QFontMetrics,
                         QImage, QLinearGradient, QPainter, QPainterPath, QPen)
from PyQt6.QtWidgets import QApplication, QMenu, QWidget

RATE = 44100
FFT_N = 4096
GRID = 320            # sand render resolution (pixels per side)
GRAINS = 26000
FPS = 50
MPRIS = "org.mpris.MediaPlayer2"
PLAYER_IF = MPRIS + ".Player"


# --------------------------------------------------------------------- audio
class AudioThread(QThread):
    """Reads raw mono float32 from `parec` and keeps a rolling buffer."""
    failed = pyqtSignal(str)

    def __init__(self, source="@DEFAULT_MONITOR@"):
        super().__init__()
        self.source = source
        self.buf = np.zeros(FFT_N, dtype=np.float32)
        self.proc = None
        self._stop = False

    def run(self):
        cmd = ["parec", "-d", self.source, "--format=float32le",
               f"--rate={RATE}", "--channels=1", "--latency-msec=20"]
        try:
            self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                                         stderr=subprocess.DEVNULL)
        except OSError as e:
            self.failed.emit(str(e))
            return
        chunk = 1024 * 2
        while not self._stop:
            data = self.proc.stdout.read(chunk)
            if not data:
                break
            x = np.frombuffer(data[: len(data) // 4 * 4], dtype=np.float32)
            if len(x) >= FFT_N:
                self.buf = x[-FFT_N:].copy()
            else:
                self.buf = np.concatenate((self.buf[len(x):], x))
        if not self._stop:
            self.failed.emit("audio capture ended")

    def stop(self):
        self._stop = True
        if self.proc:
            self.proc.terminate()
        self.wait(1000)


def list_monitors():
    try:
        out = subprocess.run(["pactl", "list", "short", "sources"],
                             capture_output=True, text=True, timeout=3).stdout
    except Exception:
        return []
    return [l.split("\t")[1] for l in out.splitlines()
            if ".monitor" in l.split("\t")[1]]


# --------------------------------------------------------------------- MPRIS
def busctl(*args, timeout=2):
    return subprocess.run(["busctl", "--user", *args], capture_output=True,
                          text=True, timeout=timeout).stdout


class Mpris:
    """Polls the active MPRIS player on a background thread."""

    def __init__(self):
        self.lock = threading.Lock()
        self.info = None          # dict or None
        self.preferred = None     # user-chosen bus name
        self.players = []
        self.art_url = None
        self.art_bytes = None
        self._art_fetched = None
        self._stop = False
        threading.Thread(target=self._loop, daemon=True).start()

    # -- polling
    def _loop(self):
        while not self._stop:
            try:
                self._poll()
            except Exception:
                with self.lock:
                    self.info = None
            time.sleep(0.5)

    def _poll(self):
        out = busctl("list", "--no-legend", "--no-pager")
        names = [l.split()[0] for l in out.splitlines()
                 if l.startswith(MPRIS + ".")]
        states = {}
        for n in names:
            raw = busctl("--json=short", "call", n, "/org/mpris/MediaPlayer2",
                         "org.freedesktop.DBus.Properties", "GetAll", "s",
                         PLAYER_IF)
            try:
                p = json.loads(raw)["data"][0]
            except Exception:
                continue
            states[n] = {k: v["data"] for k, v in p.items()}
        self.players = list(states)
        pick = None
        if self.preferred in states:
            pick = self.preferred
        else:
            for n, s in states.items():
                if s.get("PlaybackStatus") == "Playing":
                    pick = n
                    break
            if pick is None and states:
                pick = next(iter(states))
        if pick is None:
            with self.lock:
                self.info = None
            return
        s = states[pick]
        md = {k: v["data"] for k, v in s.get("Metadata", {}).items()}
        artist = md.get("xesam:artist", [])
        info = {
            "bus": pick,
            "name": pick[len(MPRIS) + 1:].split(".instance")[0],
            "status": s.get("PlaybackStatus", "Stopped"),
            "title": md.get("xesam:title") or "",
            "artist": ", ".join(artist) if isinstance(artist, list) else str(artist),
            "album": md.get("xesam:album") or "",
            "length": int(md.get("mpris:length", 0) or 0),
            "pos": int(s.get("Position", 0) or 0),
            "rate": float(s.get("Rate", 1.0) or 1.0),
            "t": time.monotonic(),
            "can_next": bool(s.get("CanGoNext")),
            "can_prev": bool(s.get("CanGoPrevious")),
            "can_seek": bool(s.get("CanSeek")),
            "track": md.get("mpris:trackid", "") + md.get("xesam:url", ""),
        }
        art = md.get("mpris:artUrl") or None
        with self.lock:
            old = self.info
            # some players never update Position; keep interpolating
            if (old and old["track"] == info["track"] and info["pos"] == 0
                    and old["status"] == "Playing" and old["pos"] > 0):
                info["pos"] = old["pos"] + int(
                    (info["t"] - old["t"]) * old["rate"] * 1e6)
            self.info = info
            self.art_url = art
        if art and art != self._art_fetched:
            self._art_fetched = art
            try:
                if art.startswith("file://"):
                    with open(urllib.request.url2pathname(art[7:]), "rb") as f:
                        data = f.read()
                else:
                    data = urllib.request.urlopen(art, timeout=4).read()
            except Exception:
                data = None
            with self.lock:
                self.art_bytes = (art, data)
        elif not art:
            with self.lock:
                self.art_bytes = (None, None)

    # -- commands
    def call(self, method, *sig_args):
        info = self.info
        if not info:
            return
        cmd = ["busctl", "--user", "call", info["bus"],
               "/org/mpris/MediaPlayer2", PLAYER_IF, method, *sig_args]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)

    def play_pause(self): self.call("PlayPause")
    def next(self): self.call("Next")
    def prev(self): self.call("Previous")
    def seek(self, offset_us): self.call("Seek", "x", str(int(offset_us)))

    def position(self):
        i = self.info
        if not i:
            return 0
        p = i["pos"]
        if i["status"] == "Playing":
            p += int((time.monotonic() - i["t"]) * i["rate"] * 1e6)
        if i["length"]:
            p = min(p, i["length"])
        return p

    def stop(self):
        self._stop = True


# ----------------------------------------------------------------------- RFT
# Resonant Fourier Transform (Minier, "What I Got Wrong", Eqs. 1-2):
#   f_k = {(k+1) phi},  Phi_nk = N^-1/2 exp(i 2 pi f_k n),  U = Phi (Phi^H Phi)^-1/2
# U is unitary, so c = U^H x preserves energy (Parseval). Fibonacci N are the
# best-conditioned dimensions (kappa(G) -> 2.848), hence 987 and 2584.
# Nothing here claims an advantage over the FFT; the menu can switch back.
PHI = (1 + math.sqrt(5)) / 2
RFT_LONG = 2584       # sustained resonance window (~59 ms)
RFT_SHORT = 987       # transient window (~22 ms)
CACHE = os.path.expanduser("~/.cache/cymatic-widget")


def rft_matrix(N):
    """U^H as complex64 (the analysis operator) plus the node frequencies."""
    f = np.mod((np.arange(N) + 1) * PHI, 1.0)
    path = os.path.join(CACHE, f"rft_{N}.npy")
    try:
        return np.load(path), f
    except OSError:
        pass
    n = np.arange(N)[:, None]
    Phi = np.exp(2j * np.pi * np.mod(n * f[None, :], 1.0)) / math.sqrt(N)
    w, V = np.linalg.eigh(Phi.conj().T @ Phi)
    U = Phi @ ((V * w ** -0.5) @ V.conj().T)
    UH = np.ascontiguousarray(U.conj().T).astype(np.complex64)
    os.makedirs(CACHE, exist_ok=True)
    np.save(path, UH)
    return UH, f


class Bank:
    """Spectral front end: magnitudes on an ascending frequency axis, plus the
    per-mode / per-band index ranges the plate reads them through."""

    def __init__(self, long_fn, flong, short_fn, fshort, mf, lo, hi, slo, shi,
                 fluxnorm=1.0):
        self.long, self.short = long_fn, short_fn
        self.lo, self.hi, self.slo, self.shi = lo, hi, slo, shi
        self.sel = (flong >= 35) & (flong < 7500)
        self.sbands = [(fshort >= a) & (fshort < b)
                       for a, b in ((35, 250), (250, 2500), (2500, 9000))]
        self.sprev = np.zeros(len(fshort), dtype=np.float32)
        self.fluxnorm = fluxnorm


def fft_bank(mf):
    win = np.hanning(FFT_N).astype(np.float32)
    sn = 1024
    swin = np.hanning(sn).astype(np.float32)
    freqs, sfreqs = np.fft.rfftfreq(FFT_N, 1 / RATE), np.fft.rfftfreq(sn, 1 / RATE)
    lo = np.floor(mf * 0.96 / (RATE / FFT_N)).astype(int)
    hi = np.maximum(lo + 2, np.ceil(mf * 1.04 / (RATE / FFT_N))).astype(int)
    slo = np.floor(mf * 0.9 / (RATE / sn)).astype(int)
    shi = np.maximum(slo + 2, np.ceil(mf * 1.1 / (RATE / sn))).astype(int)
    return Bank(lambda s: np.abs(np.fft.rfft(s * win)).astype(np.float32), freqs,
                lambda s: np.abs(np.fft.rfft(s[-sn:] * swin)).astype(np.float32),
                sfreqs, mf, lo, hi, slo, shi)


def rft_bank(mf):
    def side(N):
        UH, f = rft_matrix(N)
        eff = np.minimum(f, 1 - f) * RATE      # real input: f and 1-f coincide
        order = np.argsort(eff)
        win = np.hanning(N).astype(np.float32)
        gain = math.sqrt(N / 2)                # same scale as the rfft magnitudes
        fn = lambda s: (np.abs(UH @ (s[-N:] * win))[order] * gain).astype(np.float32)
        return fn, eff[order]

    def span(freqs, a, b, min_n=3):
        lo = np.searchsorted(freqs, mf * a)
        hi = np.searchsorted(freqs, mf * b, side="right")
        short = hi - lo < min_n             # nodes are irregular: guarantee a few
        lo = np.where(short, np.clip((lo + hi - min_n) // 2, 0, len(freqs) - min_n), lo)
        hi = np.where(short, lo + min_n, hi)
        return lo, hi

    fl, flong = side(RFT_LONG)
    fs, fshort = side(RFT_SHORT)
    lo, hi = span(flong, 0.96, 1.04)
    slo, shi = span(fshort, 0.9, 1.1)
    # flux sums magnitudes over a band; RFT has 2N/RATE nodes per Hz vs N/RATE
    return Bank(fl, flong, fs, fshort, mf, lo, hi, slo, shi,
                fluxnorm=1024 / (2 * RFT_SHORT))


# ------------------------------------------------------------------- physics
# A square plate has resonant modes phi(n, m, s) with
#   phi = cos(n pi x) cos(m pi y) - s cos(m pi x) cos(n pi y)     (s = +1 / -1)
# and resonant frequency f ~ F0 (n^2 + m^2) (the classic Chladni scaling).
# Each mode is excited only by the sound energy (in dB) at its own resonance,
# so the figure on the plate is whatever the music actually drives.
F0 = 17.0
MAXK = 15
FG = 224              # resolution of the displacement field grains read from


def build_modes():
    modes = []
    for n in range(1, MAXK):
        for m in range(n + 1, MAXK + 1):
            for s in (1, -1):
                f = F0 * (n * n + m * m) * (1 + 0.035 * s)
                if 45 <= f <= 7500:
                    modes.append((n, m, s, f))
    return modes


class Plate:
    TOP = 10  # strongest resonances that ring at once

    def __init__(self):
        self.rng = np.random.default_rng()
        self.reset()
        self.modes = build_modes()
        self.mn = np.array([k[0] for k in self.modes])
        self.mm = np.array([k[1] for k in self.modes])
        self.ms = np.array([k[2] for k in self.modes], dtype=np.float32)
        self.mf = np.array([k[3] for k in self.modes])
        self.banks = {"FFT": fft_bank(self.mf)}
        self.use_rft = True
        self.rft_state = "building"      # building -> ready | failed
        threading.Thread(target=self._load_rft, daemon=True).start()
        self.amp = np.zeros(len(self.modes))        # modal amplitudes 0..1
        xs = (np.arange(FG) + 0.5) / FG
        ks = np.arange(MAXK + 1)[:, None] * math.pi * xs[None, :]
        self.C = np.cos(ks).astype(np.float32)
        self.S = np.sin(ks).astype(np.float32)
        self.U = np.zeros((FG, FG), dtype=np.float32)
        self.UX = self.U.copy()
        self.UY = self.U.copy()
        # a short window gives transients: every new sound shows at once
        self.mband = np.where(self.mf < 250, 0, np.where(self.mf < 2500, 1, 2))
        self.bflux = np.full(3, 1.0)
        self.blast = np.full(3, -99)
        self.frame = 0
        self.db = -90.0        # measured loudness, dBFS
        self.db_ref = -40.0    # recent peak dB (auto-gain reference)
        self.band_ref = -60.0
        self.level = 0.0       # drive amplitude 0..1 derived from dB
        self.hit = 0.0
        self.hit_flash = 0.0
        self.last_hit = 0.0
        self.freq = 0.0
        self.top_mode = None

    def _load_rft(self):
        try:
            self.banks["RFT"] = rft_bank(self.mf)
            self.rft_state = "ready"
        except Exception as e:
            self.rft_state = f"failed: {e}"

    @property
    def analysis(self):
        return "RFT" if self.use_rft and "RFT" in self.banks else "FFT"

    def reset(self):
        """Empty plate: sand is added gradually as music plays."""
        self.p = self.rng.random((GRAINS, 2), dtype=np.float32)
        self.mass = 0.0
        self.falling = False
        self.tuned = False

    # ----- audio -> dB -> modal excitation (once per frame)
    def analyse(self, samples):
        rms = float(np.sqrt(np.mean(samples[-2048:] ** 2)))
        db = 20 * math.log10(rms + 1e-9)
        self.db += (db - self.db) * (0.6 if db > self.db else 0.12)
        silent = rms < 3e-4
        if silent:
            self.db_ref -= 0.2
        else:
            self.db_ref = max(db, self.db_ref - 0.04, -60.0)
        drive = 0.0 if silent else min(max((db - (self.db_ref - 40)) / 40, 0), 1)
        self.level += (drive - self.level) * (0.7 if drive > self.level else 0.08)
        self.hit *= 0.86
        self.hit_flash *= 0.9

        tgt = np.zeros(len(self.modes))
        if not silent:
            bank = self.banks[self.analysis]
            spec = bank.long(samples)
            if not self.falling:
                self.mass = min(1.0, self.mass + 0.0004 * self.level
                                + 0.0016 * self.hit)
            # --- sustained resonance: dB in each mode's band (long window)
            cs = np.concatenate(([0.0], np.cumsum(spec.astype(np.float64) ** 2)))
            e = np.sqrt((cs[bank.hi] - cs[bank.lo]) / (bank.hi - bank.lo))
            mdb = 20 * np.log10(e + 1e-9)
            peak_db = 20 * math.log10(float(spec[bank.sel].max()) + 1e-9)
            self.band_ref = max(peak_db, self.band_ref - 0.1)
            t = np.clip((mdb - (self.band_ref - 36)) / 36, 0, 1) ** 2
            idx = np.argpartition(t, -self.TOP)[-self.TOP:]
            tgt[idx] = t[idx]

            # --- transients: newest ~23 ms, flux per band (low / mid / high)
            ss = bank.short(samples)
            diff = np.maximum(ss - bank.sprev, 0)
            bank.sprev = ss
            self.frame += 1
            now = self.frame
            strength = 0.0
            hit_bands = []
            for b, mk in enumerate(bank.sbands):
                flux = float(diff[mk].sum()) * bank.fluxnorm
                ratio = flux / (self.bflux[b] + 1e-6)
                if flux > 0.6 and ratio > 1.5 and now - self.blast[b] >= 2:
                    self.blast[b] = now
                    st = min((ratio - 1) / 2.5, 1.0)
                    strength = max(strength, st)
                    hit_bands.append(b)
                self.bflux[b] += (flux - self.bflux[b]) * 0.12
            if hit_bands:
                self.hit = max(self.hit, strength)
                self.hit_flash = 1.0
                # excite the resonances this new sound actually lands on
                scs = np.concatenate(([0.0], np.cumsum(ss.astype(np.float64) ** 2)))
                se = np.sqrt((scs[bank.shi] - scs[bank.slo]) / (bank.shi - bank.slo))
                sdb = 20 * np.log10(se + 1e-9)
                ref = float(sdb[np.isin(self.mband, hit_bands)].max()) \
                    if np.isin(self.mband, hit_bands).any() else float(sdb.max())
                ts = np.clip((sdb - (ref - 24)) / 24, 0, 1) ** 2
                ts[~np.isin(self.mband, hit_bands)] = 0
                sel = np.argpartition(ts, -self.TOP)[-self.TOP:]
                burst = ts[sel] * (0.6 + 0.4 * strength)
                self.amp[sel] = np.maximum(self.amp[sel], burst)
        self.amp += (tgt - self.amp) * np.where(tgt > self.amp, 0.6, 0.07)
        self.amp[self.amp < 0.003] = 0
        self._build_field()

    def _build_field(self):
        act = np.nonzero(self.amp > 0.02)[0]
        if len(act) == 0:
            self.U[:] = 0
            self.UX[:] = 0
            self.UY[:] = 0
            return
        if len(act) > 16:                    # the 16 strongest resonances
            act = act[np.argsort(self.amp[act])[-16:]]
        C, S, pi = self.C, self.S, math.pi
        n, m = self.mn[act], self.mm[act]
        sg = self.ms[act][:, None]
        A = self.amp[act][:, None].astype(np.float32)
        inv = 1.0 / (float(A.sum()) + 1e-6)
        A = A * inv
        # field = sum_k  (y-profile_k)^T (x-profile_k): one matmul each
        self.U = (np.concatenate((A * C[m], -A * sg * C[n])).T
                  @ np.concatenate((C[n], C[m])))
        self.UX = (np.concatenate((-A * n[:, None] * pi * C[m],
                                   A * sg * m[:, None] * pi * C[n])).T
                   @ np.concatenate((S[n], S[m])))
        self.UY = (np.concatenate((-A * m[:, None] * pi * S[m],
                                   A * sg * n[:, None] * pi * S[n])).T
                   @ np.concatenate((C[n], C[m])))
        best = int(act[np.argmax(self.amp[act])])
        self.freq = float(self.mf[best])
        self.top_mode = (int(self.mn[best]), int(self.mm[best]))
        self.tuned = True

    def shake_off(self):
        """Jolt the plate, let every grain fall off the bottom, start over."""
        if self.falling or self.mass <= 0:
            return
        k = int(self.mass * GRAINS)
        self.falling = True
        self.fall_t = 0
        self.vel = np.zeros(k, dtype=np.float32)
        self.delay = self.rng.integers(0, 45, k)

    def _fall_step(self):
        q = self.p[:len(self.vel)]
        self.fall_t += 1
        if self.fall_t < 16:
            q += self.rng.standard_normal(q.shape, dtype=np.float32) * 0.006
            np.clip(q, 0, 1, out=q)
            return
        go = (self.fall_t - 16) > self.delay
        self.vel[go] += 0.0016
        q[go, 1] += self.vel[go]
        q[go, 0] += self.rng.standard_normal(int(go.sum()),
                                             dtype=np.float32) * 0.0015
        if (q[:, 1] > 1.0).all():
            self.reset()

    # ----- sand simulation: grains read the plate's displacement field
    def step(self):
        if self.falling:
            self._fall_step()
            return
        k_act = int(self.mass * GRAINS)
        if k_act < 1 or not self.tuned:
            return
        q = self.p[:k_act]
        ix = np.minimum((q[:, 0] * FG).astype(np.int32), FG - 1)
        iy = np.minimum((q[:, 1] * FG).astype(np.int32), FG - 1)
        flat = iy * FG + ix
        u = self.U.ravel()[flat]
        ux = self.UX.ravel()[flat]
        uy = self.UY.ravel()[flat]
        # vibration strength follows the measured dB level (+ hits)
        a = 0.18 + 0.82 * self.level
        a = min(a + 1.4 * self.hit, 2.2) if self.level > 0.02 else 0.0
        drift = 0.0011 * a
        kick = 0.0048 * a + 0.016 * self.hit
        # sand slides down |u|^2 toward nodal lines and is thrown off antinodes
        q[:, 0] -= drift * u * ux
        q[:, 1] -= drift * u * uy
        jitter = self.rng.standard_normal(q.shape, dtype=np.float32)
        q += jitter * (kick * np.abs(u))[:, None]
        np.abs(q, out=q)
        over = q > 1
        q[over] = 2 - q[over]
        np.clip(q, 0, 1, out=q)

    def render(self):
        q = self.p[:int(self.mass * GRAINS)]
        q = q[q[:, 1] <= 1.0]
        q = q[(q[:, 0] >= 0) & (q[:, 0] <= 1)]
        ix = (q[:, 0] * (GRID - 1)).astype(np.int32)
        iy = (q[:, 1] * (GRID - 1)).astype(np.int32)
        cnt = np.bincount(iy * GRID + ix, minlength=GRID * GRID)
        d = cnt.reshape(GRID, GRID).astype(np.float32)
        o = d.copy()
        o[1:] += 0.5 * d[:-1]; o[:-1] += 0.5 * d[1:]
        o[:, 1:] += 0.5 * d[:, :-1]; o[:, :-1] += 0.5 * d[:, 1:]
        return o


# ---------------------------------------------------------------------- UI
def fmt_time(us):
    s = int(us // 1_000_000)
    return f"{s // 60}:{s % 60:02d}"


class Widget(QWidget):
    def __init__(self, source):
        super().__init__()
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint |
                            Qt.WindowType.WindowStaysOnTopHint |
                            Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowTitle("Cymatic Plate")
        self.show_player = True
        self.show_label = True
        self.always_on_top = True
        self.base = 360
        self.apply_size(360)

        self.plate = Plate()
        self.img = QImage(GRID, GRID, QImage.Format.Format_ARGB32)
        self.sand = np.array([226, 196, 140], dtype=np.float32)
        # colour lookup: sand density -> BGRA, one gather per frame
        base = np.array([26, 29, 36], dtype=np.float32)
        v = 1 - np.exp(-np.arange(64, dtype=np.float32) / 2 * 0.9)
        col = base + (self.sand - base) * v[:, None]
        self.lut = np.empty((64, 4), dtype=np.uint8)
        self.lut[:, 0], self.lut[:, 1], self.lut[:, 2] = col[:, 2], col[:, 1], col[:, 0]
        self.lut[:, 3] = 255
        self.status = ""
        self.btn = {}
        self.bar_rect = QRectF()

        self.mpris = Mpris()
        self.art = None
        self.art_key = "__none__"

        self.audio = AudioThread(source)
        self.audio.failed.connect(self.on_fail)
        self.audio.start()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(1000 // FPS)

    # ----- geometry
    def panel_h(self, w=None):
        return int((w or self.base) * 0.30) if self.show_player else 0

    def apply_size(self, w):
        self.base = max(200, min(1200, w))
        self.setFixedSize(self.base, self.base + self.panel_h())

    def on_fail(self, msg):
        self.status = msg

    # ----- frame
    def tick(self):
        self.plate.analyse(self.audio.buf)
        self.plate.step()
        d = self.plate.render()
        rgb = self.lut[np.minimum((d * 2).astype(np.int32), 63)]
        self.frame = rgb
        self.img = QImage(self.frame.data, GRID, GRID, GRID * 4,
                          QImage.Format.Format_ARGB32)
        # pick up newly fetched cover art
        with self.mpris.lock:
            ab = self.mpris.art_bytes
        if ab and ab[0] != self.art_key:
            self.art_key = ab[0]
            self.art = None
            if ab[1]:
                im = QImage.fromData(ab[1])
                if not im.isNull():
                    self.art = im
        self.update()

    # ----- painting
    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHints(QPainter.RenderHint.Antialiasing |
                         QPainter.RenderHint.SmoothPixmapTransform |
                         QPainter.RenderHint.TextAntialiasing)
        W = self.base
        u = W / 360.0
        margin = 8
        outer = QRectF(margin, margin, W - 2 * margin, W - 2 * margin)
        grad = QLinearGradient(outer.topLeft(), outer.bottomRight())
        grad.setColorAt(0, QColor(92, 98, 110))
        grad.setColorAt(1, QColor(40, 44, 52))
        path = QPainterPath()
        path.addRoundedRect(outer, 18, 18)
        p.fillPath(path, QBrush(grad))
        inner = outer.adjusted(10, 10, -10, -10)
        clip = QPainterPath()
        clip.addRoundedRect(inner, 8, 8)
        p.setClipPath(clip)
        p.drawImage(inner, self.img)
        p.setClipping(False)
        pl = self.plate
        if pl.falling and pl.fall_t < 16:      # visible jolt of the whole plate
            p.translate(np.random.uniform(-2, 2) * u, np.random.uniform(-2, 2) * u)
        glow = QColor(255, 210, 140,
                      min(255, int(30 + 120 * pl.level + 110 * pl.hit_flash)))
        p.setPen(QPen(glow, 1.5 + 2.0 * pl.hit_flash))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(inner, 8, 8)

        if self.show_label:
            p.setPen(QColor(235, 225, 200, 190))
            f = QFont(); f.setPixelSize(max(10, int(11 * u)))
            p.setFont(f)
            if self.status:
                txt = self.status
            elif pl.level > 0.02 and pl.top_mode:
                txt = (f"{pl.db:4.0f} dB · {pl.freq:5.0f} Hz "
                       f"· mode {pl.top_mode[0]},{pl.top_mode[1]} · {pl.analysis}")
            elif pl.use_rft and pl.rft_state == "building":
                txt = "building RFT (first run only)…"
            else:
                txt = f"listening… {pl.analysis}"
            p.drawText(QRectF(inner.left() + 8, inner.top() + 4, 260 * u, 20),
                       Qt.AlignmentFlag.AlignLeft, txt)

        # dB meter: how hard the system is driving the plate
        mw, my = 90 * u, inner.top() + 24 * u
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(0, 0, 0, 110))
        p.drawRoundedRect(QRectF(inner.left() + 8, my, mw, 4 * u), 2, 2)
        p.setBrush(QColor(226, 196, 140, 230))
        p.drawRoundedRect(QRectF(inner.left() + 8, my, mw * min(pl.level, 1), 4 * u), 2, 2)
        self.btn = {}
        # shake-off button (top-right of the plate)
        f = QFont(); f.setPixelSize(max(9, int(10 * u))); f.setBold(True)
        p.setFont(f)
        label = "SHAKING…" if pl.falling else "⟲  SHAKE OFF"
        bw = QFontMetrics(f).horizontalAdvance(label) + 18 * u
        bh = 20 * u
        brect = QRectF(inner.right() - bw - 6 * u, inner.top() + 6 * u, bw, bh)
        en = pl.mass > 0 and not pl.falling
        self.btn["shake"] = (brect, en)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(226, 196, 140, 235) if en else
                   QColor(24, 26, 32, 190))
        p.drawRoundedRect(brect, bh / 2, bh / 2)
        p.setPen(QColor(24, 26, 32) if en else QColor(190, 180, 160, 200))
        p.drawText(brect, Qt.AlignmentFlag.AlignCenter, label)
        p.resetTransform()
        if self.show_player:
            self.paint_panel(p, u)

    def paint_panel(self, p, u):
        W = self.base
        ph = self.panel_h()
        top = W - 2
        panel = QRectF(8, top, W - 16, ph - 8)
        path = QPainterPath()
        path.addRoundedRect(panel, 14, 14)
        p.fillPath(path, QColor(24, 26, 32, 235))
        info = self.mpris.info

        pad = 10 * u
        art_sz = panel.height() - 2 * pad
        art_r = QRectF(panel.left() + pad, panel.top() + pad, art_sz, art_sz)
        ap = QPainterPath()
        ap.addRoundedRect(art_r, 8, 8)
        if self.art:
            p.save(); p.setClipPath(ap)
            p.drawImage(art_r, self.art.scaled(
                int(art_sz * 2), int(art_sz * 2),
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation))
            p.restore()
        else:
            p.fillPath(ap, QColor(48, 52, 62))
            p.setPen(QColor(150, 150, 160))
            f = QFont(); f.setPixelSize(int(art_sz * 0.5)); p.setFont(f)
            p.drawText(art_r, Qt.AlignmentFlag.AlignCenter, "♪")

        x0 = art_r.right() + 12 * u
        x1 = panel.right() - pad
        tw = x1 - x0

        def draw_text(txt, y, px, color, bold=False):
            f = QFont(); f.setPixelSize(max(9, int(px * u))); f.setBold(bold)
            p.setFont(f)
            p.setPen(color)
            el = QFontMetrics(f).elidedText(txt, Qt.TextElideMode.ElideRight,
                                            int(tw))
            p.drawText(QPointF(x0, y), el)

        y = panel.top() + pad + 13 * u
        if info:
            draw_text(info["title"] or "Unknown track", y, 14,
                      QColor(245, 240, 228), True)
            sub = info["artist"] or info["album"] or info["name"].title()
            draw_text(sub, y + 18 * u, 12, QColor(170, 172, 182))
        else:
            draw_text("Nothing playing", y, 14, QColor(200, 196, 188), True)
            draw_text("no media player found", y + 18 * u, 12,
                      QColor(140, 142, 152))

        # progress bar (only when the player reports a length)
        self.bar_rect = QRectF()
        by = panel.top() + pad + 44 * u
        if info and info["length"] > 0:
            pos = self.mpris.position()
            frac = pos / info["length"]
            self.bar_rect = QRectF(x0, by - 4 * u, tw, 10 * u)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(70, 74, 86))
            p.drawRoundedRect(QRectF(x0, by, tw, 3 * u), 1.5, 1.5)
            p.setBrush(QColor(226, 196, 140))
            p.drawRoundedRect(QRectF(x0, by, tw * frac, 3 * u), 1.5, 1.5)
            p.drawEllipse(QPointF(x0 + tw * frac, by + 1.5 * u), 4 * u, 4 * u)
            f = QFont(); f.setPixelSize(max(8, int(9 * u))); p.setFont(f)
            p.setPen(QColor(140, 142, 152))
            p.drawText(QPointF(x0, by + 13 * u), fmt_time(pos))
            rt = fmt_time(info["length"])
            p.drawText(QPointF(x1 - QFontMetrics(f).horizontalAdvance(rt),
                               by + 13 * u), rt)

        # transport buttons
        cy = panel.bottom() - pad - 10 * u
        cx = x0 + tw / 2
        sz = 13 * u
        playing = bool(info and info["status"] == "Playing")
        specs = [("prev", cx - 44 * u, sz, bool(info and info["can_prev"])),
                 ("play", cx, sz * 1.25, bool(info)),
                 ("next", cx + 44 * u, sz, bool(info and info["can_next"]))]
        for name, bx, r, en in specs:
            rect = QRectF(bx - r - 4, cy - r - 4, 2 * r + 8, 2 * r + 8)
            self.btn[name] = (rect, en)
            col = QColor(245, 240, 228) if en else QColor(100, 102, 112)
            if name == "play":
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QColor(226, 196, 140) if en else QColor(70, 74, 86))
                p.drawEllipse(QPointF(bx, cy), r, r)
                col = QColor(24, 26, 32)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(col)
            s = r * 0.5
            if name == "play":
                if playing:
                    p.drawRoundedRect(QRectF(bx - s * 0.8, cy - s, s * 0.6, 2 * s), 1, 1)
                    p.drawRoundedRect(QRectF(bx + s * 0.2, cy - s, s * 0.6, 2 * s), 1, 1)
                else:
                    tri = QPainterPath()
                    tri.moveTo(bx - s * 0.6, cy - s); tri.lineTo(bx + s, cy)
                    tri.lineTo(bx - s * 0.6, cy + s); tri.closeSubpath()
                    p.drawPath(tri)
            else:
                d = -1 if name == "prev" else 1
                for off in (-0.45, 0.45):
                    tri = QPainterPath()
                    ox = bx + d * off * r
                    tri.moveTo(ox - d * s * 0.7, cy - s * 0.9)
                    tri.lineTo(ox + d * s * 0.7, cy)
                    tri.lineTo(ox - d * s * 0.7, cy + s * 0.9)
                    tri.closeSubpath()
                    p.drawPath(tri)

    # ----- input
    def mousePressEvent(self, e):
        if e.button() != Qt.MouseButton.LeftButton:
            return
        pt = e.position()
        for name, (rect, en) in self.btn.items():
            if rect.contains(pt):
                if en:
                    {"prev": self.mpris.prev, "play": self.mpris.play_pause,
                     "next": self.mpris.next,
                     "shake": self.plate.shake_off}[name]()
                return
        info = self.mpris.info
        if (info and info["length"] and info["can_seek"]
                and not self.bar_rect.isNull() and self.bar_rect.contains(pt)):
            frac = (pt.x() - self.bar_rect.left()) / self.bar_rect.width()
            self.mpris.seek(frac * info["length"] - self.mpris.position())
            return
        wh = self.windowHandle()
        if wh:
            wh.startSystemMove()

    def wheelEvent(self, e):
        self.apply_size(self.base + (24 if e.angleDelta().y() > 0 else -24))

    def contextMenuEvent(self, e):
        menu = QMenu(self)
        m = self.mpris
        if m.info:
            menu.addAction("Previous", m.prev)
            menu.addAction("Pause" if m.info["status"] == "Playing" else "Play",
                           m.play_pause)
            menu.addAction("Next", m.next)
            menu.addSeparator()
        if len(m.players) > 1:
            pm = menu.addMenu("Player")
            g = QActionGroup(pm)
            cur = m.info["bus"] if m.info else None
            for n in m.players:
                a = pm.addAction(n[len(MPRIS) + 1:].split(".instance")[0])
                a.setCheckable(True)
                a.setChecked(n == cur)
                a.triggered.connect(lambda _, n=n: setattr(m, "preferred", n))
                g.addAction(a)
        src = menu.addMenu("Audio source")
        grp = QActionGroup(src)
        a = src.addAction("Default output (auto)")
        a.setCheckable(True)
        a.setChecked(self.audio.source == "@DEFAULT_MONITOR@")
        a.triggered.connect(lambda: self.set_source("@DEFAULT_MONITOR@"))
        grp.addAction(a)
        for name in list_monitors():
            a = src.addAction(name.replace(".monitor", ""))
            a.setCheckable(True)
            a.setChecked(self.audio.source == name)
            a.triggered.connect(lambda _, n=name: self.set_source(n))
            grp.addAction(a)
        act = menu.addAction("Analysis: RFT (golden-ratio nodes)")
        act.setCheckable(True)
        act.setChecked(self.plate.use_rft)
        act.toggled.connect(lambda v: setattr(self.plate, "use_rft", v))
        menu.addAction("Shake off sand", self.plate.shake_off)
        for text, attr, cb in (
                ("Show player panel", "show_player", self.toggle_player),
                ("Show frequency label", "show_label", None),
                ("Always on top", "always_on_top", self.set_on_top)):
            act = menu.addAction(text)
            act.setCheckable(True)
            act.setChecked(getattr(self, attr))
            act.toggled.connect(cb or (lambda v, a=attr: setattr(self, a, v)))
        menu.addSeparator()
        menu.addAction("Quit", QApplication.quit)
        menu.exec(e.globalPos())

    def toggle_player(self, v):
        self.show_player = v
        self.apply_size(self.base)

    def set_on_top(self, v):
        self.always_on_top = v
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, v)
        self.show()

    def set_source(self, name):
        self.status = ""
        self.audio.stop()
        self.audio = AudioThread(name)
        self.audio.failed.connect(self.on_fail)
        self.audio.start()

    def closeEvent(self, e):
        self.audio.stop()
        self.mpris.stop()
        super().closeEvent(e)


def main():
    app = QApplication(sys.argv)
    app.aboutToQuit.connect(lambda: (w.audio.stop(), w.mpris.stop()))
    w = Widget(sys.argv[1] if len(sys.argv) > 1 else "@DEFAULT_MONITOR@")
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
