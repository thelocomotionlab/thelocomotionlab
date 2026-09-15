"""Petites fonctions statistiques sans scipy (retiré des dépendances, revue 2026-07).

Loi de Student : fonction de répartition par la fonction bêta incomplète régularisée
(fraction continue, Numerical Recipes §6.4) et quantile par dichotomie. Précision ~1e-9,
largement suffisante pour des quantiles 50/80 à quelques degrés de liberté.
"""

from __future__ import annotations

import math

import numpy as np


def _betacf(a: float, b: float, x: float, *, max_iter: int = 300, eps: float = 3e-16) -> float:
    """Fraction continue de la bêta incomplète (algorithme de Lentz modifié)."""
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / (c if abs(c) > tiny else tiny)
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / (c if abs(c) > tiny else tiny)
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def betainc(a: float, b: float, x: float) -> float:
    """Bêta incomplète régularisée I_x(a, b), x ∈ [0, 1]."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    ln_front = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                + a * math.log(x) + b * math.log1p(-x))
    front = math.exp(ln_front)
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1.0 - x) / b


def student_t_cdf(t: float, nu: float) -> float:
    """P(T ≤ t) pour T ~ Student(ν)."""
    if nu <= 0:
        raise ValueError("degrés de liberté strictement positifs requis")
    x = nu / (nu + t * t)
    tail = 0.5 * betainc(nu / 2.0, 0.5, x)
    return 1.0 - tail if t >= 0 else tail


def student_t_quantile(p: float, nu: float) -> float:
    """Quantile t_ν(p) par dichotomie (symétrie autour de 0 ; ν infini → loi normale)."""
    if not 0.0 < p < 1.0:
        raise ValueError("p doit être dans ]0, 1[")
    if p == 0.5:
        return 0.0
    if p < 0.5:
        return -student_t_quantile(1.0 - p, nu)
    if math.isinf(nu):
        # normale : dichotomie sur erf
        lo, hi = 0.0, 40.0
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            if 0.5 * (1.0 + math.erf(mid / math.sqrt(2.0))) < p:
                lo = mid
            else:
                hi = mid
        return 0.5 * (lo + hi)
    lo, hi = 0.0, 1.0
    while student_t_cdf(hi, nu) < p and hi < 1e9:
        hi *= 2.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if student_t_cdf(mid, nu) < p:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-10 * max(1.0, hi):
            break
    return 0.5 * (lo + hi)


def weighted_median(values, weights) -> float:
    """Médiane pondérée (première valeur où la masse cumulée atteint la moitié)."""
    v = np.asarray(values, dtype=float)
    w = np.asarray(weights, dtype=float)
    order = np.argsort(v)
    v, w = v[order], w[order]
    cum = np.cumsum(w)
    return float(v[int(np.searchsorted(cum, 0.5 * cum[-1], side="left"))])


__all__ = ["betainc", "student_t_cdf", "student_t_quantile", "weighted_median"]
