"""Plate mode shapes on a FG x FG grid, shared by the desktop app and the web export.

square: free-edge Kirchhoff plate, solved with Ritz's method over products of
        free-free beam functions X_i(x) X_j(y).  With the beam functions
        orthonormal, the mass matrix is the identity and the stiffness is
            K[(ij),(kl)] = A[ik] d[jl] + d[ik] A[jl]
                           + nu (C[ik] C[lj] + C[ki] C[jl]) + 2 (1-nu) B[ik] B[jl]
        with A = int X''X'', B = int X'X', C[ik] = int X_i'' X_k.  Eigenvalue
        mu = k^4, and frequency is proportional to sqrt(mu) (= k^2).
circle: clamped-membrane Bessel modes J_m(a r) cos/sin(m theta), with plate-like
        frequency ~ a^2 so the modal density matches the square plate.

Mode fields are normalised to max |W| = 1 and returned as float32 (count, FG*FG),
row-major [y, x].
"""
import math
import os

import numpy as np

FG = 160
NU = 0.3
FS = 5.5            # Hz per unit of sqrt(mu)  -> lowest free-square mode ~ 74 Hz
FC = 12.8           # Hz per a^2 for the circle -> lowest mode ~ 74 Hz
FMIN, FMAX = 45.0, 7500.0
CACHE = os.path.expanduser("~/.cache/cymatic-widget")


# ------------------------------------------------------------ free-free beam
def _beam_roots(n):
    """Roots of cos(l) cosh(l) = 1 for beam modes 2..n-1."""
    roots = []
    for m in range(2, n):
        lam = (2 * m - 1) * math.pi / 2
        for _ in range(60):
            E = math.exp(-lam)
            f = math.cos(lam) - 2 * E / (1 + E * E)            # cos l - 1/cosh l
            df = -math.sin(lam) + 2 * E * (1 - E * E) / (1 + E * E) ** 2 * 1.0
            step = f / df
            lam -= step
            if abs(step) < 1e-13:
                break
        roots.append(lam)
    return roots


def beam_functions(n, x):
    """X, X', X'' for the first n free-free beam modes (unit L2 norm), shape (n, len(x)).

    Written with e^{-lam} factors so large lam stays stable (cosh/sinh overflow
    and cancel catastrophically in the textbook form)."""
    x = np.asarray(x, dtype=np.float64)
    X = np.zeros((n, len(x))); X1 = np.zeros_like(X); X2 = np.zeros_like(X)
    X[0] = 1.0
    X[1] = math.sqrt(3) * (1 - 2 * x); X1[1] = -2 * math.sqrt(3)
    for m, lam in zip(range(2, n), _beam_roots(n)):
        E = math.exp(-lam)
        D = (1 - E * E - 2 * E * math.sin(lam)) / 2
        C = (1 + E * E - 2 * E * math.cos(lam)) / 2
        sig = C / D
        a1 = (math.cos(lam) - math.sin(lam) - E) / (2 * D)
        b1 = (1 - E * math.sin(lam) - E * math.cos(lam)) / (2 * D)
        A = np.exp(lam * (x - 1)); B = np.exp(-lam * x)
        c, s = np.cos(lam * x), np.sin(lam * x)
        X[m] = c - sig * s + a1 * A + b1 * B
        X1[m] = lam * (-s - sig * c + a1 * A - b1 * B)
        X2[m] = lam * lam * (-c + sig * s + a1 * A + b1 * B)
    return X, X1, X2


def unit_beams(nb, x):
    """beam_functions normalised to unit L2 norm on [0, 1] (Gauss-Legendre quadrature)."""
    xq, wq = np.polynomial.legendre.leggauss(700)
    xq = (xq + 1) / 2; wq = wq / 2
    nrm = np.sqrt((beam_functions(nb, xq)[0] ** 2 * wq).sum(1))
    return [f / nrm[:, None] for f in beam_functions(nb, x)]


def free_square_modes(nb=24, nu=NU):
    """Eigenvalues sqrt(mu) (ascending, rigid-body modes dropped) and mode coefficients."""
    xq, wq = np.polynomial.legendre.leggauss(700)
    xq = (xq + 1) / 2; wq = wq / 2
    X, X1, X2 = unit_beams(nb, xq)
    M = (X * wq) @ X.T
    assert np.allclose(M, np.eye(nb), atol=1e-8), "beam functions not orthonormal"
    A = (X2 * wq) @ X2.T
    B = (X1 * wq) @ X1.T
    C = (X2 * wq) @ X.T                       # C[i,k] = int X_i'' X_k
    I = np.eye(nb)
    K = (np.einsum("ik,jl->ijkl", A, I) + np.einsum("ik,jl->ijkl", I, A)
         + nu * (np.einsum("ik,lj->ijkl", C, C) + np.einsum("ki,jl->ijkl", C, C))
         + 2 * (1 - nu) * np.einsum("ik,jl->ijkl", B, B)).reshape(nb * nb, nb * nb)
    mu, V = np.linalg.eigh((K + K.T) / 2)
    keep = mu > 1e-6                          # drops the three rigid-body modes
    return np.sqrt(mu[keep]), V[:, keep].T.reshape(-1, nb, nb)


