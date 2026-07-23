// components/live/MessageCard.jsx
//
// « Laisse un mot à Valentin » : message privé transmis DIRECTEMENT au Telegram
// de Valentin par le service live-journal — rien n'est public, rien n'est
// stocké. On peut joindre une PHOTO ou une VIDÉO (fichier) ou enregistrer un
// VOCAL (micro du navigateur). Sans pièce jointe → envoi texte JSON ; avec →
// envoi multipart (champ `fichier`). Honeypot `website` invisible.

"use client";

import { brandColors } from "@locomotionlab/ui";
import { Image as ImageIcon, Mic, Send, Square, Video, X } from "lucide-react";

import { useRef, useState } from "react";

import { journalApiBase } from "@/lib/liveConfig";

const CONFIRMATION = "Remis. Il le lira ce soir au bivouac.";
const MAX_MO = 20;
const MAX_BYTES = MAX_MO * 1024 * 1024;
const REC_MAX_SECONDS = 300; // garde-fou : 5 min d'enregistrement max

function humanSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`;
}
function mmss(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MessageCard() {
  const [message, setMessage] = useState("");
  const [prenom, setPrenom] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [file, setFile] = useState(null); // { file, kind } | null
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recTimerRef = useRef(null);

  function fail(msg) {
    setErrorMsg(msg);
    setStatus("error");
  }

  function attach(f, kind) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      fail(`Fichier trop lourd (max ${MAX_MO} Mo).`);
      return;
    }
    setErrorMsg("");
    setStatus("idle");
    setFile({ file: f, kind });
  }

  function onPick(kind) {
    return (e) => {
      attach(e.target.files?.[0], kind);
      e.target.value = ""; // permet de re-choisir le même fichier
    };
  }

  function removeFile() {
    setFile(null);
    setErrorMsg("");
  }

  async function toggleRecord() {
    if (recording) {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      return;
    }
    if (file) removeFile();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recTimerRef.current);
        setRecording(false);
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        attach(new File([blob], `vocal.${ext}`, { type }), "vocal");
      };
      recorderRef.current = rec;
      rec.start();
      setErrorMsg("");
      setStatus("idle");
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecSeconds((s) => {
          if (s + 1 >= REC_MAX_SECONDS) {
            if (rec.state !== "inactive") rec.stop();
            return s + 1;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      fail("Micro indisponible — autorise l'accès au micro, ou joins un fichier.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (status === "sending" || recording) return;
    const hasText = message.trim().length > 0;
    if (!hasText && !file) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      let res;
      if (file) {
        const fd = new FormData();
        fd.append("message", message.trim());
        fd.append("prenom", prenom.trim());
        fd.append("website", website);
        fd.append("fichier", file.file, file.file.name);
        res = await fetch(`${journalApiBase}/journal/message`, { method: "POST", body: fd });
      } else {
        res = await fetch(`${journalApiBase}/journal/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim(), prenom: prenom.trim(), website }),
        });
      }
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setStatus("sent");
        setMessage("");
        setFile(null);
      } else if (res.status === 413) {
        fail(`Pièce jointe trop lourde (max ${MAX_MO} Mo).`);
      } else if (body?.error === "type_non_supporte") {
        fail("Type de fichier non accepté (photo, vidéo ou vocal uniquement).");
      } else {
        fail("Le message n'est pas parti — réessaie dans un instant.");
      }
    } catch {
      fail("Le message n'est pas parti — réessaie dans un instant.");
    }
  }

  const fieldClass =
    "border border-brand-text/15 bg-white px-[15px] py-[11px] font-heading text-[13px] text-brand-text outline-none transition placeholder:text-brand-text/40 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/40";
  const attachBtn =
    "inline-flex items-center gap-1.5 rounded-full border border-brand-text/15 bg-white px-3 py-2 font-heading text-[12px] text-brand-text/75 transition hover:border-brand-accent hover:text-brand-text disabled:opacity-50";

  const canSend = (message.trim().length > 0 || file) && !recording && status !== "sending";

  return (
    <section className="rounded-[18px] border border-brand-primary/30 bg-brand-primary/12 px-[18px] py-5 lg:px-5 lg:py-4">
      <h2 className="m-0 font-heading text-base font-bold text-brand-text lg:text-[14.5px]">
        Laisse un mot à Valentin
      </h2>

      {status === "sent" ? (
        <p className="mt-3 font-heading text-sm font-bold text-brand-text" role="status">
          {CONFIRMATION}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ton message… (ou joins juste une photo / un vocal)"
            maxLength={1000}
            className={`min-h-[76px] w-full resize-y rounded-[20px] ${fieldClass} text-sm`}
          />

          {/* Pièces jointes : photo / vidéo (fichier), vocal (micro). */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className={attachBtn}
              disabled={recording}
            >
              <ImageIcon size={14} aria-hidden="true" /> Photo
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className={attachBtn}
              disabled={recording}
            >
              <Video size={14} aria-hidden="true" /> Vidéo
            </button>
            <button
              type="button"
              onClick={toggleRecord}
              className={`${attachBtn} ${recording ? "!border-brand-deep !text-brand-deep" : ""}`}
              aria-pressed={recording}
            >
              {recording ? (
                <>
                  <Square size={12} aria-hidden="true" /> Arrêter ({mmss(recSeconds)})
                </>
              ) : (
                <>
                  <Mic size={14} aria-hidden="true" /> Vocal
                </>
              )}
            </button>
            {/* Pas de `capture` : le visiteur choisit galerie OU appareil photo. */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={onPick("photo")}
              className="hidden"
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={onPick("video")}
              className="hidden"
            />
          </div>

          {/* Aperçu de la pièce jointe sélectionnée. */}
          {file && (
            <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-brand-primary/40 bg-white px-3 py-1.5">
              {file.kind === "photo" ? (
                <ImageIcon size={14} className="flex-none text-brand-primary-dark" aria-hidden="true" />
              ) : file.kind === "video" ? (
                <Video size={14} className="flex-none text-brand-primary-dark" aria-hidden="true" />
              ) : (
                <Mic size={14} className="flex-none text-brand-primary-dark" aria-hidden="true" />
              )}
              <span className="truncate font-heading text-[12px] text-brand-text/80">
                {file.file.name} · {humanSize(file.file.size)}
              </span>
              <button
                type="button"
                onClick={removeFile}
                aria-label="Retirer la pièce jointe"
                className="flex-none rounded-full p-0.5 text-brand-text/50 hover:text-brand-deep"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              maxLength={50}
              className={`w-full rounded-full sm:w-[200px] ${fieldClass}`}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="flex flex-none cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-brand-accent px-6 py-[11px] font-heading text-[13px] font-semibold text-white transition hover:bg-brand-accent-dark disabled:opacity-60"
            >
              {status === "sending" ? "Envoi…" : <>Envoyer <Send size={15} aria-hidden="true" /></>}
            </button>
          </div>

          {/* Honeypot — hors écran, hors tabulation, ignoré des humains. */}
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />

          {status === "error" && errorMsg && (
            <p className="mt-2 font-heading text-xs font-medium text-brand-deep" role="status">
              {errorMsg}
            </p>
          )}
        </form>
      )}

      <p className="mt-3 flex items-start gap-[7px] font-heading text-[11px] leading-normal text-brand-text/65 lg:text-[10.5px]">
        <svg width="12" height="14" viewBox="0 0 12 14" className="mt-px flex-none" aria-hidden="true">
          <rect x="1" y="6" width="10" height="7" rx="2" fill="none" stroke={brandColors.primaryDark} strokeWidth="1.3" />
          <path d="M3.5 6 V4 a2.5 2.5 0 0 1 5 0 V6" fill="none" stroke={brandColors.primaryDark} strokeWidth="1.3" />
        </svg>
        <span>Message privé — remis à Valentin le soir au bivouac. Rien n&rsquo;est publié.</span>
      </p>
    </section>
  );
}
