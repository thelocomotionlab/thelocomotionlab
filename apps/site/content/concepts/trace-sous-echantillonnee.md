---
title: "Ce que perd une trace sous-échantillonnée"
author: "Valentin Fer"
date: "2025-11-09"
description: "Une position toutes les 90 s ne mesure pas la même distance qu'une trace continue — et l'écart se corrige."
tags: ["instruments", "live-tracking", "gps"]
maturite: pousse
branche: instruments
published: true
---

## En bref

Un point GPS toutes les 90 s ou tous les 100 m coupe les virages : la distance
mesurée est plus courte que la distance parcourue, et le dénivelé positif plus
faible. Des coefficients correctifs rendent la mesure honnête. Robustesse de la
mesure face à l'économie de batterie, au prix d'une correction calibrée sur un
terrain qui n'est pas celui de la montagne.

## Ce que j'ai observé

*09/11/2025.* Il faut préserver la batterie du téléphone émetteur, mais à la
fois ne pas envoyer une position toutes les 5 min au risque de biaiser
totalement les stats affichées. Un point toutes les 90 s / 100 m correspond à
un sous-échantillonnage assez marqué du signal réel.

## Le mécanisme

Sans rentrer trop dans les détails, j'applique en plus du modèle de
reconstruction du signal des coefficients correctifs pour la distance
($\times$1,12), basé sur les études de
<Citation id="fearnhead2003">Fearnhead et Clifford</Citation> et
<Citation id="haklay2010">Haklay et al.</Citation>, ainsi que sur les dénivelés
positif ($\times$1,3) et négatif ($\times$0,9), basé sur l'étude de
<Citation id="sanchez2025">Sanchez et al.</Citation>, et interpolé à mon cas.

## Ce que ça fragilise

Ces coefficients ont aussi été ajustés en fonction de mes expériences, même si
celles-ci ont été essentiellement sur des terrains bitumés. Une correction
calibrée sur du plat appliquée à un sentier de montagne technique, où les
virages sont plus serrés et le relief plus découpé, sous-corrige probablement.
La mesure devient robuste à l'économie de batterie et fragile au type de
terrain — c'est un échange, pas un gain.
