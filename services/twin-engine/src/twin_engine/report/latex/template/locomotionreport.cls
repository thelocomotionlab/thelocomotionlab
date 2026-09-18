%% locomotionreport.cls
%% -----------------------------------------------------------------------------
%% Classe LaTeX « Locomotion Lab » : rapport Locomotion Twin (v2), fiche d'assistance,
%% bracelet, fiche participant·e des ateliers.
%%
%% La charte vient de packages/ui et de nulle part ailleurs : chaque couleur ci-dessous est
%% un token de packages/ui/src/styles/theme.css, cité en commentaire ; la police est Ubuntu
%% Sans (instances statiques dans fonts/, produites par tools/instance_fonts.py depuis la
%% police variable 300 → 800 de la charte). Une seule famille : la hiérarchie vient de la
%% graisse, de la casse et de l'interlettrage, jamais d'une seconde police — le « mono » de la
%% charte est Ubuntu Sans Medium en chiffres tabulaires et capitales espacées.
%%
%% Correspondance token → macro (documentation, vérifiée par tests/test_report_v2.py) :
%%   --color-brand-bg            LLBg           fond de page
%%   --color-brand-primary       LLPrimary      bandeau, filets bleu-vert, en-têtes de tableaux
%%   --color-brand-primary-dark  LLPrimaryDark  jauges, sélection, éléments actifs
%%   --color-brand-accent        LLAccent       filets ocre (jamais du texte)
%%   --color-brand-accent-ink    LLAccentInk    le seul ocre autorisé en texte
%%   --color-brand-deep          LLDeep         titres, chiffres clés (terracotta)
%%   --color-brand-deep-dark     LLDeepDark     survol / renfort du terracotta
%%   --color-brand-text          LLText         corps de texte
%%   --color-brand-paper         LLPaper        cartes, encadrés
%%   --color-brand-grid          LLGrid         fonds discrets
%%   --color-brand-success       LLSuccess      confiance pleine, variations positives
%%   --color-brand-mist/-line    LLMist, LLMistLine   encadré « verdict »
%%   --color-brand-hairline      LLHairline     filets fins
%%   --color-brand-gauge/-full   LLGauge, LLGaugeFull  fond et plein des jauges
%%   --color-brand-muted/soft/ink/faint  LLMuted, LLSoft, LLInk, LLFaint  gris de lecture
%%   --color-brand-sensations    LLSensations   zébrure des tableaux
%%   --color-brand-slate/-dark   LLSlate, LLSlateDark  étiquettes bleu-vert
%% Les noms historiques (LLMetaLabel, LLCaption…) sont des alias de ces tokens (\colorlet).
%%
%% Compiler avec XeLaTeX (fontspec) ; biber optionnel.
%% -----------------------------------------------------------------------------
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{locomotionreport}[2026/09/16 v2.0 Locomotion Lab report class]

% --- Options de classe -------------------------------------------------------
% [systemfonts] : police système « Ubuntu Sans » au lieu des instances de fonts/.
\newif\ifLL@systemfonts \LL@systemfontsfalse
\DeclareOption{systemfonts}{\LL@systemfontstrue}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax

\LoadClass[11pt,a4paper]{article}

