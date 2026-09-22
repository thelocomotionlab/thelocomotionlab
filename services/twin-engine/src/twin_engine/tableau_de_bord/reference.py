"""Les deux familles de références du moteur, au même endroit.

Même forme — « LL-NICE26-VAL-… » — et une différence qui compte, dans la dernière part.

``reference_de_rapport`` (le CLI) la **tire au hasard** : ces six caractères SONT le
secret, ce qui rend l'adresse de l'annexe non devinable.

``reference_de_plan`` (le tableau de bord) la **calcule**. Le secret a déménagé dans
les deux clés du plan (HMAC, paramètre ``k``, récapitulatif §4.2), ce qui libère la
référence : elle peut enfin être stable.

Stable veut dire dérivée de l'athlète, de la course et de l'édition — **jamais de l'id
du job**. Un job est un passage ; la référence désigne un plan, qui survit à toutes ses
générations, porte son répertoire sur le volume et se dicte au téléphone.

Elle est calculée UNE FOIS, à la création du plan, puis relue depuis l'objet : le
répertoire ``plans/{ref}/`` en dépend, et renommer un athlète ne doit pas déplacer ses
documents. La fonction, elle, reste pure et déterministe — c'est ce que le test vérifie.

Deux athlètes de même pseudo sur la même course ne se marchent pas dessus : les quatre
derniers caractères sont une empreinte des identifiants, pas du texte affiché.
"""

from __future__ import annotations

import hashlib
from secrets import token_hex

# Le préfixe de la maison, déjà porté par les références du service de dépôt.
PREFIXE = "LL"

_SANS_ACCENT = str.maketrans(
    "ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüý",
    "AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuy",
)


def slug(texte: str, n: int) -> str:
    """Le PREMIER mot d'un nom, en capitales sans accent, tronqué à ``n`` caractères.

    Le premier mot suffit à reconnaître une course (« Nice Côte d'Azur by UTMB » → NICE)
    et évite les collages illisibles qu'une troncature sur la chaîne entière produirait.
    """
    mots = [m for m in str(texte).translate(_SANS_ACCENT).split() if any(c.isalnum() for c in m)]
    garde = "".join(c for c in (mots[0] if mots else "") if c.isalnum())
    return garde.upper()[:n]


def empreinte(athlete_id: str, course_id: str) -> str:
    """Quatre caractères qui ne disent rien et distinguent tout."""
    return hashlib.sha256(f"{athlete_id}\n{course_id}".encode()).hexdigest()[:4].upper()


def reference_de_rapport(race, athlete: str) -> str:
    """Référence d'un rapport produit au CLI : ``LL-NICE26-VAL-A3F9C1``.

    Les trois premières parts se lisent (course, année de la course, athlète) — c'est ce
    qui permet de retrouver un rapport dans un dossier ou au registre. La dernière est
    tirée au hasard : c'est elle, et elle seule, qui rend l'adresse de l'annexe non
    devinable.
    """
    course = slug(race.name, 6) or "COURSE"
    annee = f"{race.start_time.year % 100:02d}" if race.start_time else ""
    qui = slug(athlete, 3) or "ATH"
    return f"{PREFIXE}-{course}{annee}-{qui}-{token_hex(3).upper()}"


def reference_de_plan(
    *, athlete_id: str, pseudo: str, course_id: str, course_nom: str, edition: int | None
) -> str:
    """La référence du plan de cet athlète sur cette course, dans cette édition."""
    course = slug(course_nom, 6) or "COURSE"
    annee = f"{int(edition) % 100:02d}" if edition else ""
    qui = slug(pseudo, 3) or slug(athlete_id, 3) or "ATH"
    return f"{PREFIXE}-{course}{annee}-{qui}-{empreinte(athlete_id, course_id)}"


__all__ = ["PREFIXE", "empreinte", "reference_de_plan", "reference_de_rapport", "slug"]
