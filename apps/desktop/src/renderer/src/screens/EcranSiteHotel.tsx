import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import {
  ICONES_SERVICE,
  LIBELLE_ICONE_SERVICE,
  MAX_PHOTOS_GALERIE,
  RESEAUX_SOCIAUX,
} from "@hotel-chicago/types";
import type { IconeService, ReseauSocial, ServiceHotel, SiteHotelEditable } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { Plus, Trash2 } from "lucide-react";
import { SelecteurPhotos, nettoyerImages } from "../components/SelecteurPhotos";

export interface EcranSiteHotelProps {
  client: ClientApi;
}

const LIBELLE_RESEAU: Record<ReseauSocial, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
};

const MAX_SERVICES = 12;

/** Le patron définit ici tout ce que ses clients voient sur le site public de
 * l'hôtel (sous-domaine) : présentation, photos, services, contact, horaires. */
export function EcranSiteHotel({ client }: EcranSiteHotelProps) {
  const [site, setSite] = useState<SiteHotelEditable | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [imagesEnvoyees, setImagesEnvoyees] = useState<string[]>([]);
  const [imagesInitiales, setImagesInitiales] = useState<string[]>([]);

  useEffect(() => {
    client
      .obtenirSiteHotel()
      .then((donnees) => {
        setSite(donnees);
        setImagesInitiales([...(donnees.couvertureUrl ? [donnees.couvertureUrl] : []), ...donnees.galerie]);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  if (!site) {
    return (
      <div className="page">
        <p className="hc-text-body texte-discret">{erreur ?? "Chargement…"}</p>
      </div>
    );
  }

  function maj<K extends keyof SiteHotelEditable>(cle: K, valeur: SiteHotelEditable[K]) {
    setSite((s) => (s ? { ...s, [cle]: valeur } : s));
    setMessage(null);
  }

  function majService(index: number, champs: Partial<ServiceHotel>) {
    maj("services", site!.services.map((s, i) => (i === index ? { ...s, ...champs } : s)));
  }

  async function enregistrer() {
    if (!site) return;
    if (!site.nom.trim()) return setErreur("Le nom de l'hôtel est obligatoire.");
    if (site.services.some((s) => !s.titre.trim())) return setErreur("Chaque service doit avoir un titre.");
    setEnCours(true);
    setErreur(null);
    try {
      // Le serveur refuse les chaînes vides pour les horaires et liens : on les omet.
      const vide = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
      const reseaux = Object.fromEntries(
        RESEAUX_SOCIAUX.map((r) => [r, vide(site.reseaux[r] ?? null)]).filter(([, v]) => v)
      ) as SiteHotelEditable["reseaux"];
      const enregistre = await client.modifierSiteHotel({
        nom: site.nom.trim(),
        adresse: site.adresse ?? "",
        telephoneContact: site.telephoneContact ?? "",
        emailContact: site.emailContact ?? "",
        slogan: site.slogan ?? "",
        presentation: site.presentation ?? "",
        couvertureUrl: site.couvertureUrl,
        galerie: site.galerie,
        services: site.services.map((s) => ({ ...s, titre: s.titre.trim(), description: s.description?.trim() || undefined })),
        whatsapp: site.whatsapp ?? "",
        horaireArrivee: vide(site.horaireArrivee),
        horaireDepart: vide(site.horaireDepart),
        reception24h: site.reception24h,
        lienCarte: vide(site.lienCarte),
        reseaux,
      });
      // Images envoyées puis abandonnées avant l'enregistrement : à retirer du stockage.
      const gardees = [...(enregistre.couvertureUrl ? [enregistre.couvertureUrl] : []), ...enregistre.galerie];
      void nettoyerImages(client, [], imagesEnvoyees, gardees);
      setSite(enregistre);
      setImagesInitiales(gardees);
      setImagesEnvoyees([]);
      setMessage("Modifications enregistrées. Votre site est à jour.");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  const suiviEnvoi = (url: string) => setImagesEnvoyees((l) => [...l, url]);

  return (
    <div className="page site-hotel">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Site de l'hôtel</h1>
          <p className="hc-text-body page__sous-titre">
            Ce que vos clients voient sur <strong>{site.sousDomaine}.hotelsaver.com</strong>.
          </p>
        </div>
        <Button type="button" onClick={() => void enregistrer()} disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="hc-text-body texte-succes">
          {message}
        </p>
      )}

      <section className="carte-formulaire formulaire">
        <h2 className="hc-text-subheading">Présentation</h2>
        <label className="hc-text-label" htmlFor="site-nom">
          Nom de l'hôtel
        </label>
        <input id="site-nom" value={site.nom} onChange={(e) => maj("nom", e.target.value)} maxLength={100} />
        <label className="hc-text-label" htmlFor="site-slogan">
          Slogan
        </label>
        <input
          id="site-slogan"
          value={site.slogan ?? ""}
          onChange={(e) => maj("slogan", e.target.value)}
          maxLength={120}
          placeholder="Ex. Votre escale de détente au bord de l'eau"
        />
        <label className="hc-text-label" htmlFor="site-presentation">
          Texte de présentation
        </label>
        <textarea
          id="site-presentation"
          rows={5}
          value={site.presentation ?? ""}
          onChange={(e) => maj("presentation", e.target.value)}
          maxLength={2000}
          placeholder="Décrivez votre hôtel : situation, ambiance, ce qui le rend unique…"
        />
      </section>

      <section className="carte-formulaire formulaire">
        <h2 className="hc-text-subheading">Photos</h2>
        <SelecteurPhotos
          client={client}
          usage="couverture"
          photos={site.couvertureUrl ? [site.couvertureUrl] : []}
          max={1}
          onChange={(p) => maj("couvertureUrl", p[0] ?? null)}
          onEnvoyee={suiviEnvoi}
          libelle="Photo de couverture (grande image en haut du site)"
        />
        <SelecteurPhotos
          client={client}
          usage="galerie"
          photos={site.galerie}
          max={MAX_PHOTOS_GALERIE}
          onChange={(p) => maj("galerie", p)}
          onEnvoyee={suiviEnvoi}
          libelle="Galerie"
        />
        <p className="hc-text-caption texte-discret">
          Les photos sont automatiquement redimensionnées et allégées. Les photos de chambres se règlent dans « Chambres ».
        </p>
      </section>

      <section className="carte-formulaire formulaire">
        <h2 className="hc-text-subheading">Services proposés</h2>
        {site.services.map((s, i) => (
          <div key={i} className="ligne-service">
            <select value={s.icone} onChange={(e) => majService(i, { icone: e.target.value as IconeService })} aria-label="Icône du service">
              {ICONES_SERVICE.map((ic) => (
                <option key={ic} value={ic}>
                  {LIBELLE_ICONE_SERVICE[ic]}
                </option>
              ))}
            </select>
            <input value={s.titre} onChange={(e) => majService(i, { titre: e.target.value })} maxLength={60} placeholder="Titre (ex. Piscine)" aria-label="Titre du service" />
            <input value={s.description ?? ""} onChange={(e) => majService(i, { description: e.target.value })} maxLength={200} placeholder="Description (facultative)" aria-label="Description du service" />
            <button type="button" className="bouton-icone" onClick={() => maj("services", site.services.filter((_, k) => k !== i))} aria-label="Supprimer ce service">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {site.services.length < MAX_SERVICES && (
          <div className="puces" role="group" aria-label="Ajouter un service">
            {(["restaurant", "piscine", "wifi", "parking", "navette", "petit-dejeuner", "autre"] as IconeService[]).map((ic) => (
              <button
                key={ic}
                type="button"
                className="puce"
                onClick={() => maj("services", [...site.services, { icone: ic, titre: ic === "autre" ? "" : LIBELLE_ICONE_SERVICE[ic] }])}
              >
                <Plus size={12} aria-hidden="true" /> {LIBELLE_ICONE_SERVICE[ic]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="carte-formulaire formulaire">
        <h2 className="hc-text-subheading">Contact et horaires</h2>
        <label className="hc-text-label" htmlFor="site-adresse">
          Adresse
        </label>
        <input id="site-adresse" value={site.adresse ?? ""} onChange={(e) => maj("adresse", e.target.value)} maxLength={200} />
        <label className="hc-text-label" htmlFor="site-tel">
          Téléphone
        </label>
        <input id="site-tel" value={site.telephoneContact ?? ""} onChange={(e) => maj("telephoneContact", e.target.value)} maxLength={40} placeholder="+243 …" />
        <label className="hc-text-label" htmlFor="site-wa">
          WhatsApp
        </label>
        <input id="site-wa" value={site.whatsapp ?? ""} onChange={(e) => maj("whatsapp", e.target.value)} maxLength={30} placeholder="+243 … (avec l'indicatif du pays)" />
        <label className="hc-text-label" htmlFor="site-email">
          E-mail de contact
        </label>
        <input id="site-email" type="email" value={site.emailContact ?? ""} onChange={(e) => maj("emailContact", e.target.value)} maxLength={120} />
        <label className="hc-text-label" htmlFor="site-carte">
          Lien Google Maps (facultatif)
        </label>
        <input id="site-carte" value={site.lienCarte ?? ""} onChange={(e) => maj("lienCarte", e.target.value)} placeholder="https://maps.google.com/…" />
        <div className="ligne-horaires">
          <div>
            <label className="hc-text-label" htmlFor="site-arrivee">
              Arrivée dès
            </label>
            <input id="site-arrivee" type="time" value={site.horaireArrivee ?? ""} onChange={(e) => maj("horaireArrivee", e.target.value)} />
          </div>
          <div>
            <label className="hc-text-label" htmlFor="site-depart">
              Départ avant
            </label>
            <input id="site-depart" type="time" value={site.horaireDepart ?? ""} onChange={(e) => maj("horaireDepart", e.target.value)} />
          </div>
        </div>
        <label className="case-a-cocher">
          <input type="checkbox" checked={site.reception24h} onChange={(e) => maj("reception24h", e.target.checked)} />
          Réception ouverte 24 h/24
        </label>
      </section>

      <section className="carte-formulaire formulaire">
        <h2 className="hc-text-subheading">Réseaux sociaux</h2>
        {RESEAUX_SOCIAUX.map((r) => (
          <React.Fragment key={r}>
            <label className="hc-text-label" htmlFor={`site-reseau-${r}`}>
              {LIBELLE_RESEAU[r]}
            </label>
            <input
              id={`site-reseau-${r}`}
              value={site.reseaux[r] ?? ""}
              onChange={(e) => maj("reseaux", { ...site.reseaux, [r]: e.target.value })}
              placeholder="https://…"
            />
          </React.Fragment>
        ))}
      </section>

      <div>
        <Button type="button" onClick={() => void enregistrer()} disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer les modifications"}
        </Button>
      </div>
    </div>
  );
}