% =============================================================================
% 1. Moteur & polices (Ubuntu Sans, une seule famille)
% =============================================================================
\RequirePackage{iftex}
\ifPDFTeX
  % Repli pdfLaTeX : fontspec indisponible -> Latin Modern.
  \RequirePackage[T1]{fontenc}
  \RequirePackage[utf8]{inputenc}
  \RequirePackage{lmodern}
  \newcommand{\LLmonofont}{\ttfamily}
  \newcommand{\LLmediumfont}{\mdseries}
  \newcommand{\LLsemiboldfont}{\bfseries}
  \newcommand{\LLextraboldfont}{\bfseries}
  \newcommand{\LLlightfont}{\mdseries}
  \newcommand{\LLtracked}[1]{#1}
  \newcommand{\LLtabular}{}
\else
  \RequirePackage{fontspec}
  \ifLL@systemfonts
    \setmainfont{Ubuntu Sans}[Numbers=Lining]
    \setsansfont{Ubuntu Sans}[Numbers=Lining]
    \setmonofont{Ubuntu Sans}[Numbers={Monospaced,Lining}]
    \newfontfamily\LLmonofont{Ubuntu Sans Medium}[Numbers={Monospaced,Lining}]
    \newfontfamily\LLmediumfont{Ubuntu Sans Medium}
    \newfontfamily\LLsemiboldfont{Ubuntu Sans SemiBold}
    \newfontfamily\LLextraboldfont{Ubuntu Sans ExtraBold}
    \newfontfamily\LLlightfont{Ubuntu Sans Light}
  \else
    % --- Instances embarquées (fonts/) : compilation reproductible --------------
    \defaultfontfeatures{Path=fonts/, Extension=.ttf}
    \setmainfont{UbuntuSans}[UprightFont=*-Regular, BoldFont=*-Bold,
      ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic, Numbers=Lining]
    \setsansfont{UbuntuSans}[UprightFont=*-Regular, BoldFont=*-Bold,
      ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic, Numbers=Lining]
    \setmonofont{UbuntuSans}[UprightFont=*-Medium, BoldFont=*-Bold,
      ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic, Numbers={Monospaced,Lining}]
    \newfontfamily\LLmonofont{UbuntuSans}[UprightFont=*-Medium, BoldFont=*-Bold,
      ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic, Numbers={Monospaced,Lining}]
    \newfontfamily\LLmediumfont{UbuntuSans}[UprightFont=*-Medium, BoldFont=*-Bold,
      ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic]
    \newfontfamily\LLsemiboldfont{UbuntuSans}[UprightFont=*-SemiBold, BoldFont=*-ExtraBold,
      ItalicFont=*-BoldItalic, BoldItalicFont=*-BoldItalic]
    \newfontfamily\LLextraboldfont{UbuntuSans}[UprightFont=*-ExtraBold, BoldFont=*-ExtraBold,
      ItalicFont=*-BoldItalic, BoldItalicFont=*-BoldItalic]
    \newfontfamily\LLlightfont{UbuntuSans}[UprightFont=*-Light, BoldFont=*-Regular,
      ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic]
  \fi
  % capitales espacées (l'étiquette de la charte : --tracking-etiquette)
  \newcommand{\LLtracked}[1]{{\addfontfeature{LetterSpace=14.0}#1}}
  % chiffres tabulaires sur la police courante (tableaux, chiffres alignés)
  \newcommand{\LLtabular}{\addfontfeature{Numbers={Monospaced,Lining}}}
\fi
% le « mono » de la charte = Ubuntu Sans Medium en chiffres tabulaires (jamais une 2e police)
\newcommand{\LLmono}{\LLmonofont}

% =============================================================================
% 2. Paquets
% =============================================================================
\RequirePackage[table,svgnames]{xcolor}
\RequirePackage{graphicx}
\RequirePackage{geometry}
\RequirePackage{tikz}
\usetikzlibrary{calc,shadows.blur,patterns,arrows.meta,tikzmark}
\RequirePackage[most]{tcolorbox}
\tcbuselibrary{skins,breakable}
\RequirePackage{array}
\RequirePackage{tabularx}
\RequirePackage{hhline}
\RequirePackage{booktabs}
\RequirePackage{caption}
\RequirePackage{enumitem}
\RequirePackage{ragged2e}
\RequirePackage{titlesec}
\RequirePackage{fancyhdr}
\RequirePackage[french]{babel}
\renewcommand*{\FBfigtabshape}{}
% Les espaces devant « : ; ! ? » sont écrits par le moteur : sans ça babel en ajoute une
% devant chaque deux-points et les heures sortent « 13 :57 ».
\@ifundefined{frenchsetup}{\frenchbsetup{AutoSpacePunctuation=false}}%
  {\frenchsetup{AutoSpacePunctuation=false}}
\RequirePackage{microtype}
\RequirePackage{amsmath,amssymb,mathtools,bm,stmaryrd}
\RequirePackage{needspace}
\RequirePackage{float}
\RequirePackage{qrcode}
\RequirePackage{lastpage}
\RequirePackage[backend=biber,style=numeric,sorting=none]{biblatex}
\RequirePackage[hidelinks]{hyperref}

% =============================================================================
% 3. Palette = les tokens de theme.css (voir la table en tête de fichier)
% =============================================================================
\definecolor{LLBg}{HTML}{FEFBF6}% --color-brand-bg
\definecolor{LLPrimary}{HTML}{8CB9BD}% --color-brand-primary
\definecolor{LLPrimaryLight}{HTML}{A8CDD0}% --color-brand-primary-light
\definecolor{LLPrimaryDark}{HTML}{6E9CA0}% --color-brand-primary-dark
\definecolor{LLAccent}{HTML}{EFB159}% --color-brand-accent
\definecolor{LLAccentLight}{HTML}{F4C480}% --color-brand-accent-light
\definecolor{LLAccentDark}{HTML}{D89A3D}% --color-brand-accent-dark
\definecolor{LLAccentInk}{HTML}{C08327}% --color-brand-accent-ink
\definecolor{LLDeep}{HTML}{B67352}% --color-brand-deep
\definecolor{LLDeepLight}{HTML}{C68F76}% --color-brand-deep-light
\definecolor{LLDeepDark}{HTML}{9A6044}% --color-brand-deep-dark
\definecolor{LLText}{HTML}{333333}% --color-brand-text
\definecolor{LLPaper}{HTML}{FFFFFF}% --color-brand-paper
\definecolor{LLPlancheFond}{HTML}{1A1C18}% --color-brand-planche-fond
\definecolor{LLPlancheEncre}{HTML}{22241E}% --color-brand-planche-encre
\definecolor{LLTrace}{HTML}{D6246E}% --color-brand-trace
\definecolor{LLGrid}{HTML}{F3EEE6}% --color-brand-grid
\definecolor{LLSuccess}{HTML}{3F8F5B}% --color-brand-success
\definecolor{LLWash}{HTML}{D3E2E3}% --color-brand-wash
\definecolor{LLSlate}{HTML}{5B8286}% --color-brand-slate
\definecolor{LLSlateDark}{HTML}{4E767A}% --color-brand-slate-dark
\definecolor{LLMist}{HTML}{EBF0ED}% --color-brand-mist
\definecolor{LLMistLine}{HTML}{D9E4E4}% --color-brand-mist-line
\definecolor{LLHairline}{HTML}{E5DFD3}% --color-brand-hairline
\definecolor{LLField}{HTML}{E2DCD0}% --color-brand-field
\definecolor{LLGauge}{HTML}{F0EAE0}% --color-brand-gauge
\definecolor{LLGaugeFull}{HTML}{D6D0C4}% --color-brand-gauge-full
\definecolor{LLWashLine}{HTML}{C9D8D9}% --color-brand-wash-line
\definecolor{LLMuted}{HTML}{6B7280}% --color-brand-muted
\definecolor{LLSoft}{HTML}{4B5563}% --color-brand-soft
\definecolor{LLInk}{HTML}{374151}% --color-brand-ink
\definecolor{LLFaint}{HTML}{9CA3AF}% --color-brand-faint
\definecolor{LLSensations}{HTML}{FAF5EC}% --color-brand-sensations
% Alias historiques (fiche participant·e, macros anciennes) : des tokens, jamais une valeur.
\colorlet{LLMetaLabel}{LLMuted}
\colorlet{LLMetaVal}{LLInk}
\colorlet{LLCaption}{LLSoft}
\colorlet{LLFootMono}{LLMuted}
\colorlet{LLCoverSub}{LLSoft}
\colorlet{LLDelta}{LLSuccess}
\colorlet{LLAttnLabel}{LLAccentInk}
\colorlet{LLRowAlt}{LLSensations}
\colorlet{LLCoverMetaRule}{LLHairline}

% =============================================================================
% 4. Métadonnées du document
% =============================================================================
\newcommand{\LL@subtitle}{}
\newcommand{\subtitle}[1]{\renewcommand{\LL@subtitle}{#1}}
\newcommand{\LL@reportref}{}
\newcommand{\reportref}[1]{\renewcommand{\LL@reportref}{#1}}
\newcommand{\LL@reportversion}{}
\newcommand{\reportversion}[1]{\renewcommand{\LL@reportversion}{#1}}
\newcommand{\LL@reportclient}{}
\newcommand{\reportclient}[1]{\renewcommand{\LL@reportclient}{#1}}
\newcommand{\LL@reporttype}{Rapport technique}
\newcommand{\reporttype}[1]{\renewcommand{\LL@reporttype}{#1}}

% =============================================================================
% 5. La marque : le signe circulaire (image) + le mot-symbole (texte)
% =============================================================================
% Exactement ce que porte le site (apps/site/components/Navbar.jsx) : la marque
% circulaire monochrome terracotta, puis « LOCOMOTION LAB » COMPOSÉ en Ubuntu Sans,
% capitales, demi-gras, interlettrage 0,22 em. Jamais un lockup bitmap : le mot
% s'aligne sur la police du document et reste net à toute taille.
\newcommand{\LLMarkPath}{assets/logo-mark-512}
\newcommand{\LLMarkFile}{}
\newcommand{\LLresolvelogo}[2]{%
  \def#2{}%
  \IfFileExists{#1.pdf}{\def#2{#1.pdf}}{%
    \IfFileExists{#1.png}{\def#2{#1.png}}{%
      \IfFileExists{#1.jpg}{\def#2{#1.jpg}}{%
        \IfFileExists{#1.jpeg}{\def#2{#1.jpeg}}{%
          \ClassWarning{locomotionreport}{Marque introuvable : #1.(pdf|png|jpg|jpeg)}}}}}%
}
\AtBeginDocument{\LLresolvelogo{\LLMarkPath}{\LLMarkFile}%
  \LLresolvelogo{\LLMarkWhitePath}{\LLMarkWhiteFile}}
% interlettrage du mot-symbole (0,22 em), distinct de celui des étiquettes (0,14 em)
\ifPDFTeX
  \newcommand{\LLwordtracked}[1]{#1}
\else
  \newcommand{\LLwordtracked}[1]{{\addfontfeature{LetterSpace=22.0}#1}}
\fi
% \LLmark{hauteur} : le signe seul.  \LLbrand{hauteur}{taille du mot} : signe + mot.
\newcommand{\LLMarkWhitePath}{assets/logo-mark-512-blanc}
\newcommand{\LLMarkWhiteFile}{}
\newcommand{\LLmark}[1]{\ifx\LLMarkFile\@empty\else\includegraphics[height=#1]{\LLMarkFile}\fi}
\newcommand{\LLmarkwhite}[1]{%
  \ifx\LLMarkWhiteFile\@empty\else\includegraphics[height=#1]{\LLMarkWhiteFile}\fi}
% \LLbrandwhite : la marque sur un fond coloré — le signe clair, le mot en blanc.
\newcommand{\LLbrandwhite}[2]{%
  \begingroup
  \setlength{\fboxsep}{0pt}%
  \raisebox{-0.30\height}{\LLmarkwhite{#1}}\hspace{0.62em}%
  {\LLsemiboldfont\fontsize{#2}{#2}\selectfont\color{LLBg}%
    \LLwordtracked{\MakeUppercase{Locomotion Lab}}}%
  \endgroup}
\newcommand{\LLbrand}[2]{%
  \begingroup
  \setlength{\fboxsep}{0pt}%
  \raisebox{-0.30\height}{\LLmark{#1}}\hspace{0.62em}%
  {\LLsemiboldfont\fontsize{#2}{#2}\selectfont\color{LLText}%
    \LLwordtracked{\MakeUppercase{Locomotion Lab}}}%
  \endgroup}

% =============================================================================
% 6. Géométrie, fond de page, réglages généraux
% =============================================================================
\geometry{
  a4paper,
  top=27mm, bottom=24mm, left=22mm, right=22mm,
  headheight=14pt, headsep=11mm, footskip=14mm,
}
\AtBeginDocument{\pagecolor{LLBg}\color{LLText}}

\setlength{\parindent}{0pt}
\setlength{\parskip}{0.55\baselineskip}
\linespread{1.08}

\setlist[itemize,1]{label={\textcolor{LLAccent}{\small$\diamond$}}, leftmargin=1.5em, itemsep=2pt, topsep=2pt}
\setlist[itemize,2]{label={\textcolor{LLPrimary}{\small$\diamond$}}, leftmargin=1.4em, itemsep=1pt}
\setlist[enumerate,1]{label={\textcolor{LLDeep}{\bfseries\arabic*.}}, leftmargin=1.7em, itemsep=2pt, topsep=2pt}

\setcounter{secnumdepth}{3}
\counterwithin{figure}{section}
\counterwithin{table}{section}

% =============================================================================
% 7. Dimensions de la charte
% =============================================================================
\newcommand{\LLHeadMarkHeight}{7.4mm}   % le signe en en-tête (le mot fait 10,5 pt)
\newlength{\LLbandH}     \setlength{\LLbandH}{13.8mm}   % hauteur du bandeau bleu-vert
\newlength{\LLgoldH}     \setlength{\LLgoldH}{1.2mm}    % filet ocre sous le bandeau
\newlength{\LLbandinset} \setlength{\LLbandinset}{14mm} % marge intérieure du bandeau
\newlength{\LLcoverbar}  \setlength{\LLcoverbar}{16.2mm}% barre latérale de la couverture
\newlength{\LLcovergold} \setlength{\LLcovergold}{1.5mm}% son liseré ocre
\newlength{\LLcoverx}    \setlength{\LLcoverx}{33mm}    % marge du contenu de la couverture
\newlength{\LLcoverw}    \setlength{\LLcoverw}{153mm}   % largeur du bloc de contenu

% =============================================================================
% 8. En-tête : la marque à gauche, le document à droite, un filet fin dessous
% =============================================================================
% Plus de bandeau plein : la composition du site (fond crème, marque, filet) tient
% aussi sur le papier, et laisse la couleur aux chiffres plutôt qu'au décor.
\newcommand{\LL@headright}{\leftmark}
\newcommand{\LLheadright}[1]{\renewcommand{\LL@headright}{#1}}
% Bandeau bleu-vert à fleur du bord, filet ocre dessous, la marque en clair à gauche et le
% document à droite — la composition du site, sur le papier.
\newcommand{\LLheaderband}{%
  \begin{tikzpicture}[remember picture, overlay]
    \fill[LLPrimary] (current page.north west)
      rectangle ([yshift=-\LLbandH]current page.north east);
    \fill[LLAccent] ([yshift=-\LLbandH]current page.north west)
      rectangle ([yshift=-\dimexpr\LLbandH+\LLgoldH\relax]current page.north east);
    \node[anchor=west, inner sep=0]
      at ([xshift=\LLbandinset, yshift=-\dimexpr\LLbandH/2\relax]current page.north west)
      {\LLbrandwhite{\LLHeadMarkHeight}{10.5}};
    \node[anchor=east, inner sep=0]
      at ([xshift=-\LLbandinset, yshift=-\dimexpr\LLbandH/2\relax]current page.north east)
      {\LL@headright};
  \end{tikzpicture}%
}
% Titre courant : le nom de la course, en terracotta. Rien d'autre — le reste est sur la
% couverture, et une en-tête chargée se relit à chaque page pour rien.
\newcommand{\LLheaddoc}[1]{%
  \LLheadright{{\LLsemiboldfont\fontsize{11}{13}\selectfont\color{LLBg}#1}}%
}
\renewcommand{\sectionmark}[1]{\markboth{\thesection~\textperiodcentered~#1}{}}
\newcommand{\LLrunninghead}[1]{\markboth{#1}{}}

% =============================================================================
% 9. Pied de page : un filet ocre et le folio, rien d'autre
% =============================================================================
% Le folio : un point bleu-vert, le numéro en ocre. Aucune ligne de service — ce qui est
% utile est dans la page, pas sous elle.
\newcommand{\LLfolio}{%
  {\fontsize{9}{11}\selectfont\color{LLPrimary}\textbullet}\hspace{5pt}%
  {\LLsemiboldfont\fontsize{11}{13}\selectfont\color{LLAccentInk}\thepage}}
\newcommand{\LLfooterband}{%
  \begin{minipage}{\textwidth}%
    {\color{LLAccent}\rule{\textwidth}{1.5pt}}\par
    \vspace{4pt}%
    \noindent\hbox to \textwidth{\hfil\LLfolio}%
  \end{minipage}%
}

\fancypagestyle{LLmain}{%
  \fancyhf{}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
  \fancyhead[L]{\LLheaderband}%
  \fancyfoot[L]{\LLfooterband}%
}
% Style de la feuille détachable : même en-tête, et en pied le seul folio « n/N ».
\fancypagestyle{LLfeuille}{%
  \fancyhf{}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
  \fancyhead[L]{\LLheaderband}%
  \fancyfoot[L]{\makebox[\textwidth]{%
    {\LLtabular\fontsize{9}{11}\selectfont\color{LLSoft}\thepage/\pageref{LastPage}}}}%
}
\pagestyle{LLmain}

% =============================================================================
% 10. Titres : pages du rapport v2 (sans numéro) et sections numérotées (fiches)
% =============================================================================
% \LLpage{surtitre}{Titre} : nouvelle page, surtitre en capitales espacées, titre, filet ocre.
\newcommand{\LLpage}[2]{%
  \clearpage
  \LLrunninghead{#2}%
  {\LLmonofont\fontsize{9.5}{12}\selectfont\color{LLPrimaryDark}\LLtracked{\MakeUppercase{#1}}}\par
  \vspace{3pt}%
  {\LLextraboldfont\fontsize{25}{29}\selectfont\color{LLDeep}#2\par}
  \vspace{5pt}{\color{LLAccent}\rule{19mm}{1.2mm}}\par
  \vspace{9pt}%
}
% \LLtitre{Titre} : intertitre dans une page (bleu-vert, sans numéro)
\newcommand{\LLtitre}[1]{%
  \par\needspace{4\baselineskip}\vspace{6pt}%
  {\LLsemiboldfont\fontsize{13}{16}\selectfont\color{LLSlateDark}#1\par}
  \vspace{1pt}%
}
% \LLetiquette{texte} : étiquette en capitales espacées (le style « mono » de la charte)
\newcommand{\LLetiquette}[1]{{\LLmonofont\fontsize{8}{10}\selectfont\color{LLMuted}\LLtracked{\MakeUppercase{#1}}}}

\titleformat{\section}[display]
  {\normalfont\sffamily}
  {\LLmonofont\fontsize{9.5}{12}\selectfont\color{LLDeep}%
     \LLtracked{\MakeUppercase{Section\nobreakspace\thesection}}}
  {5pt}
  {\LLextraboldfont\fontsize{24}{28}\selectfont\color{LLDeep}}
  [{\nobreak\vspace{5pt}\titleline[l]{\color{LLAccent}\rule{19mm}{1.2mm}}}]
\titlespacing*{\section}{0pt}{20pt}{12pt}
\titleformat{\subsection}[block]
  {\LLsemiboldfont\fontsize{15}{19}\selectfont\color{LLPrimaryDark}}
  {\thesubsection\,\textemdash\,}{0pt}{}
\titlespacing*{\subsection}{0pt}{15pt}{6pt}
\titleformat{\subsubsection}[block]
  {\LLsemiboldfont\fontsize{13}{17}\selectfont\color{LLAccentInk}}
  {\thesubsubsection\,\textemdash\,}{0pt}{}
\titlespacing*{\subsubsection}{0pt}{11pt}{4pt}

% =============================================================================
% 11. Encadrés : note, attention, exemple, honnêteté, verdict
% =============================================================================
\newcommand{\LLboxlabel}[2]{%
  {\LLsemiboldfont\fontsize{9}{11}\selectfont\color{#1}\LLtracked{\MakeUppercase{#2}}}%
}
\tcbset{LL@boxbase/.style={
  enhanced, breakable,
  colback=LLPaper, frame hidden, boxrule=0pt,
  arc=6pt, outer arc=6pt, sharp corners=west,
  left=16pt, right=16pt, top=10pt, bottom=11pt,
  before skip=8pt, after skip=10pt,
  drop fuzzy shadow={black!12},
}}
\newtcolorbox[]{llnote}[1][Note]{LL@boxbase,
  borderline west={4pt}{0pt}{LLPrimary},
  before upper={\LLboxlabel{LLPrimaryDark}{#1}\par\vspace{4pt}}}
\newtcolorbox[]{llattention}[1][Attention]{LL@boxbase,
  borderline west={4pt}{0pt}{LLAccent},
  before upper={\LLboxlabel{LLAccentInk}{#1}\par\vspace{4pt}}}
\newtcolorbox[]{llexemple}[1][Exemple]{LL@boxbase,
  borderline west={4pt}{0pt}{LLDeep},
  before upper={\LLboxlabel{LLDeep}{#1}\par\vspace{4pt}}}
% l'encadré d'honnêteté : ce que le moteur ne sait pas, dit en une fois
\newtcolorbox[]{llhonnete}[1][Les limites]{LL@boxbase,
  borderline west={4pt}{0pt}{LLAccentInk},
  before upper={\LLboxlabel{LLAccentInk}{#1}\par\vspace{4pt}}}
% ce que valent les chiffres : même carte que les autres, liseré bleu-vert
\newtcolorbox[]{llverdict}[1][Verdict]{LL@boxbase,
  borderline west={4pt}{0pt}{LLPrimary},
  before upper={\LLboxlabel{LLPrimaryDark}{#1}\par\vspace{4pt}}}

% =============================================================================
% 12. Chiffres clés et jauges
% =============================================================================
% \LLkpi{valeur}{étiquette}{sous-texte} : carte blanche, chiffre en gros (dans une minipage)
\newcommand{\LLkpi}[3]{%
  \begin{tcolorbox}[enhanced, colback=LLPaper, frame hidden, boxrule=0pt, arc=6pt,
      left=10pt, right=10pt, top=8pt, bottom=8pt, drop fuzzy shadow={black!10},
      nobeforeafter, width=\linewidth]
    \LLetiquette{#2}\par\vspace{3pt}%
    {\LLextraboldfont\LLtabular\fontsize{17}{20}\selectfont\color{LLDeep}#1}\par\vspace{2pt}%
    {\fontsize{8.5}{11}\selectfont\color{LLSoft}#3\par}
  \end{tcolorbox}}
% \LLgauge{étiquette}{valeur}{fraction 0–1}{phrase} : barre pleine à la fraction donnée
\newcommand{\LLgauge}[4]{%
  \noindent\begin{minipage}[t]{\linewidth}
    \LLetiquette{#1}\hfill
    {\LLsemiboldfont\LLtabular\fontsize{12}{14}\selectfont\color{LLText}#2}\par\vspace{3pt}%
    \begin{tikzpicture}
      \fill[LLGauge, rounded corners=1.5pt] (0,0) rectangle (\linewidth, 5pt);
      \fill[LLPrimaryDark, rounded corners=1.5pt] (0,0) rectangle (#3\linewidth, 5pt);
    \end{tikzpicture}\par\vspace{2pt}%
    {\fontsize{9}{12}\selectfont\color{LLSoft}#4\par}
  \end{minipage}\par\vspace{7pt}}
% \LLqr{url} : QR vers l'annexe en ligne
\newcommand{\LLqr}[1]{\qrcode[height=17mm,level=M]{#1}}

% =============================================================================
% 13. Figures & légendes
% =============================================================================
\DeclareCaptionLabelSeparator{LLdash}{\ \textemdash\ }
\captionsetup{
  font={small,color=LLSoft},
  labelfont={bf,color=LLDeep},
  labelsep=LLdash,
  labelformat=empty,
  justification=raggedright, singlelinecheck=false,
}

% =============================================================================
% 14. Tableaux
% =============================================================================
\newcommand{\LLnum}[1]{{\LLmonofont #1}}
\newcommand{\LLpos}[1]{{\LLmonofont\color{LLSuccess}#1}}
\newcommand{\LLthead}[1]{\textcolor{LLBg}{\textbf{#1}}}
\newcommand{\LLheaderrow}{\rowcolor{LLPrimary}}
% Zébrure d'une ligne sur deux : la fiche participant·e des ateliers l'utilise encore ; les
% tableaux de course, eux, se lisent aux filets (cf. \LLtableau).
\newcommand{\LLzebra}{\rowcolors{2}{LLPaper}{LLRowAlt}}

% =============================================================================
% 15 bis. Les tableaux : une seule couleur, des filets, tout centré
% =============================================================================
% Un tableau de course se lit à bout de bras : une couleur d'en-tête, des filets pour suivre
% la ligne, et une seule ligne teintée — celle où l'assistance attend.
\colorlet{LLTableRule}{LLGaugeFull}
\colorlet{LLAssistRow}{LLAccent!16!LLPaper}   % la seule ligne colorée du tableau
\colorlet{LLFillRule}{LLGaugeFull}            % le pointillé d'une case à remplir

\newcommand{\LLtableau}{%
  \arrayrulecolor{LLTableRule}%
  \setlength{\arrayrulewidth}{0.4pt}%
  \LLtabular}
% \LLfilet{n colonnes} : le filet horizontal d'un tableau à n colonnes. hhline et non \hline,
% parce qu'un \rowcolor recouvre le filet de la ligne du dessus — entre deux lignes teintées,
% la séparation disparaissait.
\newcommand{\LLfilet}[1]{\noalign{}\hhline{*{#1}{|-}|}}
% \LLassist : la ligne d'un ravitaillement où l'assistance est autorisée.
%
% colortbl peint le fond d'une ligne PAR-DESSUS le filet qui la surmonte : entre deux lignes
% teintées qui se suivent, la séparation disparaissait. On la redessine donc comme du contenu,
% posé APRÈS les fonds : dans la DERNIÈRE cellule de la ligne, la seule qu'aucun fond ne
% recouvrira ensuite.
% \LLsepfactor = l'interligne du tableau (\arraystretch) ; \LLseplarg = sa largeur.
\newcommand{\LLsepfactor}{2.0}
\newlength{\LLseplarg}
% \LLsepfin{contenu de la cellule} : la cellule est composée dans une boîte de la largeur de
% la colonne (avec sa réglette, sans quoi une cellule vide donne une boîte de largeur nulle),
% pour que le filet parte du bord gauche du tableau quelle que soit la longueur du texte.
\newcommand{\LLsepfin}[1]{%
  \parbox[t]{\linewidth}{\centering\strut #1}%
  \rlap{\hspace*{-\dimexpr\LLseplarg-\tabcolsep-\arrayrulewidth\relax}%
    \raisebox{\dimexpr\LLsepfactor\ht\strutbox\relax}[0pt][0pt]{%
      \textcolor{LLTableRule}{\rule{\LLseplarg}{\arrayrulewidth}}}}}
\newcommand{\LLassist}{\rowcolor{LLAssistRow}}
% \LLprevu{valeur} : la colonne de l'heure prévue — en gras, sans trame : elle est repérée
% par un cadre pointillé ocre, pas par un aplat de couleur de plus.
\newcommand{\LLprevu}[1]{{\LLsemiboldfont #1}}
% \LLtableencadree{x du bord gauche}{largeur}{tableau} : pose le tableau dans une boîte, puis
% trace le cadre pointillé ocre d'une de ses colonnes. La boîte donne sa hauteur exacte, et
% l'abscisse se calcule sur les largeurs de la grille — d'où des colonnes à largeur fixe.
\newsavebox{\LL@tablebox}
\newcommand{\LLtableencadree}[3]{%
  \sbox{\LL@tablebox}{#3}%
  \noindent\begin{tikzpicture}
    \node[inner sep=0, outer sep=0, anchor=north west] (LL@t) at (0,0) {\usebox{\LL@tablebox}};
    \draw[LLAccentInk, dash pattern=on 2.2pt off 2.2pt, line width=0.9pt, rounded corners=1pt]
      ([xshift=#1, yshift=1.5pt]LL@t.north west)
      rectangle ([xshift=\dimexpr#1+#2\relax, yshift=-1.5pt]LL@t.south west);
  \end{tikzpicture}\par}

% \LLnuit : le point qui dit « il fait nuit sur ce segment », posé à côté du numéro.
\newcommand{\LLnuit}{\,\textcolor{LLSlate}{$\bullet$}}
% \LLlegende{texte} : la ligne qui dit ce que veulent dire les repères du tableau.
\newcommand{\LLlegende}[1]{%
  \par\vspace{5pt}{\fontsize{8.4}{11}\selectfont\color{LLSoft}#1\par}}
% \LLfort{valeur} : un chiffre qui doit sauter aux yeux (D+ et D− marqués).
\newcommand{\LLfort}[1]{{\LLsemiboldfont #1}}
% \LLcasevide : la case qu'on remplit au stylo, un simple pointillé.
\newcommand{\LLcaselargeur}{16mm}
\newcommand{\LLcasevide}{\textcolor{LLFillRule}{\makebox[\LLcaselargeur]{\dotfill}}}

% \LLcouverture{surtitre}{titre}{méta}{bloc du bas} : la première page. Barre latérale
% bleu-vert et son liseré ocre sur toute la hauteur, la marque en haut, le titre, et ce que
% l'athlète doit retenir avant d'ouvrir. La classe ne décide d'aucun texte : elle pose.
\newcommand{\LLcouverture}[4]{%
  \begingroup
  \thispagestyle{empty}%
  \null
  \begin{tikzpicture}[remember picture, overlay]
    \fill[LLPrimary] (current page.north west)
      rectangle ([xshift=\LLcoverbar]current page.south west);
    \fill[LLAccent] ([xshift=\LLcoverbar]current page.north west)
      rectangle ([xshift=\dimexpr\LLcoverbar+\LLcovergold\relax]current page.south west);
    \node[anchor=north west, inner sep=0]
      at ([xshift=\LLcoverx, yshift=-24mm]current page.north west)
      {\LLbrand{17mm}{15}};
    \node[anchor=north west, inner sep=0]
      at ([xshift=\LLcoverx, yshift=-96mm]current page.north west)
      {\begin{minipage}[t]{\LLcoverw}\raggedright
        {\LLmonofont\fontsize{10}{13}\selectfont\color{LLPrimaryDark}%
          \LLtracked{\MakeUppercase{#1}}\par}
        \vspace{5mm}
        {\LLextraboldfont\fontsize{37}{41}\selectfont\color{LLDeep}#2\par}
        \vspace{5mm}
        {\color{LLAccent}\rule{33mm}{1.5mm}}\par
        \vspace{6mm}
        {\fontsize{11.5}{16}\selectfont\color{LLSoft}#3\par}
      \end{minipage}};
    \node[anchor=south west, inner sep=0]
      at ([xshift=\LLcoverx, yshift=26mm]current page.south west)
      {\begin{minipage}[t]{\LLcoverw}\raggedright
        {\color{LLHairline}\rule{\LLcoverw}{0.4pt}}\par
        \vspace{7mm}
        #4
      \end{minipage}};
  \end{tikzpicture}%
  \clearpage
  \endgroup}

% \LLhero{texte} : la phrase de prédiction de la page 1.
\newcommand{\LLhero}[1]{{\fontsize{18}{26}\selectfont\color{LLText}#1\par}}
% \LLtile{étiquette}{valeur}{sous-texte} : carte blanche à filet ; la variante « accent »
% ne change que la couleur du filet. « equal height group » aligne les tuiles d'une rangée
% (tcolorbox a besoin de la deuxième passe pour ça).
\newcommand{\LL@tile}[6]{%
  \begin{tcolorbox}[enhanced, colback=LLPaper, colframe=#4, boxrule=#5, arc=5pt,
      left=8pt, right=8pt, top=6pt, bottom=6pt, nobeforeafter, width=\linewidth,
      equal height group=LLtuiles]
    \raggedright\LLetiquette{#1}\par\vspace{2pt}%
    {\LLextraboldfont\LLtabular\fontsize{#6}{#6}\selectfont\color{LLText}#2}\par\vspace{3pt}%
    {\fontsize{8.4}{10.5}\selectfont\color{LLSoft}#3\par}
  \end{tcolorbox}}
\newcommand{\LLtile}[3]{\LL@tile{#1}{#2}{#3}{LLHairline}{0.6pt}{15}}
\newcommand{\LLtileaccent}[3]{\LL@tile{#1}{#2}{#3}{LLAccentInk}{1.1pt}{15}}
\newcommand{\LLtilecrew}[3]{\LL@tile{#1}{#2}{#3}{LLMistLine}{0.6pt}{9.5}}
% \LLfleche : la flèche « au plus tôt → au plus tard ». Tracée, parce qu'Ubuntu Sans
% n'a pas de glyphe U+2192 ; elle prend la couleur courante.
\newcommand{\LLfleche}{\,\raisebox{0.18ex}{\tikz{\draw[line width=0.55pt,
  -{Straight Barb[length=2.1pt, width=3.2pt]}] (0,0) -- (0.85em,0);}}\,}

% =============================================================================
% 15. Bibliographie et liens
% =============================================================================
\DeclareFieldFormat{labelnumberwidth}{\LLmonofont\textcolor{LLDeep}{[#1]}}
\DeclareFieldFormat*{title}{\textit{#1}}
\DeclareFieldFormat*{citetitle}{\textit{#1}}
\setlength{\biblabelsep}{1.2em}
\protected\long\def\LL@mkbibnamefamily#1{%
  \textsc{{\hyphenpenalty=\@M\exhyphenpenalty=\@M\relax #1}}}
\AtBeginDocument{\let\mkbibnamefamily\LL@mkbibnamefamily}
\hypersetup{
  colorlinks=true,
  linkcolor=LLText, citecolor=LLDeep, urlcolor=LLPrimaryDark,
  linktoc=all,
}

\endinput
%% End of file `locomotionreport.cls'.