def square_modes(nb=24):
    lam, coef = free_square_modes(nb)
    g = (np.arange(FG) + 0.5) / FG
    Xg = unit_beams(nb, g)[0]
    # accuracy: modes whose eigenvalue moved >1% when the basis grew are not converged
    lam2, _ = free_square_modes(nb + 6)
    n = min(len(lam), len(lam2))
    bad = np.abs(lam[:n] - lam2[:n]) / lam2[:n] > 0.01
    ok = int(np.argmax(bad)) if bad.any() else n
    f = FS * lam[:ok]
    sel = np.nonzero((f >= FMIN) & (f <= FMAX))[0]
    W = np.empty((len(sel), FG * FG), dtype=np.float32)
    la = np.empty(len(sel), dtype=np.uint8); lb = np.empty(len(sel), dtype=np.uint8)
    for r, i in enumerate(sel):
        c = coef[i]
        w = Xg.T @ (c.T @ Xg)                 # [y, x] = sum_ij c[i,j] X_i(x) X_j(y)
        W[r] = (w / np.abs(w).max()).ravel()
        a, b = np.unravel_index(np.argmax(c * c), c.shape)
        la[r], lb[r] = a, b
    return dict(freq=f[sel].astype(np.float32), la=la, lb=lb, W=W, lam=lam[sel])


# ------------------------------------------------------------------- circle
def bessel_j(m, x, n=1024):
    """J_m(x) from the integral (1/pi) int_0^pi cos(m t - x sin t) dt (spectrally accurate)."""
    t = (np.arange(n) + 0.5) * math.pi / n
    x = np.asarray(x, dtype=np.float64)
    return np.cos(m * t[None, :] - x.reshape(-1, 1) * np.sin(t)[None, :]).mean(1).reshape(x.shape)


def bessel_zeros(m, xmax):
    xs = np.arange(0.01, xmax + 0.5, 0.02)
    v = bessel_j(m, xs)
    zs = []
    for i in np.nonzero(v[:-1] * v[1:] < 0)[0]:
        a, b = xs[i], xs[i + 1]
        for _ in range(50):
            c = 0.5 * (a + b)
            if bessel_j(m, np.array([a]))[0] * bessel_j(m, np.array([c]))[0] <= 0:
                b = c
            else:
                a = c
        zs.append(0.5 * (a + b))
    return zs


def circle_modes():
    amax = math.sqrt(FMAX / FC)
    g = (np.arange(FG) + 0.5) / FG
    yy, xx = np.meshgrid(g, g, indexing="ij")
    rho = np.hypot(xx - 0.5, yy - 0.5) / 0.5
    th = np.arctan2(yy - 0.5, xx - 0.5)
    rr = np.linspace(0, 1, 4001)
    modes = []
    for m in range(0, 40):
        zs = bessel_zeros(m, amax)
        if not zs and m > 0:
            break
        for n, a in enumerate(zs, start=1):
            f = FC * a * a
            if f < FMIN or f > FMAX:
                continue
            rad = np.interp(rho, rr, bessel_j(m, a * rr))
            rad[rho > 1] = 0
            for trig in ((np.cos,) if m == 0 else (np.cos, np.sin)):
                w = rad * trig(m * th)
                modes.append((f, m, n, (w / np.abs(w).max()).ravel()))
    modes.sort(key=lambda t: t[0])
    return dict(freq=np.array([t[0] for t in modes], np.float32),
                la=np.array([t[1] for t in modes], np.uint8),
                lb=np.array([t[2] for t in modes], np.uint8),
                W=np.stack([t[3] for t in modes]).astype(np.float32))


# ------------------------------------------------------------------- loader
def load(shape):
    """Mode set for 'square' or 'circle', cached on disk after the first solve."""
    path = os.path.join(CACHE, f"modes_{shape}_{FG}.npz")
    try:
        z = np.load(path)
        return {k: z[k] for k in ("freq", "la", "lb", "W")}
    except (OSError, KeyError):
        pass
    d = square_modes() if shape == "square" else circle_modes()
    os.makedirs(CACHE, exist_ok=True)
    np.savez(path, **{k: d[k] for k in ("freq", "la", "lb", "W")})
    return d
