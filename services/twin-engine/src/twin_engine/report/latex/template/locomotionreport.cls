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
%
% Le signe ET le mot sont centrés sur la ligne de base : le lockup a donc une boîte
% symétrique, et tout ce qui le centre — le bandeau, une cellule — le centre vraiment.
% Adossé à la ligne de base, il remontait d'une demi-hauteur de capitale.
\newcommand{\LL@brand}[3]{%
  \begingroup
  \setlength{\fboxsep}{0pt}%
  \LLcentre{#2}\hspace{0.62em}%
  \LLcentre{\LLsemiboldfont\fontsize{#1}{#1}\selectfont\color{#3}%
    \LLwordtracked{\MakeUppercase{Locomotion Lab}}}%
  \endgroup}
% \LLcentre{contenu} : le contenu centré sur la ligne de base, pour qu'un nœud le centre.
\newcommand{\LLcentre}[1]{\raisebox{-0.5\height}{\hbox{#1}}}
\newcommand{\LLbrandwhite}[2]{\LL@brand{#2}{\LLmarkwhite{#1}}{LLBg}}
\newcommand{\LLbrand}[2]{\LL@brand{#2}{\LLmark{#1}}{LLText}}

% =============================================================================
% 6. Géométrie, fond de page, réglages généraux
% =============================================================================
% Le bandeau est à fleur du bord (il se dessine en overlay) : la marge haute ne réserve que
% sa hauteur et l'air sous son filet ocre. Les côtés valent la marge intérieure du bandeau,
% pour que le titre s'aligne sur la marque.
\geometry{
  a4paper,
  top=21mm, bottom=19mm, left=14.8mm, right=14.8mm,
  headheight=14pt, headsep=7mm, footskip=12mm,
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
\newcommand{\LLHeadMarkHeight}{5.4mm}   % le signe en en-tête (le mot fait 7,6 pt)
\newlength{\LLbandH}     \setlength{\LLbandH}{15mm}     % hauteur du bandeau bleu-vert
\newlength{\LLgoldH}     \setlength{\LLgoldH}{1.05mm}   % filet ocre sous le bandeau
\newlength{\LLbandinset} \setlength{\LLbandinset}{14.8mm}% marge intérieure du bandeau
\newlength{\LLcoverbar}  \setlength{\LLcoverbar}{16.1mm}% barre latérale de la couverture
\newlength{\LLcovergold} \setlength{\LLcovergold}{1.05mm}% son liseré ocre
\newlength{\LLcoverx}    \setlength{\LLcoverx}{33.9mm}  % marge du contenu de la couverture
\newlength{\LLcoverw}    \setlength{\LLcoverw}{148mm}   % largeur du bloc de contenu
\newlength{\LLpiedfilet} \setlength{\LLpiedfilet}{0.8mm}% filet ocre du pied de page

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
      {\LLbrandwhite{\LLHeadMarkHeight}{7.6}};
    \node[anchor=east, inner sep=0]
      at ([xshift=-\LLbandinset, yshift=-\dimexpr\LLbandH/2\relax]current page.north east)
      {\LLcentre{\LL@headright}};
  \end{tikzpicture}%
}
% Titre courant : le nom de la course, en terracotta. Rien d'autre — le reste est sur la
% couverture, et une en-tête chargée se relit à chaque page pour rien.
\newcommand{\LLheaddoc}[1]{%
  \LLheadright{{\LLsemiboldfont\fontsize{9}{11}\selectfont\color{LLBg}#1}}%
}
\renewcommand{\sectionmark}[1]{\markboth{\thesection~\textperiodcentered~#1}{}}
\newcommand{\LLrunninghead}[1]{\markboth{#1}{}}

% =============================================================================
% 9. Pied de page : un filet ocre et le folio, rien d'autre
% =============================================================================
% Le folio : un point bleu-vert, le numéro en ocre. Aucune ligne de service — ce qui est
% utile est dans la page, pas sous elle.
% Le folio : un point ocre, le numéro en encre. Le MÊME pied sur toutes les pages — filet
% ocre, folio à droite — parce qu'un pied qui change de page en page se remarque plus que
% ce qu'il porte. \LLpied{gauche} pose une légende à gauche du folio quand la page en a une
% (la feuille à emporter) ; sans elle, la place reste vide et le folio ne bouge pas.
\newcommand{\LLfolio}{%
  {\fontsize{9}{11}\selectfont\color{LLAccent}\textbullet}\hspace{5pt}%
  {\LLtabular\fontsize{11}{13}\selectfont\color{LLText}\thepage}}
\newlength{\LLpiedH} \setlength{\LLpiedH}{9mm}  % hauteur du bloc sous le filet
\newcommand{\LLpied}[1]{%
  \begin{minipage}{\textwidth}%
    {\color{LLAccent}\rule{\textwidth}{\LLpiedfilet}}\par
    \noindent\hbox to \textwidth{%
      \begin{minipage}[c][\LLpiedH][c]{0.84\textwidth}\raggedright
        {\fontsize{7.6}{10.5}\selectfont\color{LLSoft}#1\par}
      \end{minipage}\hfill
      \begin{minipage}[c][\LLpiedH][c]{0.1\textwidth}\raggedleft\LLfolio\end{minipage}}%
  \end{minipage}%
}
% Légende de pied : posée par la page, relue par le pied. Une page qui n'en pose pas garde
% le pied nu — et exactement le même filet, la même hauteur, le même folio.
\newcommand{\LL@piedlegende}{}
\newcommand{\LLpiedlegende}[1]{\gdef\LL@piedlegende{#1}}

\fancypagestyle{LLmain}{%
  \fancyhf{}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
  \fancyhead[L]{\LLheaderband}%
  \fancyfoot[L]{\LLpied{\LL@piedlegende}}%
}
% Style de la feuille détachable : même en-tête, et en pied le seul folio « n/N ».
% La feuille détachable : le même en-tête, le même pied — avec sa légende à gauche.
\fancypagestyle{LLfeuille}{%
  \fancyhf{}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
  \fancyhead[L]{\LLheaderband}%
  \fancyfoot[L]{\LLpied{\LL@piedlegende}}%
}
\pagestyle{LLmain}

% =============================================================================
% 10. Titres : pages du rapport v2 (sans numéro) et sections numérotées (fiches)
% =============================================================================
% \LLpage{surtitre}{Titre} : nouvelle page, surtitre en capitales espacées, titre, filet ocre.
% \LLpage{Titre} : nouvelle page, titre en encre, filet ocre dessous. Le surtitre a disparu
% avec la page de garde : chaque page porte son nom, et le bandeau dit déjà la course.
\newcommand{\LLpage}[1]{%
  \clearpage
  \LLrunninghead{#1}%
  {\LLsemiboldfont\fontsize{27}{30}\selectfont\color{LLText}#1\par}
  \vspace{4mm}{\color{LLAccent}\rule{25.4mm}{1.3mm}}\par
  \vspace{4mm}%
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
% 12. Les trois tuiles de la prédiction
% =============================================================================
% Un seul encadré, divisé en trois par des filets : rapide, centrale, prudent. La centrale
% se distingue par la GRAISSE et la couleur de son étiquette, pas par un cadre de plus.
\newlength{\LLtuileW}
\newcommand{\LL@tuile}[7]{%
  \begin{minipage}[t]{\LLtuileW}\centering\vspace{4.5mm}
    {#4\fontsize{7.5}{9}\selectfont\color{#5}\LLtracked{\MakeUppercase{#1}}\par}
    \vspace{2.5mm}
    {#6\LLtabular\fontsize{23}{25}\selectfont\color{LLText}#2\par}
    \vspace{1.5mm}
    {#6\fontsize{9.75}{12}\selectfont\color{#7}#3\par}
    \vspace{4.5mm}
  \end{minipage}}
\newcommand{\LLtuile}[3]{\LL@tuile{#1}{#2}{#3}{\LLsemiboldfont}{LLSoft}{}{LLSoft}}
\newcommand{\LLtuileforte}[3]{%
  \LL@tuile{#1}{#2}{#3}{\LLextraboldfont}{LLDeep}{\LLsemiboldfont}{LLText}}
\newcommand{\LLtuiles}[1]{%
  \setlength{\LLtuileW}{\dimexpr(\linewidth-1.6pt)/3\relax}%
  \setlength{\fboxsep}{0pt}\setlength{\fboxrule}{0.4pt}%
  \noindent{\color{LLHairline}\fbox{\color{LLText}%
    \hbox{\color{LLTableRule}\vrule width 0pt #1}}}\par}
\newcommand{\LLtuilesep}{{\color{LLTableRule}\vrule width 0.4pt}}
% \LLqr{url} : QR vers l'annexe en ligne
\newcommand{\LLqr}[1]{\qrcode[height=24.3mm,level=M]{#1}}

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
% 15 bis. Les tableaux : une grille fine, trois colonnes teintées, deux repères
% =============================================================================
% Un tableau de course se lit à bout de bras. La grille est un filet fin et régulier ; la
% couleur ne sert qu'aux TROIS COLONNES horaires, pour qu'on retrouve la sienne d'un coup
% d'œil. Les deux repères qui restent se lisent en marge et à côté du nom : un filet
% terracotta (l'assistance est autorisée), un point d'encre (le segment se court de nuit).
\colorlet{LLTableRule}{LLSoft}
\colorlet{LLColRapide}{LLPrimary!12!LLBg}
\colorlet{LLColCentrale}{LLDeep!38!LLBg}
\colorlet{LLColPrudent}{LLAccent!40!LLBg}
\colorlet{LLFillRule}{LLGaugeFull}            % le pointillé d'une case à remplir

\newcommand{\LLtableau}{%
  \arrayrulecolor{LLTableRule}%
  \setlength{\arrayrulewidth}{0.4pt}%
  \LLtabular}
% \LLfilet{n colonnes} : le filet horizontal d'un tableau à n colonnes. hhline et non \hline,
% parce qu'un fond de cellule recouvre le filet de la ligne du dessus.
\newcommand{\LLfilet}[1]{\noalign{}\hhline{*{#1}{|-}|}}
% \LLcell / \LLcellg : le préfixe de toute colonne « p » d'un tableau de course.
%
% Une colonne « p » est un \vtop : sa hauteur est celle de sa PREMIÈRE BOÎTE. Une cellule qui
% commence par un changement de couleur pose d'abord un whatsit, la hauteur tombe à zéro et
% la cellule descend d'une ligne — le tableau se lisait alors en escalier. \leavevmode ouvre
% le paragraphe avant tout le reste, la première boîte existe, et toutes les colonnes
% s'alignent. La couleur et la graisse se déclarent donc ICI, pas dans la cellule.
\newcommand{\LLcell}{\centering\arraybackslash\leavevmode}
\newcommand{\LLcellg}{\raggedright\arraybackslash\leavevmode}
% Les colonnes des tableaux de course sont des « m » (array) et non des « p » : le contenu
% y est centré VERTICALEMENT dans la ligne. Avec des « p », une ligne plus haute que les
% autres laissait ses voisines accrochées en haut, et le tableau se lisait de travers.
% \LLtetehoraire{couleur}{texte} : l'en-tête d'une colonne horaire — un trait épais de sa
% couleur, puis l'heure d'arrivée. C'est ce trait qui fait le lien avec la légende.
\newcommand{\LLtetehoraire}[2]{%
  \begin{minipage}[b]{\linewidth}\centering
    {\color{#1}\rule{\linewidth}{1.3mm}}\par\vspace{2pt}%
    {\LLsemiboldfont\fontsize{6.8}{8}\selectfont\color{LLText}\LLtracked{\MakeUppercase{#2}}\par}
    \vspace{1pt}%
  \end{minipage}}
% \LLtete{texte} : l'en-tête d'une colonne ordinaire.
\newcommand{\LLtete}[1]{%
  {\LLsemiboldfont\fontsize{6.8}{8}\selectfont\color{LLText}\LLtracked{\MakeUppercase{#1}}}}
% \LLteteindice{texte}{indice} : le même en-tête, suivi d'un indice en bas de casse (KM\textsubscript{tot}).
\newcommand{\LLteteindice}[2]{%
  {\LLsemiboldfont\fontsize{6.8}{8}\selectfont\color{LLText}\LLtracked{\MakeUppercase{#1}}%
   \textsubscript{\fontsize{5.6}{6}\selectfont #2}}}
% \LLtient{largeur}{contenu} : le contenu sur UNE ligne, rétréci s'il déborde.
%
% C'est ce qui donne au tableau des lignes de hauteur égale : un nom de ravitaillement long
% passait à la ligne, la ligne doublait de hauteur, et le point de nuit se retrouvait seul en
% dessous. Les colonnes sont taillées pour que le rétrécissement ne serve presque jamais.
\newsavebox{\LL@tientbox}
\newcommand{\LLtient}[2]{%
  \sbox{\LL@tientbox}{#2}%
  \ifdim\wd\LL@tientbox>#1\relax \resizebox{#1}{!}{\usebox{\LL@tientbox}}%
  \else\usebox{\LL@tientbox}\fi}
% \LLnomseg{nom}{repère} : le nom d'un ravitaillement, son repère de nuit collé au bord droit
% de la colonne — sur la même ligne, toujours.
\newcommand{\LLnomseg}[2]{%
  \hbox to \linewidth{\LLtient{\dimexpr\linewidth-4mm\relax}{\mbox{#1}}\hfill #2}}
% \LLmargecrew : la première colonne d'une ligne où l'assistance est autorisée — un filet
% terracotta en marge, sur toute la hauteur de la ligne.
% Un filet tracé, et non un fond de cellule : colortbl peint le fond sur la hauteur qu'il
% calcule, laquelle ne coïncide pas avec la ligne quand l'interligne du tableau est étiré.
% La réglette du tableau (\@arstrutbox), elle, EST la hauteur de la ligne.
\newcommand{\LLmargecrew}{%
  \rule[-\dp\@arstrutbox]{\linewidth}{\dimexpr\ht\@arstrutbox+\dp\@arstrutbox\relax}}
% \LLnuitpoint : le point d'encre qui dit « ce segment se court de nuit », posé après le nom.
\newcommand{\LLnuitpoint}{\raisebox{0.15ex}{\tikz\fill[LLText] (0,0) circle (0.85mm);}}
% \LLprevu{valeur} : la colonne de l'heure prévue, en gras dans sa teinte.
\newcommand{\LLprevu}[1]{{\LLsemiboldfont #1}}
% \LLfort{valeur} : un chiffre qui doit sauter aux yeux (D+ et D− marqués).
\newcommand{\LLfort}[1]{{\LLsemiboldfont #1}}
% \LLlegende{texte} : la ligne qui dit ce que veulent dire les repères du tableau.
\newcommand{\LLlegende}[1]{%
  \par\vspace{5pt}{\fontsize{7.6}{10}\selectfont\color{LLSoft}#1\par}}
% \LLtraitlegende{couleur} : le rectangle de légende qui rappelle un filet du tableau.
\newcommand{\LLtraitlegende}[1]{\textcolor{#1}{\rule[0.5ex]{3.7mm}{1.05mm}}}
% \LLcasevide : la case qu'on remplit au stylo, un simple pointillé.
\newcommand{\LLcaselargeur}{16mm}
\newcommand{\LLcasevide}{\textcolor{LLFillRule}{\makebox[\LLcaselargeur]{\dotfill}}}
% \LLcaseecrire : la ligne pointillée bleu-vert d'une case laissée à remplir, dans le
% tableau de marche — elle prend toute la largeur de la colonne.
\newcommand{\LLcaseecrire}{%
  \makebox[\linewidth]{\textcolor{LLPrimary}{\LLpointille}}}

% \LLcouverture{surtitre}{titre}{pour}{méta}{pied gauche}{pied droit} : la page de garde.
% Barre bleu-vert et son liseré ocre sur toute la hauteur, la marque en haut, le titre posé
% dans le bas de la page, et une ligne de pied qui porte la date d'édition et la référence.
% La classe ne décide d'aucun texte : elle pose.
\newcommand{\LLcouverture}[6]{%
  \thispagestyle{empty}%
  \null
  \begin{tikzpicture}[remember picture, overlay]
    \fill[LLPrimary] (current page.north west)
      rectangle ([xshift=\LLcoverbar]current page.south west);
    \fill[LLAccent] ([xshift=\LLcoverbar]current page.north west)
      rectangle ([xshift=\dimexpr\LLcoverbar+\LLcovergold\relax]current page.south west);
    \node[anchor=north west, inner sep=0]
      at ([xshift=\LLcoverx, yshift=-23.3mm]current page.north west)
      {\LLbrand{14.3mm}{11}};
    \node[anchor=south west, inner sep=0, text width=\LLcoverw, align=left]
      at ([xshift=\LLcoverx, yshift=78mm]current page.south west)
      {\begin{minipage}{\LLcoverw}\raggedright
        {\LLsemiboldfont\fontsize{8.3}{11}\selectfont\color{LLDeep}%
          \LLtracked{\MakeUppercase{#1}}\par}
        \vspace{6mm}
        {\LLsemiboldfont\fontsize{45}{47}\selectfont\color{LLText}#2\par}
        \vspace{8mm}
        {\color{LLAccent}\rule{25.4mm}{1.3mm}}\par
        \vspace{8mm}
        {\LLlightfont\fontsize{19.5}{24}\selectfont\color{LLText}#3\par}
        \vspace{3mm}
        {\fontsize{11.25}{19}\selectfont\color{LLSoft}#4\par}
      \end{minipage}};
    \node[anchor=south west, inner sep=0, text width=\dimexpr\paperwidth-\LLcoverx-14.8mm\relax]
      at ([xshift=\LLcoverx, yshift=17mm]current page.south west)
      {\hbox to \dimexpr\paperwidth-\LLcoverx-14.8mm\relax{%
        {\LLsemiboldfont\fontsize{7.1}{9}\selectfont\color{LLSoft}\LLtracked{\MakeUppercase{#5}}}%
        \hfill
        {\LLsemiboldfont\fontsize{7.1}{9}\selectfont\color{LLSoft}\LLtracked{\MakeUppercase{#6}}}}};
  \end{tikzpicture}%
  \clearpage}

% \LLbloc{étiquette} : l'étiquette terracotta qui ouvre un bloc de page. Elle ferme d'abord
% le paragraphe courant : posée après une minipage, elle se retrouvait sinon à la suite de la
% ligne précédente, et son premier mot restait accroché au bloc d'avant.
\newcommand{\LLbloc}[1]{%
  \par\noindent{\LLsemiboldfont\fontsize{7.5}{10}\selectfont\color{LLDeep}%
    \LLtracked{\MakeUppercase{#1}}}\par}

% \LLchiffregeant{valeur}{suite} : l'heure d'arrivée, en grand, et ce qui la suit en ligne.
% À 78 points, l'espace fine d'une durée (« 14\,h\,40 ») fait treize points et le chiffre se
% disloque : elle se resserre ici, et nulle part ailleurs.
\newcommand{\LLchiffregeant}[2]{%
  \noindent{\LLlightfont\LLtabular\fontsize{78}{78}\selectfont\color{LLText}%
    \def\,{\kern0.05em}#1}%
  \hspace{5mm}{\fontsize{15}{18}\selectfont\color{LLText}#2}\par}

% \LLdefligne{étiquette}{texte} : une ligne de définition — l'étiquette à gauche, le
% paragraphe à droite, un filet fin dessous. \LLdeffin pour la dernière (pas de filet).
\newlength{\LLdeflab} \setlength{\LLdeflab}{39.7mm}
\newcommand{\LL@defligne}[3]{%
  \noindent\begin{minipage}[t]{\LLdeflab}\vspace{0pt}\raggedright\LLbloc{#1}\end{minipage}%
  \hspace{5.8mm}%
  \begin{minipage}[t]{\dimexpr\linewidth-\LLdeflab-5.8mm\relax}\vspace{-2pt}
    {\fontsize{9.4}{15}\selectfont\color{LLText}#2\par}
  \end{minipage}\par\vspace{7pt}%
  #3}
\newcommand{\LLdefligne}[2]{\LL@defligne{#1}{#2}{{\color{LLHairline}\hrule height 0.4pt}\vspace{7pt}}}
\newcommand{\LLdeffin}[2]{\LL@defligne{#1}{#2}{}}

% \LLprofilligne{mesure}{valeur}{texte} : une ligne de « Ton profil ».
\newlength{\LLproflab} \setlength{\LLproflab}{45.5mm}
\newlength{\LLprofval} \setlength{\LLprofval}{34mm}
\newcommand{\LL@profilligne}[4]{%
  \noindent\begin{minipage}[c]{\LLproflab}\centering
    {\LLsemiboldfont\fontsize{7.5}{10}\selectfont\color{LLText}\LLtracked{\MakeUppercase{#1}}\par}
  \end{minipage}%
  \begin{minipage}[c]{\LLprofval}\centering
    {\LLlightfont\LLtabular\fontsize{19.5}{22}\selectfont\color{LLText}#2\par}
  \end{minipage}%
  \begin{minipage}[c]{\dimexpr\linewidth-\LLproflab-\LLprofval-4mm\relax}
    \hspace{4mm}\begin{minipage}{\dimexpr\linewidth-4mm\relax}
      {\fontsize{9.4}{14}\selectfont\color{LLSoft}#3\par}
    \end{minipage}%
  \end{minipage}\par\vspace{7pt}%
  #4}
\newcommand{\LLprofilligne}[3]{%
  \LL@profilligne{#1}{#2}{#3}{{\color{LLHairline}\hrule height 0.4pt}\vspace{7pt}}}
\newcommand{\LLprofilfin}[3]{\LL@profilligne{#1}{#2}{#3}{}}

% \LLbarreintensite{mini}{maxi}{course}{txt mini}{txt maxi}{txt course} : l'étendue des
% ultras en bleu-vert, le repère de cette course en terracotta. Les trois premiers sont des
% FRACTIONS de l'axe, calculées par le contexte — la classe n'a aucune échelle à elle.
\newcommand{\LLbarreintensite}[6]{%
  \begin{tikzpicture}[x=\linewidth, y=1mm]
    \draw[LLHairline, line width=0.3pt] (0,0) -- (1,0);
    \fill[LLPrimary] (#1,-1.7) rectangle (#2,1.7);
    \fill[LLDeep] (#3,-4.4) rectangle ($(#3,4.4)+(0.5pt,0)$);
    \node[anchor=south, inner sep=1pt] at (#3,4.6)
      {\LLsemiboldfont\fontsize{9.75}{11}\selectfont\color{LLDeep}#6};
    \node[anchor=north, inner sep=2pt] at (#1,-2.2)
      {\fontsize{8.25}{10}\selectfont\color{LLSoft}#4};
    \node[anchor=north, inner sep=2pt] at (#2,-2.2)
      {\fontsize{8.25}{10}\selectfont\color{LLSoft}#5};
  \end{tikzpicture}}

% \LLpanneau{contenu} : un bloc posé sur un fond crème un peu plus chaud que la page. La
% seule couleur de fond du rapport — elle sépare un bloc de ses voisins sans filet ni cadre.
\newcommand{\LLpanneau}[1]{%
  \setlength{\fboxsep}{7mm}%
  \noindent\colorbox{LLGrid}{%
    \begin{minipage}{\dimexpr\linewidth-14mm\relax}#1\end{minipage}}\par}

% \LLcadredecoupe{contenu} : le liseré pointillé terracotta qui dit où couper, avec son
% étiquette posée sur le trait, en haut à droite.
\newsavebox{\LL@decoupebox}
\newcommand{\LLcadredecoupe}[1]{%
  \sbox{\LL@decoupebox}{\begin{minipage}{\dimexpr\linewidth-7mm\relax}#1\end{minipage}}%
  \noindent\begin{tikzpicture}
    \node[inner sep=3.5mm, outer sep=0, anchor=north west,
          draw=LLDeep, dash pattern=on 2.4pt off 2.4pt, line width=0.7pt]
      (LL@d) at (0,0) {\usebox{\LL@decoupebox}};
    \node[anchor=east, inner sep=0, fill=LLBg, inner xsep=2mm]
      at ([xshift=-9mm]LL@d.north east)
      {\LLsemiboldfont\fontsize{6}{8}\selectfont\color{LLDeep}\LLtracked{\MakeUppercase{À découper}}};
  \end{tikzpicture}\par}

% Les fiches d'assistance : une par poste, à découper et à donner. \LLficheW et \LLficheH
% sont les dimensions de la CASE (trait de coupe compris) ; le contenu respire de \LLfichepad.
\newlength{\LLficheW}   \setlength{\LLficheW}{90mm}
\newlength{\LLficheH}   \setlength{\LLficheH}{64mm}
\newlength{\LLfichepad} \setlength{\LLfichepad}{5mm}
% \LLfichecase{1 ou 0 : trait à droite}{1 ou 0 : trait en bas}{contenu} : une case de la
% planche, avec les traits de coupe qu'elle partage avec ses voisines.
\newcommand{\LLfichecase}[3]{%
  \begin{tikzpicture}
    \node[inner xsep=\LLfichepad, inner ysep=\LLfichepad, outer sep=0, anchor=north west,
          minimum width=\LLficheW, minimum height=\LLficheH, align=left] (LL@f) at (0,0)
      {\begin{minipage}[t][\dimexpr\LLficheH-2\LLfichepad\relax][t]%
         {\dimexpr\LLficheW-2\LLfichepad\relax}#3\end{minipage}};
    \ifnum#1=1\relax\draw[LLDeep, dash pattern=on 2.4pt off 2.4pt, line width=0.7pt]
      (LL@f.north east) -- (LL@f.south east);\fi
    \ifnum#2=1\relax\draw[LLDeep, dash pattern=on 2.4pt off 2.4pt, line width=0.7pt]
      (LL@f.south west) -- (LL@f.south east);\fi
  \end{tikzpicture}}
% \LLfichecrew{nom}{km}{au plus tôt}{heure prévue}{jour prévu}{au plus tard}{pour qui}{nuit}
% Le nom, le kilomètre, les trois heures, deux lignes à remplir. Elle se découpe et se donne
% — d'où le pied qui rappelle pour qui elle est et si le poste tombe de nuit.
\newcommand{\LLfichecrew}[8]{%
  \setlength{\parskip}{0pt}%
  \hbox to \linewidth{%
    {\LLsemiboldfont\fontsize{16.5}{18}\selectfont\color{LLText}#1}\hfill
    {\LLsemiboldfont\fontsize{9.75}{12}\selectfont\color{LLDeep}km #2}}\par
  \vspace{4.5mm}
  \hbox to \linewidth{%
    \begin{minipage}[b]{0.30\linewidth}\centering
      {\LLsemiboldfont\fontsize{6.4}{8}\selectfont\color{LLSoft}\LLtracked{\MakeUppercase{Au plus tôt}}\par}
      \vspace{1.5mm}{\LLtabular\fontsize{10.5}{12}\selectfont\color{LLText}#3\par}
    \end{minipage}\hfill
    {\color{LLTableRule}\vrule width 0.4pt height 11mm depth 0pt}\hfill
    \begin{minipage}[b]{0.33\linewidth}\centering
      {\LLextraboldfont\fontsize{6.4}{8}\selectfont\color{LLDeep}\LLtracked{\MakeUppercase{Prévu}}\par}
      \vspace{1mm}{\LLsemiboldfont\LLtabular\fontsize{15.75}{17}\selectfont\color{LLText}#4\par}
      {\fontsize{7.5}{9}\selectfont\color{LLSoft}#5\par}
    \end{minipage}\hfill
    {\color{LLTableRule}\vrule width 0.4pt height 11mm depth 0pt}\hfill
    \begin{minipage}[b]{0.30\linewidth}\centering
      {\LLsemiboldfont\fontsize{6.4}{8}\selectfont\color{LLSoft}\LLtracked{\MakeUppercase{Au plus tard}}\par}
      \vspace{1.5mm}{\LLtabular\fontsize{10.5}{12}\selectfont\color{LLText}#6\par}
    \end{minipage}}\par
  \vspace{4.5mm}
  {\LLsemiboldfont\fontsize{6.4}{8}\selectfont\color{LLSoft}\LLtracked{\MakeUppercase{À prévoir}}\par}
  \vspace{3mm}
  {\color{LLPrimary}\LLpointille}\par\vspace{3.5mm}{\color{LLPrimary}\LLpointille}\par
  \vfill
  \hbox to \linewidth{%
    {\LLsemiboldfont\fontsize{6}{8}\selectfont\color{LLSoft}\LLtracked{\MakeUppercase{#7}}}\hfill
    {\fontsize{6}{8}\selectfont\color{LLSoft}#8}}}
% le pointillé d'une ligne à remplir, sur toute la largeur courante
\newcommand{\LLpointille}{%
  \leavevmode\leaders\hbox to 2.2pt{\hss\rule[1pt]{0.6pt}{0.6pt}\hss}\hfill\kern0pt}

% La barre empilée : où passe le temps. Une largeur totale, quatre tronçons, aucune échelle
% inventée — chaque tronçon est sa part du temps prévu. \LLbarre{...} l'encadre d'un filet
% fin pour que le tronçon le plus clair se voie quand même.
\newlength{\LLbarrelargeur}
\newcommand{\LLtroncon}[2]{\textcolor{#2}{\rule{#1\LLbarrelargeur}{8mm}}}
\newcommand{\LLbarre}[1]{%
  \setlength{\LLbarrelargeur}{\dimexpr\linewidth-0.8pt\relax}%
  \setlength{\fboxsep}{0pt}\setlength{\fboxrule}{0.4pt}%
  \noindent{\color{LLHairline}\fbox{\hbox{#1}}}\par}
\newcommand{\LLpuce}[1]{\textcolor{#1}{\rule[-0.1ex]{2.9mm}{2.9mm}}\hspace{4pt}}

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
