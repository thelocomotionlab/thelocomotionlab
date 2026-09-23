"""L'email : le plan qui part à l'athlète, la réponse à sa demande.

Même relais SMTP que le reste de la stack (Brevo), configuré par les mêmes variables
d'environnement que ``twin-depot`` et ``atelier-api`` : ``SMTP_HOST``, ``SMTP_PORT``,
``SMTP_USER``, ``SMTP_PASS``, ``SMTP_FROM``.

À la différence des emails du dépôt, qui partent « au mieux » sans jamais bloquer un
upload, ceux-ci sont le geste lui-même : Valentin clique « Envoyer » et doit savoir si
c'est parti. Un échec remonte donc, et le plan n'est pas marqué envoyé.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path


class CourrierIndisponible(RuntimeError):
    """Pas de relais configuré, ou le relais a refusé : rien n'est parti."""


@dataclass(frozen=True)
class PieceJointe:
    nom: str
    contenu: bytes
    type_mime: str = "application/pdf"


@dataclass(frozen=True)
class Courrier:
    hote: str = ""
    port: int = 587
    utilisateur: str = ""
    mot_de_passe: str = ""
    expediteur: str = ""

    @classmethod
    def depuis_environnement(cls, env=None) -> "Courrier":
        env = env if env is not None else os.environ
        return cls(
            hote=env.get("SMTP_HOST", ""),
            port=int(env.get("SMTP_PORT") or 587),
            utilisateur=env.get("SMTP_USER", ""),
            mot_de_passe=env.get("SMTP_PASS", ""),
            expediteur=env.get("SMTP_FROM", ""),
        )

    @property
    def configure(self) -> bool:
        return bool(self.hote and self.expediteur)

    def envoyer(self, *, a: str, objet: str, corps: str,
                pieces: tuple[PieceJointe, ...] = ()) -> str:
        """Envoie, et rend l'identifiant du message. Lève si rien n'est parti."""
        if not self.configure:
            raise CourrierIndisponible("aucun relais SMTP configuré (SMTP_HOST, SMTP_FROM)")
        if not a or "@" not in a:
            raise CourrierIndisponible("l'athlète n'a pas d'adresse email")

        message = EmailMessage()
        message["From"] = self.expediteur
        message["To"] = a
        message["Subject"] = objet
        identifiant = make_msgid(domain=_domaine(self.expediteur))
        message["Message-ID"] = identifiant
        message.set_content(corps)
        for piece in pieces:
            principal, _, secondaire = piece.type_mime.partition("/")
            message.add_attachment(piece.contenu, maintype=principal, subtype=secondaire,
                                   filename=piece.nom)
        try:
            if self.port == 465:
                with smtplib.SMTP_SSL(self.hote, self.port, timeout=30,
                                      context=ssl.create_default_context()) as smtp:
                    self._remettre(smtp, message)
            else:
                with smtplib.SMTP(self.hote, self.port, timeout=30) as smtp:
                    smtp.starttls(context=ssl.create_default_context())
                    self._remettre(smtp, message)
        except (OSError, smtplib.SMTPException) as exc:
            # Le message du relais dit ce qui a coincé (adresse refusée, quota) ; il ne
            # porte ni le mot de passe ni le contenu.
            raise CourrierIndisponible(f"le relais SMTP a refusé : {exc}") from exc
        return identifiant

    def _remettre(self, smtp, message: EmailMessage) -> None:
        if self.utilisateur:
            smtp.login(self.utilisateur, self.mot_de_passe)
        smtp.send_message(message)


def _domaine(expediteur: str) -> str | None:
    adresse = expediteur.rsplit("<", 1)[-1].rstrip(">").strip()
    return adresse.split("@", 1)[1] if "@" in adresse else None


def piece_pdf(chemin: Path, nom: str) -> PieceJointe:
    return PieceJointe(nom=nom, contenu=Path(chemin).read_bytes())


def destinataire(athlete: dict) -> str:
    """« Val <val@exemple.fr> », ou l'adresse seule quand on n'a pas de nom."""
    email = str(athlete.get("email") or "")
    nom = str(athlete.get("prenom") or athlete.get("pseudo") or "")
    return formataddr((nom, email)) if nom and email else email


__all__ = ["Courrier", "CourrierIndisponible", "PieceJointe", "destinataire", "piece_pdf"]
