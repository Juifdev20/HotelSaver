import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { GuideDisponible } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { BookOpen, Download } from "lucide-react";

export interface EcranGuidesProps {
  client: ClientApi;
}

const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

/**
 * Guides d'utilisation PDF (20/10/2026) : le serveur ne propose que ceux du rôle (le patron tous, le personnel celui de son poste).
 * Chaque ouverture demande un lien signé de 5 minutes ; il s'ouvre hors de la fenêtre (setWindowOpenHandler → shell.openExternal).
 */
export function EcranGuides({ client }: EcranGuidesProps) {
  const [guides, setGuides] = useState<GuideDisponible[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    client
      .listerGuides()
      .then((liste) => {
        setGuides(liste);
        setErreur(null);
      })
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : "Les guides n'ont pas pu être chargés."));
  }, [client]);

  useEffect(charger, [charger]);

  async function ouvrir(g: GuideDisponible) {
    setEnCours(g.guide);
    setErreur(null);
    try {
      const { url } = await client.lienGuide(g.guide);
      window.open(url, "_blank");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le guide n'a pas pu être ouvert.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Guide d'utilisation</h1>
          <p className="hc-text-body page__sous-titre">Le guide pas à pas de HotelSaver, en PDF. Une connexion internet est nécessaire pour l'ouvrir.</p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {guides === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}
      {guides && guides.length === 0 && (
        <div className="etat-vide">
          <BookOpen size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun guide n'est encore publié pour votre compte</p>
          <p className="hc-text-body texte-discret">
            Le guide de votre poste apparaîtra ici dès qu'il sera publié. En attendant, écrivez-nous sur WhatsApp : nous vous répondons vite.
          </p>
        </div>
      )}

      {guides && guides.length > 0 && (
        <div className="page__colonnes">
          {guides.map((g) => (
            <section key={g.guide} className="carte-simple">
              <div className="carte-simple__entete carte-simple__entete--titre">
                <BookOpen size={20} aria-hidden="true" />
                <h2 className="hc-text-subheading">{g.libelle}</h2>
              </div>
              <p className="hc-text-body texte-discret">
                {g.edition ?? `Version ${g.version}`} · PDF, {mo(g.taille)}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button type="button" onClick={() => void ouvrir(g)} disabled={enCours !== null}>
                  <Download size={16} aria-hidden="true" /> {enCours === g.guide ? "Ouverture…" : "Ouvrir le guide"}
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
