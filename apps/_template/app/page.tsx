import { PageShell, Button } from "@locomotionlab/ui";

export default function Home() {
  return (
    <PageShell>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">
        Locomotion Lab
      </p>

      <h1 className="font-heading text-4xl font-bold text-brand-deep sm:text-5xl">
        Gabarit d&apos;application
      </h1>

      <p className="max-w-prose text-lg text-brand-text/80">
        Cette page est rendue avec la charte partagée{" "}
        <code className="rounded bg-brand-grid px-1 py-0.5 text-brand-deep-dark">
          @locomotionlab/ui
        </code>{" "}
        : tokens <code>@theme</code>, polices Ubuntu + Lora et primitives du design
        system. Duplique <code>apps/_template</code> pour démarrer une nouvelle app.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button>Bouton primaire</Button>
        <Button variant="secondary">Secondaire</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </PageShell>
  );
}
