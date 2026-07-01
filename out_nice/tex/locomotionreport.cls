%% locomotionreport.cls
%% -----------------------------------------------------------------------------
%% Classe LaTeX « Locomotion Lab » pour rapports techniques / scientifiques.
%% Reprend les couleurs, la police (Ubuntu) et la logique de logo du thème
%% Beamer "LocomotionLab" (reference_beamer/beamerThemeLocomotionLab.sty).
%%
%% Compiler avec XeLaTeX ou LuaLaTeX (police Ubuntu via fontspec) + biber.
%% Voir README.md pour les commandes disponibles.
%% -----------------------------------------------------------------------------
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{locomotionreport}[2026/06/24 v1.0 Locomotion Lab report class]

% --- Options de classe -------------------------------------------------------
% [systemfonts] : utilise la police système "Ubuntu" au lieu des .ttf fournis
%                 dans fonts/ (utile si Ubuntu est installée sur la machine).
\newif\ifLL@systemfonts \LL@systemfontsfalse
\DeclareOption{systemfonts}{\LL@systemfontstrue}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax

\LoadClass[11pt,a4paper]{article}

% =============================================================================
% 1. Moteur & polices (Ubuntu / Ubuntu Mono) — cf. README §1, thème beamer
% =============================================================================
\RequirePackage{iftex}
\ifPDFTeX
  % Repli pdfLaTeX : Ubuntu indisponible via fontspec -> Latin Modern.
  \RequirePackage[T1]{fontenc}
  \RequirePackage[utf8]{inputenc}
  \RequirePackage{lmodern}
  \newcommand{\LLmono}{\ttfamily}
  \newcommand{\LLmediumfont}{\mdseries}
  \newcommand{\LLlightfont}{\mdseries}
  \newcommand{\LLtracked}[1]{#1}
\else
  \RequirePackage{fontspec}
  \ifLL@systemfonts
    % --- Polices système -----------------------------------------------------
    \setmainfont{Ubuntu}
    \setsansfont{Ubuntu}
    \setmonofont{Ubuntu Mono}
    \newfontfamily\LLmono{Ubuntu Mono}
    \newfontfamily\LLmediumfont{Ubuntu Medium}
    \newfontfamily\LLlightfont{Ubuntu Light}
  \else
    % --- Polices embarquées (fonts/) : compilation reproductible -------------
    \setmainfont{Ubuntu}[Path=fonts/, Extension=.ttf,
      UprightFont=*-R, BoldFont=*-B, ItalicFont=*-RI, BoldItalicFont=*-BI]
    \setsansfont{Ubuntu}[Path=fonts/, Extension=.ttf,
      UprightFont=*-R, BoldFont=*-B, ItalicFont=*-RI, BoldItalicFont=*-BI]
    \setmonofont{UbuntuMono}[Path=fonts/, Extension=.ttf,
      UprightFont=*-R, BoldFont=*-B, ItalicFont=*-RI, BoldItalicFont=*-BI]
    \newfontfamily\LLmono{UbuntuMono}[Path=fonts/, Extension=.ttf,
      UprightFont=*-R, BoldFont=*-B, ItalicFont=*-RI, BoldItalicFont=*-BI]
    \newfontfamily\LLmediumfont{Ubuntu}[Path=fonts/, Extension=.ttf,
      UprightFont=*-M, ItalicFont=*-MI]
    \newfontfamily\LLlightfont{Ubuntu}[Path=fonts/, Extension=.ttf,
      UprightFont=*-L, ItalicFont=*-LI]
  \fi
  % Interlettrage (tracking) pour les eyebrows / libellés mono.
  \newcommand{\LLtracked}[1]{{\addfontfeature{LetterSpace=14.0}#1}}
\fi

% =============================================================================
% 2. Paquets
% =============================================================================
\RequirePackage[table,svgnames]{xcolor}
\RequirePackage{graphicx}
\RequirePackage{geometry}
\RequirePackage{tikz}
\usetikzlibrary{calc,shadows.blur,patterns}
\RequirePackage[most]{tcolorbox}
\tcbuselibrary{listings,skins,breakable}
\RequirePackage{array}
\RequirePackage{booktabs}
\RequirePackage{caption}
\RequirePackage{enumitem}
\RequirePackage{ragged2e}
\RequirePackage{titlesec}
\RequirePackage{titletoc}
\RequirePackage{fancyhdr}
\RequirePackage[french]{babel}
% babel-french met « Figure / Table » en petites capitales : on revient en
% casse normale, conformément à la maquette (« Figure 2.1 — … »).
\renewcommand*{\FBfigtabshape}{}
\RequirePackage{microtype}
% Support mathématique (math.tex reprend ces commandes).
\RequirePackage{amsmath,amssymb,mathtools,bm,stmaryrd}
\RequirePackage{needspace}
\RequirePackage[backend=biber,style=numeric,sorting=none]{biblatex}
\RequirePackage[hidelinks]{hyperref}

% =============================================================================
% 3. Palette (identique au thème beamer + nuances de la maquette) — README §2
% =============================================================================
\definecolor{LLBg}{HTML}{FEFBF6}        % fond « blanc os »
\definecolor{LLPrimary}{HTML}{8CB9BD}   % bleu sauge
\definecolor{LLAccent}{HTML}{EFB159}    % doré (filets / aplats)
\definecolor{LLAccentInk}{HTML}{D89A2E} % doré assombri (TEXTE orange)
\definecolor{LLDeep}{HTML}{B67352}      % terracotta
\definecolor{LLText}{HTML}{333333}      % corps de texte
\definecolor{LLPaper}{HTML}{FFFFFF}     % fond cartes / encadrés
\definecolor{LLGrid}{HTML}{F3EEE6}      % code inline, fonds discrets
% Nuances de gris / accents de la maquette
\definecolor{LLCoverSub}{HTML}{6E6A62}  % sous-titre couverture
\definecolor{LLMetaVal}{HTML}{55524C}   % valeurs méta
\definecolor{LLMetaLabel}{HTML}{9A9890} % libellés méta
\definecolor{LLFootMono}{HTML}{A59C8C}  % mono pied de page / pages sous-entrées
\definecolor{LLCaption}{HTML}{6B6458}   % légendes
\definecolor{LLDelta}{HTML}{3F8F5B}     % variations positives (tableaux)
\definecolor{LLCodeBg}{HTML}{33312E}    % fond blocs de code
\definecolor{LLCodeFg}{HTML}{E8E2D6}    % texte code
\definecolor{LLCodeNum}{HTML}{CDB892}   % nombres dans le code
\definecolor{LLAttnLabel}{HTML}{C8902F} % libellé « Attention »
\definecolor{LLRowAlt}{HTML}{F7F1E8}    % zébrure tableaux
\definecolor{LLTocRule}{HTML}{ECE4D6}   % filet sous entrées TOC
\definecolor{LLTocPage}{HTML}{8A8275}   % n° de page TOC (niveau 1)
\definecolor{LLTocDot}{HTML}{CBC1B0}    % points de suite TOC (niveau 1)
\definecolor{LLTocDotSub}{HTML}{D8CFBE} % points de suite TOC (sous-entrées)
\definecolor{LLTocSub}{HTML}{5F5849}    % texte sous-entrées TOC
\definecolor{LLCoverMetaRule}{HTML}{DCDAD6} % filet du bloc méta (couverture)
\definecolor{LLAbstractText}{HTML}{444444}  % texte du résumé

% =============================================================================
% 4. Métadonnées du rapport — README §"API"
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
% 5. Logos : résolution multi-format robuste (reprise du thème beamer) — §"Assets"
% =============================================================================
% Chemins SANS extension ; surchargeables dans main.tex via \renewcommand.
\newcommand{\LLCoverLogoPath}{assets/logo_primary_deep} % couverture (fond clair)
\newcommand{\LLHeaderLogoPath}{assets/logo_full_white}  % bandeau d'en-tête (sauge)
\newcommand{\LLCoverLogoFile}{}
\newcommand{\LLHeaderLogoFile}{}
% Résout #1 (chemin sans ext) en cherchant pdf/png/jpg/jpeg ; stocke dans #2.
\newcommand{\LLresolvelogo}[2]{%
  \def#2{}%
  \IfFileExists{#1.pdf}{\def#2{#1.pdf}}{%
    \IfFileExists{#1.png}{\def#2{#1.png}}{%
      \IfFileExists{#1.jpg}{\def#2{#1.jpg}}{%
        \IfFileExists{#1.jpeg}{\def#2{#1.jpeg}}{%
          \ClassWarning{locomotionreport}{Logo introuvable : #1.(pdf|png|jpg|jpeg)}}}}}%
}
\AtBeginDocument{%
  \LLresolvelogo{\LLCoverLogoPath}{\LLCoverLogoFile}%
  \LLresolvelogo{\LLHeaderLogoPath}{\LLHeaderLogoFile}%
}

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

% Puces d'itemize aux couleurs du labo.
\setlist[itemize,1]{label={\textcolor{LLAccent}{\small$\diamond$}}, leftmargin=1.5em, itemsep=2pt, topsep=2pt}
\setlist[itemize,2]{label={\textcolor{LLPrimary}{\small$\diamond$}}, leftmargin=1.4em, itemsep=1pt}
\setlist[enumerate,1]{label={\textcolor{LLDeep}{\bfseries\arabic*.}}, leftmargin=1.7em, itemsep=2pt, topsep=2pt}

% Profondeur de numérotation / table des matières (sections -> 2.1.1 ; TOC -> 2.1)
\setcounter{secnumdepth}{3}
\setcounter{tocdepth}{2}

% Figures & tableaux numérotés par section (Figure 2.1, Table 3.1) — README §8/§9
\counterwithin{figure}{section}
\counterwithin{table}{section}

% =============================================================================
% 7. Dimensions de la charte (modifiables)
% =============================================================================
\newlength{\LLbandH}     \setlength{\LLbandH}{13.8mm}   % hauteur bandeau sauge (~46px)
\newlength{\LLgoldH}     \setlength{\LLgoldH}{1.2mm}    % filet doré sous bandeau (~4px)
\newlength{\LLbandinset} \setlength{\LLbandinset}{14mm} % marge int. du bandeau
\newcommand{\LLHeaderLogoHeight}{7.4mm}                 % hauteur logo en-tête (~26px)
% Couverture
\newlength{\LLcoversidebar} \setlength{\LLcoversidebar}{16.2mm} % barre sauge (~54px)
\newlength{\LLcovergold}    \setlength{\LLcovergold}{1.5mm}     % liseré doré (~5px)
\newlength{\LLcovercontentx}\setlength{\LLcovercontentx}{33mm}  % marge contenu (~110px)
\newlength{\LLcoverlogoy}   \setlength{\LLcoverlogoy}{24mm}     % logo : y (~80px)
\newlength{\LLcoverlogow}   \setlength{\LLcoverlogow}{62mm}     % logo : largeur (~230px)
\newlength{\LLcovertitley}  \setlength{\LLcovertitley}{112mm}   % bloc titre : y (~360px)
\newlength{\LLcovertextw}   \setlength{\LLcovertextw}{153mm}    % largeur bloc contenu
\newlength{\LLcovermetay}   \setlength{\LLcovermetay}{24mm}     % bloc méta : y depuis le bas

% =============================================================================
% 8. En-tête (bandeau sauge + filet doré + logo blanc + section) — README §5
% =============================================================================
% La section courante est stockée dans \leftmark via \markboth.
\renewcommand{\sectionmark}[1]{\markboth{\thesection~\textperiodcentered~#1}{}}
% En-tête « libre » (résumé/TOC, etc.) :
\newcommand{\LLrunninghead}[1]{\markboth{#1}{}}

\newcommand{\LL@headertext}{%
  {\sffamily\bfseries\fontsize{11.5}{13}\selectfont\color{LLBg}\leftmark}%
}
\newcommand{\LLheaderband}{%
  \begin{tikzpicture}[remember picture,overlay]
    % Bandeau sauge pleine largeur, à fleur du bord supérieur
    \fill[LLPrimary]
      (current page.north west) rectangle
      ([yshift=-\LLbandH]current page.north east);
    % Filet doré sous le bandeau
    \fill[LLAccent]
      ([yshift=-\LLbandH]current page.north west) rectangle
      ([yshift=-\dimexpr\LLbandH+\LLgoldH\relax]current page.north east);
    % Logo blanc à gauche
    \ifx\LLHeaderLogoFile\@empty\else
      \node[anchor=west,inner sep=0]
        at ([xshift=\LLbandinset,yshift=-\dimexpr\LLbandH/2\relax]current page.north west)
        {\includegraphics[height=\LLHeaderLogoHeight]{\LLHeaderLogoFile}};
    \fi
    % « N · Titre de section » à droite
    \node[anchor=east,inner sep=0]
      at ([xshift=-\LLbandinset,yshift=-\dimexpr\LLbandH/2\relax]current page.north east)
      {\LL@headertext};
  \end{tikzpicture}%
}

% =============================================================================
% 9. Pied de page stylisé (sans bande pleine) — README §6
% =============================================================================
\newsavebox{\LLpagenumbox}
\newcommand{\LLfooterband}{%
  \sbox{\LLpagenumbox}{\LLmono\fontsize{11}{12}\selectfont\bfseries\color{LLDeep}\thepage}%
  \begin{minipage}{\textwidth}%
    {\color{LLAccent}\rule{\textwidth}{1.6pt}}\par
    \vspace{4pt}%
    \noindent\hbox to \textwidth{%
      {\LLmono\fontsize{8.4}{10}\selectfont\color{LLFootMono}%
        \LLtracked{\MakeUppercase{Locomotion Lab\ \textperiodcentered\ \LL@reportref}}}%
      \hfil
      % Pastille sauge : centre vertical aligné sur le centre du numéro de page.
      \raisebox{0.5\ht\LLpagenumbox}{\tikz[baseline=0pt]{\fill[LLPrimary] (0,0) circle (2.3pt);}}%
      \hspace{6pt}%
      \usebox{\LLpagenumbox}%
    }%
  \end{minipage}%
}

% Style de page « corps » (bandeau + pied).
\fancypagestyle{LLmain}{%
  \fancyhf{}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
  \fancyhead[L]{\LLheaderband}%
  \fancyfoot[L]{\LLfooterband}%
}
% Style « avant-propos » : même habillage, sans numéro/dot impertinent ? -> identique.
\pagestyle{LLmain}

% =============================================================================
% 10. Page de couverture — README §4
% =============================================================================
\newcommand{\LLmetaitem}[2]{%
  {\LLmono\fontsize{8.5}{11}\selectfont\color{LLMetaLabel}\LLtracked{\MakeUppercase{#1}}}\par
  \vspace{4pt}%
  {\fontsize{10.5}{13}\selectfont\bfseries\color{LLMetaVal}#2}%
}
\newcommand{\makecover}{%
  \begingroup
  \thispagestyle{empty}%
  \null% ancre la page
  \begin{tikzpicture}[remember picture,overlay]
    % Fond blanc os
    \fill[LLBg] (current page.south west) rectangle (current page.north east);
    % Barre latérale sauge + liseré doré
    \fill[LLPrimary]
      (current page.north west) rectangle
      ([xshift=\LLcoversidebar]current page.south west);
    \fill[LLAccent]
      ([xshift=\LLcoversidebar]current page.north west) rectangle
      ([xshift=\dimexpr\LLcoversidebar+\LLcovergold\relax]current page.south west);
    % Logo couleur en haut à gauche
    \ifx\LLCoverLogoFile\@empty\else
      \node[anchor=north west,inner sep=0]
        at ([xshift=\LLcovercontentx,yshift=-\LLcoverlogoy]current page.north west)
        {\includegraphics[width=\LLcoverlogow]{\LLCoverLogoFile}};
    \fi
    % Bloc titre
    \node[anchor=north west,inner sep=0]
      at ([xshift=\LLcovercontentx,yshift=-\LLcovertitley]current page.north west)
      {\begin{minipage}[t]{\LLcovertextw}
        \raggedright
        {\LLmono\fontsize{10}{13}\selectfont\color{LLPrimary}%
          \LLtracked{\MakeUppercase{\LL@reporttype\ \textperiodcentered\ R\'ef.\ \LL@reportref\ \textperiodcentered\ \LL@reportversion}}}\par
        \vspace{16pt}
        {\sffamily\bfseries\fontsize{37}{41}\selectfont\color{LLDeep}\@title\par}
        \vspace{12pt}
        {\color{LLAccent}\rule{33mm}{1.5mm}}\par
        \vspace{12pt}
        {\LLlightfont\fontsize{15}{20}\selectfont\color{LLCoverSub}\LL@subtitle\par}
      \end{minipage}};
    % Bloc méta en bas
    \node[anchor=south west,inner sep=0]
      at ([xshift=\LLcovercontentx,yshift=\LLcovermetay]current page.south west)
      {\begin{minipage}[t]{\LLcovertextw}
        {\color{LLCoverMetaRule}\rule{\LLcovertextw}{0.4pt}}\par
        \vspace{12pt}
        \noindent
        \begin{minipage}[t]{0.36\LLcovertextw}\LLmetaitem{Auteurs}{\@author}\end{minipage}%
        \begin{minipage}[t]{0.26\LLcovertextw}\LLmetaitem{Date}{\@date}\end{minipage}%
        \begin{minipage}[t]{0.36\LLcovertextw}\LLmetaitem{Destinataire}{\LL@reportclient}\end{minipage}%
      \end{minipage}};
  \end{tikzpicture}%
  \clearpage
  \endgroup
}
% \maketitle = couverture (README : « \maketitle (ou \makecover) »)
\renewcommand{\maketitle}{\makecover}

% =============================================================================
% 11. Hiérarchie des titres — README §3
% =============================================================================
% Eyebrow « SECTION N » placé dans l'argument LABEL : il n'apparaît donc PAS
% pour les sections étoilées (\section*) — pratique pour « Références ».
\titleformat{\section}[display]
  {\normalfont\sffamily}
  {\LLmono\fontsize{9.5}{12}\selectfont\color{LLDeep}%
     \LLtracked{\MakeUppercase{Section\nobreakspace\thesection}}}
  {5pt}
  {\bfseries\fontsize{24}{28}\selectfont\color{LLDeep}}
  [{\nobreak\vspace{5pt}\titleline[l]{\color{LLAccent}\rule{19mm}{1.2mm}}}]
\titlespacing*{\section}{0pt}{20pt}{12pt}

\titleformat{\subsection}[block]
  {\sffamily\bfseries\fontsize{15}{19}\selectfont\color{LLPrimary}}
  {\thesubsection\,\textemdash\,}{0pt}{}
\titlespacing*{\subsection}{0pt}{15pt}{6pt}

\titleformat{\subsubsection}[block]
  {\sffamily\bfseries\fontsize{13}{17}\selectfont\color{LLAccentInk}}
  {\thesubsubsection\,\textemdash\,}{0pt}{}
\titlespacing*{\subsubsection}{0pt}{11pt}{4pt}

% =============================================================================
% 12. Table des matières — README §11
% =============================================================================
\newcommand{\LLtocname}{Table des mati\`eres}
\newcommand{\LLtoc}{%
  {\LLmono\small\color{LLDeep}\LLtracked{\MakeUppercase{\LLtocname}}}\par
  \vspace{10pt}%
  \begingroup
    \setlength{\parskip}{0pt}%
    \@starttoc{toc}%
  \endgroup
}
% Entrées de niveau 1 : numéro sauge gras, points de suite, page mono ; filet dessous.
\titlecontents{section}[0pt]
  {\addvspace{5pt}\sffamily}
  {\bfseries\color{LLPrimary}\makebox[1.9em][l]{\thecontentslabel}\bfseries\color{LLText}}
  {\bfseries\color{LLPrimary}}
  {\nobreak\hspace{7pt}\titlerule*[5pt]{\color{LLTocDot}\bfseries.}\hspace{7pt}%
     \LLmono\color{LLTocPage}\thecontentspage}
  [{\vspace{3pt}{\color{LLTocRule}\hrule height 0.4pt}}]
% Sous-entrées : numéro mono terracotta, texte gris, page mono.
\titlecontents{subsection}[2.6em]
  {\addvspace{2pt}\sffamily\small\color{LLTocSub}}
  {\LLmono\color{LLDeep}\makebox[2.7em][l]{\thecontentslabel}\normalfont\small\color{LLTocSub}}
  {}
  {\nobreak\hspace{6pt}\titlerule*[5pt]{\color{LLTocDotSub}.}\hspace{6pt}%
     \LLmono\color{LLFootMono}\thecontentspage}
  []

% =============================================================================
% 13. Résumé / Abstract — README §12
% =============================================================================
\newcommand{\LLabstractname}{R\'esum\'e}
\newtcolorbox{LL@abstractbox}{%
  enhanced, breakable,
  colback=LLPaper, colframe=LLPaper, boxrule=0pt,
  arc=8pt, outer arc=8pt,
  left=20pt, right=20pt, top=15pt, bottom=15pt,
  drop fuzzy shadow={black!15},
  before skip=4pt, after skip=18pt,
  before upper={%
    {\sffamily\bfseries\fontsize{15}{18}\selectfont\color{LLDeep}\LLabstractname}\par
    \vspace{8pt}\setlength{\parindent}{0pt}\color{LLAbstractText}},
}
\newenvironment{llabstract}
  {\LLrunninghead{\LLabstractname}\LL@abstractbox}
  {\endLL@abstractbox}
% Ligne « Mots-clés : … »
\newcommand{\keywords}[1]{%
  \par\vspace{10pt}%
  {\LLmono\footnotesize\textcolor{LLDeep}{\textbf{Mots-cl\'es :}}\ \textcolor{LLFootMono}{#1}}%
}

% =============================================================================
% 14. Encadrés note / attention / exemple — README §7
% =============================================================================
\newcommand{\LLboxlabel}[2]{%
  {\sffamily\fontsize{9}{11}\selectfont\bfseries\color{#1}\LLtracked{\MakeUppercase{#2}}}%
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
  before upper={\LLboxlabel{LLPrimary}{#1}\par\vspace{4pt}}}
\newtcolorbox[]{llattention}[1][Attention]{LL@boxbase,
  borderline west={4pt}{0pt}{LLAccent},
  before upper={\LLboxlabel{LLAttnLabel}{#1}\par\vspace{4pt}}}
\newtcolorbox[]{llexemple}[1][Exemple]{LL@boxbase,
  borderline west={4pt}{0pt}{LLDeep},
  before upper={\LLboxlabel{LLDeep}{#1}\par\vspace{4pt}}}

% =============================================================================
% 15. Figures & légendes — README §8
% =============================================================================
\DeclareCaptionLabelSeparator{LLdash}{\ \textemdash\ }
\captionsetup{
  font={small,color=LLCaption},
  labelfont={bf,color=LLDeep},
  labelsep=LLdash,
  justification=raggedright, singlelinecheck=false,
}
% Placeholder « figure » (gabarit hachuré 45°, comme la maquette).
\newcommand{\LLfigureplaceholder}[2][45mm]{%
  \begin{tikzpicture}
    \node[minimum width=\linewidth, minimum height=#1, inner sep=0,
          rounded corners=6pt] (LLph) {};
    \begin{scope}
      \clip[rounded corners=6pt] (LLph.south west) rectangle (LLph.north east);
      \fill[LLBg] (LLph.south west) rectangle (LLph.north east);
      \fill[pattern=north east lines, pattern color=LLGrid]
        (LLph.south west) rectangle (LLph.north east);
    \end{scope}
    \draw[rounded corners=6pt, draw=LLGrid!60!LLCaption, line width=0.4pt]
      (LLph.south west) rectangle (LLph.north east);
    \node at (LLph) {\LLmono\small\color{LLCaption}#2};
  \end{tikzpicture}%
}

% =============================================================================
% 16. Tableaux — README §9
% =============================================================================
\newcommand{\LLnum}[1]{{\LLmono #1}}                 % valeur numérique (mono)
\newcommand{\LLpos}[1]{{\LLmono\color{LLDelta}#1}}   % variation positive (vert)
% En-tête de tableau : fond sauge, texte blanc os, gras.
\newcommand{\LLthead}[1]{\textcolor{LLBg}{\textbf{#1}}}
\newcommand{\LLheaderrow}{\rowcolor{LLPrimary}}
% Active la zébrure blanc / sable à partir de la ligne courante.
\newcommand{\LLzebra}{\rowcolors{2}{LLPaper}{LLRowAlt}}

% =============================================================================
% 17. Code / listings — README §10
% =============================================================================
\lstdefinestyle{locomotion}{
  basicstyle=\LLmono\fontsize{10.5}{14}\selectfont\color{LLCodeFg},
  keywordstyle=[1]\color{LLAccent},
  keywordstyle=[2]\color{LLPrimary},
  keywords=[1]{import,as,return,for,while,if,elif,else,in,from,not,and,or,with,yield,pass,break,continue,raise,try,except,finally,assert,global,True,False,None},
  keywords=[2]{def,class,lambda,self},
  stringstyle=\color{LLCodeNum},
  commentstyle=\color{LLFootMono}\itshape,
  showstringspaces=false,
  keepspaces=true,
  columns=fullflexible,
  breaklines=true, breakatwhitespace=true,
  upquote=true,
  literate=%
    {0}{{\color{LLCodeNum}0}}1 {1}{{\color{LLCodeNum}1}}1 {2}{{\color{LLCodeNum}2}}1
    {3}{{\color{LLCodeNum}3}}1 {4}{{\color{LLCodeNum}4}}1 {5}{{\color{LLCodeNum}5}}1
    {6}{{\color{LLCodeNum}6}}1 {7}{{\color{LLCodeNum}7}}1 {8}{{\color{LLCodeNum}8}}1
    {9}{{\color{LLCodeNum}9}}1
    {é}{{\'e}}1 {è}{{\`e}}1 {ê}{{\^e}}1 {à}{{\`a}}1 {ç}{{\c c}}1,
}
% Bloc de code (fond sombre, coins arrondis).
\newtcblisting{llcode}[1][]{%
  listing engine=listings,
  listing only,
  listing options={style=locomotion},
  enhanced, breakable,
  colback=LLCodeBg, colframe=LLCodeBg, boxrule=0pt,
  arc=6pt, outer arc=6pt,
  left=12pt, right=12pt, top=10pt, bottom=10pt,
  before skip=12pt, after skip=14pt,
  #1
}
% Code inline (fond sable, petit radius).
\newtcbox{\llinline}{%
  on line, box align=base,
  colback=LLGrid, colframe=LLGrid, boxrule=0pt,
  arc=2.5pt, left=3pt, right=3pt, top=1pt, bottom=1pt,
  fontupper=\LLmono\small\color{LLText},
}

% =============================================================================
% 18. Bibliographie — README §13
% =============================================================================
% Repère [n] en mono terracotta ; titres en italique.
\DeclareFieldFormat{labelnumberwidth}{\LLmono\textcolor{LLDeep}{[#1]}}
\DeclareFieldFormat*{title}{\textit{#1}}
\DeclareFieldFormat*{citetitle}{\textit{#1}}
\setlength{\biblabelsep}{1.2em}
% Noms de famille : on conserve les petites capitales (convention française) mais
% on remplace \textnohyphenation (qui insère un U+200B absent d'Ubuntu, d'où un
% avertissement « Missing character ») par une simple interdiction de césure.
\protected\long\def\LL@mkbibnamefamily#1{%
  \textsc{{\hyphenpenalty=\@M\exhyphenpenalty=\@M\relax #1}}}
\AtBeginDocument{\let\mkbibnamefamily\LL@mkbibnamefamily}

% Liens internes discrets (couleurs maison).
\hypersetup{
  colorlinks=true,
  linkcolor=LLText, citecolor=LLDeep, urlcolor=LLPrimary,
  linktoc=all,
}

\endinput
%% End of file `locomotionreport.cls'.
