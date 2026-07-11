import "./globals.css";
import type { ReactNode } from "react";
import { fontVariables } from "@locomotionlab/ui/fonts";

export const metadata = {
  title: "Locomotion Lab — Template",
  description: "Gabarit d'app Next + TS à la charte Locomotion Lab.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${fontVariables} font-sans`}>
        {children}
      </body>
    </html>
  );
}
