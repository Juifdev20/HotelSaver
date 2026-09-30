import * as React from "react";
import { Hero } from "./accueil/Hero";
import { BlocsDetail, Chiffres, Etapes, Fonctionnalites } from "./accueil/Sections";
import { SectionApplication } from "./accueil/Stores";
import { HotelsPartenaires } from "./accueil/HotelsPartenaires";
import { Tarifs } from "./accueil/Tarifs";
import { Faq } from "./accueil/Faq";
import { AppelFinal, PiedPage } from "./accueil/PiedPage";

/** Page d'accueil marketing. Le contenu éditorial vit dans accueil/donnees.ts. */
export function EcranAccueil() {
  return (
    <main className="accueil">
      <Hero />
      <Chiffres />
      <Fonctionnalites />
      <BlocsDetail />
      <Etapes />
      <SectionApplication />
      <HotelsPartenaires />
      <Tarifs />
      <Faq />
      <AppelFinal />
      <PiedPage />
    </main>
  );
}
