"""La charte du rapport : les tokens de ``packages/ui/src/styles/theme.css``, et rien d'autre.

Source unique des couleurs côté Python (figures matplotlib, annexe) ; la classe LaTeX
``locomotionreport.cls`` redéfinit les mêmes valeurs avec ``\\definecolor`` en citant le
token en commentaire — un test vérifie que les trois (theme.css, ce module, la classe)
disent la même chose, pour qu'une retouche de la charte web ne laisse pas le PDF dériver.
"""

from __future__ import annotations

# nom court → (token CSS, valeur)
TOKENS: dict[str, tuple[str, str]] = {
    "bg": ("--color-brand-bg", "#FEFBF6"),
    "primary": ("--color-brand-primary", "#8CB9BD"),
    "primary_light": ("--color-brand-primary-light", "#A8CDD0"),
    "primary_dark": ("--color-brand-primary-dark", "#6E9CA0"),
    "accent": ("--color-brand-accent", "#EFB159"),
    "accent_light": ("--color-brand-accent-light", "#F4C480"),
    "accent_dark": ("--color-brand-accent-dark", "#D89A3D"),
    "accent_ink": ("--color-brand-accent-ink", "#C08327"),
    "deep": ("--color-brand-deep", "#B67352"),
    "deep_light": ("--color-brand-deep-light", "#C68F76"),
    "deep_dark": ("--color-brand-deep-dark", "#9A6044"),
    "text": ("--color-brand-text", "#333333"),
    "paper": ("--color-brand-paper", "#FFFFFF"),
    "planche_fond": ("--color-brand-planche-fond", "#1A1C18"),
    "planche_encre": ("--color-brand-planche-encre", "#22241E"),
    "trace": ("--color-brand-trace", "#D6246E"),
    "grid": ("--color-brand-grid", "#F3EEE6"),
    "success": ("--color-brand-success", "#3F8F5B"),
    "wash": ("--color-brand-wash", "#D3E2E3"),
    "slate": ("--color-brand-slate", "#5B8286"),
    "slate_dark": ("--color-brand-slate-dark", "#4E767A"),
    "mist": ("--color-brand-mist", "#EBF0ED"),
    "mist_line": ("--color-brand-mist-line", "#D9E4E4"),
    "hairline": ("--color-brand-hairline", "#E5DFD3"),
    "field": ("--color-brand-field", "#E2DCD0"),
    "gauge": ("--color-brand-gauge", "#F0EAE0"),
    "gauge_full": ("--color-brand-gauge-full", "#D6D0C4"),
    "wash_line": ("--color-brand-wash-line", "#C9D8D9"),
    "muted": ("--color-brand-muted", "#6B7280"),
    "soft": ("--color-brand-soft", "#4B5563"),
    "ink": ("--color-brand-ink", "#374151"),
    "faint": ("--color-brand-faint", "#9CA3AF"),
    "sensations": ("--color-brand-sensations", "#FAF5EC"),
}


def hexa(name: str) -> str:
    """Valeur hexadécimale d'un token (« #RRGGBB »)."""
    return TOKENS[name][1]


# les mêmes tokens côté LaTeX : nom de couleur de la classe → nom court
CLS_COLORS: dict[str, str] = {
    "LLBg": "bg", "LLPrimary": "primary", "LLPrimaryLight": "primary_light",
    "LLPrimaryDark": "primary_dark", "LLAccent": "accent", "LLAccentLight": "accent_light",
    "LLAccentDark": "accent_dark", "LLAccentInk": "accent_ink", "LLDeep": "deep",
    "LLDeepLight": "deep_light", "LLDeepDark": "deep_dark", "LLText": "text",
    "LLPaper": "paper", "LLPlancheFond": "planche_fond", "LLPlancheEncre": "planche_encre",
    "LLTrace": "trace", "LLGrid": "grid", "LLSuccess": "success", "LLWash": "wash",
    "LLSlate": "slate", "LLSlateDark": "slate_dark", "LLMist": "mist",
    "LLMistLine": "mist_line", "LLHairline": "hairline", "LLField": "field",
    "LLGauge": "gauge", "LLGaugeFull": "gauge_full", "LLWashLine": "wash_line",
    "LLMuted": "muted", "LLSoft": "soft", "LLInk": "ink", "LLFaint": "faint",
    "LLSensations": "sensations",
}

# police de la charte : Ubuntu Sans, instances statiques du gabarit (tools/instance_fonts)
FONT_FAMILY = "Ubuntu Sans"
FONT_FILES = ("UbuntuSans-Regular.ttf", "UbuntuSans-Medium.ttf", "UbuntuSans-SemiBold.ttf",
              "UbuntuSans-Bold.ttf")

__all__ = ["TOKENS", "CLS_COLORS", "FONT_FAMILY", "FONT_FILES", "hexa"]
