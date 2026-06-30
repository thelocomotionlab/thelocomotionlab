"""Coût énergétique de la course en fonction de la pente (Minetti et al., 2002).

Loi physique FIXE (twin-theory §1.4), partagée par le module parcours (distance
équivalente à plat) et le jumeau (vitesse ajustée à la pente). Les coefficients ne
sont PAS des paramètres : ce sont les constantes publiées.
"""

from __future__ import annotations

import numpy as np

# Cr(i) = 155.4 i^5 − 30.4 i^4 − 43.3 i^3 + 46.3 i^2 + 19.5 i + 3.6   (J·kg⁻¹·m⁻¹)
_COEFFS = (3.6, 19.5, 46.3, -43.3, -30.4, 155.4)  # constante .. i^5


def cost_of_running(grade):
    """Coût énergétique ``Cr(i)`` (J·kg⁻¹·m⁻¹). ``Cr(0) = 3.6``."""
    i = np.asarray(grade, dtype=float)
    c0, c1, c2, c3, c4, c5 = _COEFFS
    return c0 + c1 * i + c2 * i**2 + c3 * i**3 + c4 * i**4 + c5 * i**5


def grade_factor(grade, cr0: float = 3.6, cap: float | None = None):
    """Facteur de pente ``f(i) = Cr(i)/Cr(0)`` : « mètres à plat par mètre de pente i ».

    ``cap`` (ex. 3.0 pour la vitesse ajustée par seconde) plafonne ``f`` ; ``None``
    le laisse libre (cas du Deq de parcours, où la pente est déjà écrêtée à ±0,45).
    """
    f = cost_of_running(grade) / cr0
    if cap is not None:
        f = np.minimum(f, cap)
    return f


__all__ = ["cost_of_running", "grade_factor"]
