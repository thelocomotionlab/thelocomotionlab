// components/CarteCarnet.jsx
//
// Le carnet à l'index : une carte pour l'année (sa photo, son intention, le
// nombre de notes, les années fermées à côté) et, à droite, les dernières notes
// en registre — la date, le titre, les atomes que la note a fait naître, ses
// premiers mots. Un carnet se lit par ses notes, pas par sa couverture.

import Link from "next/link";
import Image from "next/image";
import CardMeta from "@/components/CardMeta";

function NoteLigne({ note }) {
  return (
    <li>
      <div className="ll-note-row">
        <span className="ll-registre-d">{note.date}</span>
        <div className="min-w-0">
          <p className="ll-note-t">
            <Link href={note.href} className="hover:underline">
              {note.title}
            </Link>
            {note.liens?.length ? (
              <span className="ll-note-liens">
                →{" "}
                {note.liens.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 ? " · " : ""}
                    <Link href={l.href} className="hover:underline">
                      {l.label}
                    </Link>
                  </span>
                ))}
              </span>
            ) : null}
          </p>
          {note.resume ? <p className="ll-note-b">{note.resume}</p> : null}
        </div>
      </div>
    </li>
  );
}

export default function CarteCarnet({ carnet, notes = [] }) {
  return (
    <div className="ll-carnet">
      <Link
        href={carnet.href}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-shadow hover:shadow-lg"
      >
        {carnet.cover ? (
          <div className="relative w-full aspect-[16/10]">
            <Image
              src={carnet.cover}
              alt={`Illustration : ${carnet.title}`}
              fill
              className="object-cover"
              sizes="(min-width: 800px) 300px, 100vw"
              loading="lazy"
            />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
          <CardMeta kind={carnet.kindLabel} detail={carnet.detail} />
          <h3 className="text-[17px] font-semibold leading-tight text-brand-deep group-hover:underline">
            {carnet.title}
          </h3>
          {carnet.resume ? (
            <p className="mt-0.5 font-lora text-[14.5px] italic leading-[1.45] text-gray-600">
              {carnet.resume}
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap justify-between gap-3 pt-2.5 text-xs text-gray-500">
            <span>{carnet.nbNotes} note{carnet.nbNotes > 1 ? "s" : ""}</span>
            {carnet.autres?.length ? (
              <span>
                {carnet.autres.map((a) => a.title).join(" · ")} →
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      {/* Les liens vers les autres années vivent hors de la carte, qui est
          elle-même un lien : un lien dans un lien n'est pas du HTML. */}
      <div>
        <ul className="ll-registre ll-registre--notes">
          {notes.map((note) => (
            <NoteLigne key={`${note.date}-${note.title}`} note={note} />
          ))}
        </ul>
        {carnet.autres?.length ? (
          <p className="mt-3 text-xs text-gray-500">
            {carnet.autres.map((a, i) => (
              <span key={a.href}>
                {i > 0 ? " · " : ""}
                <Link href={a.href} className="font-semibold text-brand-accent-ink hover:underline">
                  {a.title} →
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
