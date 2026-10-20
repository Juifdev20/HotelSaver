import * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { ClientSuperAdmin, VersionGuideAdmin } from "@hotel-chicago/api-client";
import { EnteteApp, type Onglet } from "./EnteteApp";

export interface EcranGuidesProps {
  client: ClientSuperAdmin;
  onChangerOnglet: (onglet: Onglet) => void;
  onDeconnexion: () => void;
}

type TypeGuide = VersionGuideAdmin["guide"];

const GUIDES: { id: TypeGuide; libelle: string; lecteurs: string }[] = [
  { id: "COMPLET", libelle: "Guide complet", lecteurs: "Patron" },
  { id: "PATRON", libelle: "Guide du patron", lecteurs: "Patron" },
  { id: "RECEPTION", libelle: "Guide du réceptionniste", lecteurs: "Patron et réception" },
  { id: "CAFETERIA", libelle: "Guide de la cafétaria", lecteurs: "Patron et cafétaria" },
];

const TAILLE_MAX = 50 * 1024 * 1024;
const formatDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lubumbashi" });
const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

/**
 * Guides d'utilisation PDF (20/10/2026) : vous déposez le PDF fabriqué (docs/guide) ; chaque dépôt crée une nouvelle version,
 * aussitôt proposée aux comptes concernés (site, téléphone, ordinateur). Le fichier reste privé : les utilisateurs l'ouvrent
 * par un lien de 5 minutes, après connexion.
 */
export function EcranGuides({ client, onChangerOnglet, onDeconnexion }: EcranGuidesProps) {
  const [versions, setVersions] = useState<VersionGuideAdmin[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [fichiers, setFichiers] = useState<Partial<Record<TypeGuide, File>>>({});
  const [edition, setEdition] = useState("");
  const [enCours, setEnCours] = useState<TypeGuide | null>(null);

  async function charger() {
    setChargement(true);
    setErreur(null);
    try {
      setVersions(await client.listerGuides());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choisir(guide: TypeGuide, fichier: File | undefined) {
    setSucces(null);
    setErreur(null);
    if (fichier && (fichier.type !== "application/pdf" || fichier.size > TAILLE_MAX)) {
      setErreur(fichier.size > TAILLE_MAX ? `Fichier trop lourd (${mo(fichier.size)}) : 50 Mo au plus.` : "Choisissez un fichier PDF.");
      return;
    }
    setFichiers((f) => ({ ...f, [guide]: fichier }));
  }

  async function publier(guide: TypeGuide) {
    const fichier = fichiers[guide];
    if (!fichier) return;
    setEnCours(guide);
    setErreur(null);
    setSucces(null);
    try {
      const v = await client.publierGuide(guide, fichier, edition.trim() || undefined);
      setFichiers((f) => ({ ...f, [guide]: undefined }));
      setSucces(`${GUIDES.find((g) => g.id === guide)?.libelle} : version ${v.version} publiée.`);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setEnCours(null);
    }
  }

  async function ouvrir(id: string) {
    try {
      const { url } = await client.lienGuide(id);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Ouverture impossible.");
    }
  }

  return (
    <div className="page">
      <EnteteApp titre="Guides d'utilisation" onglet="guides" onChangerOnglet={onChangerOnglet}>
        <Button variant="secondary" onClick={onDeconnexion}>
          Déconnexion
        </Button>
      </EnteteApp>

      <aside className="encart" aria-label="Aide">
        <p>
          Déposez le PDF fabriqué (<code>node docs/guide/construire.mjs</code>). Chaque dépôt crée une nouvelle version, proposée aussitôt aux
          comptes concernés sur le site, le téléphone et l'ordinateur. Le fichier reste privé : il ne s'ouvre qu'après connexion, par un lien
          valable 5 minutes.
        </p>
      </aside>

      {chargement && (
        <p role="status" className="chargement">
          Chargement…
        </p>
      )}
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {succes && (
        <p className="succes" role="status">
          {succes}
        </p>
      )}

      {!chargement && (
        <section className="carte carte--large guides">
          <label className="guides__edition">
            Édition affichée aux utilisateurs (facultatif)
            <input value={edition} maxLength={80} placeholder="Ex. Édition 1.0 — octobre 2026" onChange={(e) => setEdition(e.target.value)} />
          </label>
          <ul className="guides__liste">
            {GUIDES.map((g) => {
              const derniere = versions.find((v) => v.guide === g.id);
              const anciennes = versions.filter((v) => v.guide === g.id).length;
              const fichier = fichiers[g.id];
              return (
                <li key={g.id} className="guides__ligne">
                  <div className="guides__info">
                    <strong>{g.libelle}</strong>
                    <span>Lu par : {g.lecteurs}</span>
                    <span>
                      {derniere
                        ? `Version ${derniere.version}${derniere.edition ? ` · ${derniere.edition}` : ""} · ${mo(derniere.taille)} · ${formatDate.format(new Date(derniere.publieLe))}${anciennes > 1 ? ` · ${anciennes} versions` : ""}`
                        : "Pas encore publié"}
                    </span>
                  </div>
                  <div className="guides__actions">
                    {derniere && (
                      <Button variant="secondary" onClick={() => void ouvrir(derniere.id)}>
                        Ouvrir
                      </Button>
                    )}
                    <label className="guides__fichier">
                      <input type="file" accept="application/pdf" disabled={enCours !== null} onChange={(e) => choisir(g.id, e.target.files?.[0])} />
                      {fichier ? `${fichier.name} (${mo(fichier.size)})` : "Choisir le PDF…"}
                    </label>
                    <Button disabled={!fichier || enCours !== null} onClick={() => void publier(g.id)}>
                      {enCours === g.id ? "Envoi…" : "Publier"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
