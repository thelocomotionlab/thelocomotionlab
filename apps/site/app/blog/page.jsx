// app/blog/page.jsx
//
// L'INDEX DU BLOG : un registre chronologique, sans cover.
//
// Tout ce qui est narratif et daté y figure — les billets du carnet et les
// récits d'aventure. Les covers restent sur les pages de destination ; ici,
// c'est le fil du temps qui porte la lecture.

import { entrees } from "@/lib/blog";
import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";
import RegistreDuBlog from "@/components/contenu/RegistreDuBlog";

export const metadata = {
  title: "Blog",
  description: "Le carnet de bord du Locomotion Lab, au jour le jour.",
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 md:px-8">
      <RegistreDuBlog
        entrees={entrees()}
        enTete={<EnTeteDIndex titre="Blog" accroche="Le carnet de bord, au jour le jour." />}
      />
    </div>
  );
}
