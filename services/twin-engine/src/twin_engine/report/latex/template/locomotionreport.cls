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
\usetikzlibrary{calc,shadows.blur,patterns}
\RequirePackage[most]{tcolorbox}
\tcbuselibrary{skins,breakable}
\RequirePackage{array}
\RequirePackage{booktabs}
\RequirePackage{caption}
\RequirePackage{enumitem}
\RequirePackage{ragged2e}
\RequirePackage{titlesec}
\RequirePackage{fancyhdr}
\RequirePackage[french]{babel}
\renewcommand*{\FBfigtabshape}{}
\RequirePackage{microtype}
\RequirePackage{amsmath,amssymb,mathtools,bm,stmaryrd}
\RequirePackage{needspace}
\RequirePackage{float}
\RequirePackage{qrcode}
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
% couverture v2 : la phrase, le badge de confiance, la ligne de verdict
\newcommand{\LL@coversentence}{}
\newcommand{\coversentence}[1]{\renewcommand{\LL@coversentence}{#1}}
\newcommand{\LL@coverbadge}{}
\newcommand{\LL@coverbadgecolor}{LLPrimaryDark}
\newcommand{\coverbadge}[2]{\renewcommand{\LL@coverbadge}{#1}\renewcommand{\LL@coverbadgecolor}{#2}}
\newcommand{\LL@coververdict}{}
\newcommand{\coververdict}[1]{\renewcommand{\LL@coververdict}{#1}}

% =============================================================================
% 5. Logos : résolution multi-format
% =============================================================================
\newcommand{\LLCoverLogoPath}{assets/logo_primary_deep}
\newcommand{\LLHeaderLogoPath}{assets/logo_full_white}
\newcommand{\LLCoverLogoFile}{}
\newcommand{\LLHeaderLogoFile}{}
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

\setlist[itemize,1]{label={\textcolor{LLAccent}{\small$\diamond$}}, leftmargin=1.5em, itemsep=2pt, topsep=2pt}
\setlist[itemize,2]{label={\textcolor{LLPrimary}{\small$\diamond$}}, leftmargin=1.4em, itemsep=1pt}
\setlist[enumerate,1]{label={\textcolor{LLDeep}{\bfseries\arabic*.}}, leftmargin=1.7em, itemsep=2pt, topsep=2pt}

\setcounter{secnumdepth}{3}
\counterwithin{figure}{section}
\counterwithin{table}{section}

% =============================================================================
% 7. Dimensions de la charte
% =============================================================================
\newlength{\LLbandH}     \setlength{\LLbandH}{13.8mm}
\newlength{\LLgoldH}     \setlength{\LLgoldH}{1.2mm}
\newlength{\LLbandinset} \setlength{\LLbandinset}{14mm}
\newcommand{\LLHeaderLogoHeight}{7.4mm}
\newlength{\LLcoversidebar} \setlength{\LLcoversidebar}{16.2mm}
\newlength{\LLcovergold}    \setlength{\LLcovergold}{1.5mm}
\newlength{\LLcovercontentx}\setlength{\LLcovercontentx}{33mm}
\newlength{\LLcoverlogoy}   \setlength{\LLcoverlogoy}{24mm}
\newlength{\LLcoverlogow}   \setlength{\LLcoverlogow}{62mm}
\newlength{\LLcovertitley}  \setlength{\LLcovertitley}{96mm}
\newlength{\LLcovertextw}   \setlength{\LLcovertextw}{153mm}
\newlength{\LLcovermetay}   \setlength{\LLcovermetay}{24mm}

% =============================================================================
% 8. En-tête (bandeau bleu-vert + filet ocre + logo blanc + titre courant)
% =============================================================================
\renewcommand{\sectionmark}[1]{\markboth{\thesection~\textperiodcentered~#1}{}}
\newcommand{\LLrunninghead}[1]{\markboth{#1}{}}

\newcommand{\LL@headertext}{%
  {\LLsemiboldfont\fontsize{11}{13}\selectfont\color{LLBg}\leftmark}%
}
\newcommand{\LLheaderband}{%
  \begin{tikzpicture}[remember picture,overlay]
    \fill[LLPrimary]
      (current page.north west) rectangle
      ([yshift=-\LLbandH]current page.north east);
    \fill[LLAccent]
      ([yshift=-\LLbandH]current page.north west) rectangle
      ([yshift=-\dimexpr\LLbandH+\LLgoldH\relax]current page.north east);
    \ifx\LLHeaderLogoFile\@empty\else
      \node[anchor=west,inner sep=0]
        at ([xshift=\LLbandinset,yshift=-\dimexpr\LLbandH/2\relax]current page.north west)
        {\includegraphics[height=\LLHeaderLogoHeight]{\LLHeaderLogoFile}};
    \fi
    \node[anchor=east,inner sep=0]
      at ([xshift=-\LLbandinset,yshift=-\dimexpr\LLbandH/2\relax]current page.north east)
      {\LL@headertext};
  \end{tikzpicture}%
}

% =============================================================================
% 9. Pied de page
% =============================================================================
\newsavebox{\LLpagenumbox}
\newcommand{\LLfooterband}{%
  \sbox{\LLpagenumbox}{\LLmonofont\fontsize{11}{12}\selectfont\bfseries\color{LLDeep}\thepage}%
  \begin{minipage}{\textwidth}%
    {\color{LLAccent}\rule{\textwidth}{1.6pt}}\par
    \vspace{4pt}%
    \noindent\hbox to \textwidth{%
      {\LLmonofont\fontsize{8.4}{10}\selectfont\color{LLMuted}%
        \LLtracked{\MakeUppercase{Locomotion Lab\ \textperiodcentered\ \LL@reportref}}}%
      \hfil
      \raisebox{0.5\ht\LLpagenumbox}{\tikz[baseline=0pt]{\fill[LLPrimary] (0,0) circle (2.3pt);}}%
      \hspace{6pt}%
      \usebox{\LLpagenumbox}%
    }%
  \end{minipage}%
}

\fancypagestyle{LLmain}{%
  \fancyhf{}%
  \renewcommand{\headrulewidth}{0pt}%
  \renewcommand{\footrulewidth}{0pt}%
  \fancyhead[L]{\LLheaderband}%
  \fancyfoot[L]{\LLfooterband}%
}
\pagestyle{LLmain}

% =============================================================================
% 10. Couverture v2 : une phrase, un badge de confiance, le verdict
% =============================================================================
\newcommand{\LLmetaitem}[2]{%
  {\LLmonofont\fontsize{8.5}{11}\selectfont\color{LLMuted}\LLtracked{\MakeUppercase{#1}}}\par
  \vspace{4pt}%
  {\LLsemiboldfont\fontsize{10.5}{13}\selectfont\color{LLInk}#2}%
}
% badge : capitales espacées blanches sur aplat de la couleur donnée
\newtcbox{\LL@badgebox}[1]{on line, box align=base, colback=#1, colframe=#1, boxrule=0pt,
  arc=8pt, left=8pt, right=8pt, top=3pt, bottom=3pt,
  fontupper=\LLsemiboldfont\fontsize{9}{11}\selectfont\color{LLPaper}}
\newcommand{\LLbadge}[2]{\LL@badgebox{#2}{\LLtracked{\MakeUppercase{#1}}}}

\newcommand{\makecover}{%
  \begingroup
  \thispagestyle{empty}%
  \null
  \begin{tikzpicture}[remember picture,overlay]
    \fill[LLBg] (current page.south west) rectangle (current page.north east);
    \fill[LLPrimary]
      (current page.north west) rectangle
      ([xshift=\LLcoversidebar]current page.south west);
    \fill[LLAccent]
      ([xshift=\LLcoversidebar]current page.north west) rectangle
      ([xshift=\dimexpr\LLcoversidebar+\LLcovergold\relax]current page.south west);
    \ifx\LLCoverLogoFile\@empty\else
      \node[anchor=north west,inner sep=0]
        at ([xshift=\LLcovercontentx,yshift=-\LLcoverlogoy]current page.north west)
        {\includegraphics[width=\LLcoverlogow]{\LLCoverLogoFile}};
    \fi
    \node[anchor=north west,inner sep=0]
      at ([xshift=\LLcovercontentx,yshift=-\LLcovertitley]current page.north west)
      {\begin{minipage}[t]{\LLcovertextw}
        \raggedright
        {\LLmonofont\fontsize{10}{13}\selectfont\color{LLPrimaryDark}%
          \LLtracked{\MakeUppercase{\LL@reporttype\ \textperiodcentered\ \LL@reportref}}}\par
        \vspace{14pt}
        {\LLextraboldfont\fontsize{34}{38}\selectfont\color{LLDeep}\@title\par}
        \ifx\LL@subtitle\@empty\else
          \vspace{6pt}
          {\LLmediumfont\fontsize{14}{18}\selectfont\color{LLSoft}\LL@subtitle\par}
        \fi
        \vspace{12pt}
        {\color{LLAccent}\rule{33mm}{1.5mm}}\par
        \ifx\LL@coversentence\@empty\else
          \vspace{14pt}
          {\LLlightfont\fontsize{16}{22}\selectfont\color{LLText}\LL@coversentence\par}
        \fi
        \ifx\LL@coverbadge\@empty\else
          \vspace{16pt}
          \LLbadge{\LL@coverbadge}{\LL@coverbadgecolor}%
          \ifx\LL@coververdict\@empty\else
            \hspace{8pt}{\fontsize{10.5}{14}\selectfont\color{LLSoft}\LL@coververdict}%
          \fi
          \par
        \fi
      \end{minipage}};
    \node[anchor=south west,inner sep=0]
      at ([xshift=\LLcovercontentx,yshift=\LLcovermetay]current page.south west)
      {\begin{minipage}[t]{\LLcovertextw}
        {\color{LLHairline}\rule{\LLcovertextw}{0.4pt}}\par
        \vspace{12pt}
        \noindent
        \begin{minipage}[t]{0.36\LLcovertextw}\LLmetaitem{Pour}{\LL@reportclient}\end{minipage}%
        \begin{minipage}[t]{0.26\LLcovertextw}\LLmetaitem{Date}{\@date}\end{minipage}%
        \begin{minipage}[t]{0.36\LLcovertextw}\LLmetaitem{Par}{\@author}\end{minipage}%
      \end{minipage}};
  \end{tikzpicture}%
  \clearpage
  \endgroup
}
\renewcommand{\maketitle}{\makecover}

% =============================================================================
% 11. Titres : pages du rapport v2 (sans numéro) et sections numérotées (fiches)
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
% 12. Encadrés : note, attention, exemple, honnêteté, verdict
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
\newtcolorbox[]{llhonnete}[1][Ce que ce rapport ne sait pas]{LL@boxbase,
  colback=LLSensations, borderline west={4pt}{0pt}{LLAccentInk},
  before upper={\LLboxlabel{LLAccentInk}{#1}\par\vspace{4pt}}}
% le verdict : carte brume, liseré bleu-vert
\newtcolorbox[]{llverdict}[1][Verdict]{enhanced, breakable,
  colback=LLMist, colframe=LLMistLine, boxrule=0.6pt, arc=8pt,
  left=16pt, right=16pt, top=10pt, bottom=11pt, before skip=8pt, after skip=10pt,
  before upper={\LLboxlabel{LLSlate}{#1}\par\vspace{4pt}}}

% =============================================================================
% 13. Chiffres clés et jauges
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
  \end{minipage}\par\vspace{10pt}}
% \LLqr{url} : QR vers l'annexe en ligne
\newcommand{\LLqr}[1]{\qrcode[height=22mm,level=M]{#1}}

% =============================================================================
% 14. Figures & légendes
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
% 15. Tableaux
% =============================================================================
\newcommand{\LLnum}[1]{{\LLmonofont #1}}
\newcommand{\LLpos}[1]{{\LLmonofont\color{LLSuccess}#1}}
\newcommand{\LLthead}[1]{\textcolor{LLBg}{\textbf{#1}}}
\newcommand{\LLheaderrow}{\rowcolor{LLPrimary}}
\newcommand{\LLzebra}{\rowcolors{2}{LLPaper}{LLSensations}}

% =============================================================================
% 16. Bibliographie et liens
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
