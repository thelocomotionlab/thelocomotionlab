// components/RegistreScroller.jsx
//
// Zone défilante du « registre des articles » de l'accueil : fenêtre de
// ~3 lignes avec accroche snap, chevron indicateur quand il reste des
// lignes à voir. Les lignes (rendues côté serveur) arrivent en children.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScrollCue from "@/components/ScrollCue";

export default function RegistreScroller({ children }) {
  const ref = useRef(null);
  const [canDown, setCanDown] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanDown(el.scrollTop < el.scrollHeight - el.clientHeight - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  return (
    <div>
      <div ref={ref} className="no-scrollbar max-h-[264px] snap-y overflow-y-auto">
        {children}
      </div>
      {canDown && (
        <ScrollCue
          className="mt-2"
          label="Faire défiler les articles"
          onClick={() => ref.current?.scrollBy({ top: 80, behavior: "smooth" })}
        />
      )}
    </div>
  );
}
