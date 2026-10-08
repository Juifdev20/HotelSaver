import * as React from "react";
import { useMemo, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, TypeProduit, type CompteCafeteria, type MenuDuJour, type Produit } from "@hotel-chicago/types";
import { normaliserCodeBarres, trouverProduitParCode } from "@hotel-chicago/receipts";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { Camera, Minus, Plus, ScanBarcode, Search, Star, X } from "lucide-react";
import { ScannerWebcam } from "../components/ScannerWebcam";
import { bip, useDouchette } from "../components/scan";

export interface EcranAjoutConsommationProps {
  client: ClientApi;
  compte: CompteCafeteria;
  personne: CompteCafeteria["sousComptes"][number];
  produits: Produit[];
  /** Quantités ajoutées aujourd'hui par produit (les plus demandés passent en tête). */
  populaires: Map<string, number>;
  /** Menu du jour actif, null si non défini. */
  menuDuJour?: MenuDuJour | null;
  onRetour: () => void;
  /** Panier validé : l'écran du compte se recharge et revient à la vue d'ensemble. */
  onAjoute: () => void;
  /** « Vente rapide » : la webcam s'ouvre dès l'arrivée (la douchette marche toujours). */
  scannerAuDemarrage?: boolean;
}

const NB_POPULAIRES = 6;
const TOUTES = "Tous";

/** « Fanta » = « fanta » = « Fänta » : recherche insensible à la casse et aux accents. */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Niveau 2 du compte : ajouter des consommations À UNE PERSONNE. Recherche, filtre par catégorie,
 * produits les plus demandés du jour en tête, plusieurs produits en un seul panier validé d'un coup.
 * Même logique que l'écran mobile (apps/mobile/src/ecrans/EcranAjoutConsommation.tsx), en ligne
 * directe : chaque ligne appelle l'API, qui contrôle le stock.
 */
export function EcranAjoutConsommation({
  client,
  compte,
  personne,
  produits,
  populaires,
  menuDuJour,
  onRetour,
  onAjoute,
  scannerAuDemarrage = false,
}: EcranAjoutConsommationProps) {
  const [recherche, setRecherche] = useState("");
  // Scan (08/10/2026) : douchette (écoute globale du clavier), webcam, code inconnu à associer.
  const [webcamOuverte, setWebcamOuverte] = useState(scannerAuDemarrage);
  const [infoScan, setInfoScan] = useState<string | null>(null);
  const [codeInconnu, setCodeInconnu] = useState<string | null>(null);
  const [produitAssocie, setProduitAssocie] = useState("");
  const [codesAssocies, setCodesAssocies] = useState<Record<string, string>>({});
  const [categorie, setCategorie] = useState(TOUTES);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const categories = useMemo(
    () => [TOUTES, ...Array.from(new Set(produits.map((p) => p.categorie.trim()).filter(Boolean))).sort()],
    [produits]
  );

  const { populairesAffiches, autres } = useMemo(() => {
    const terme = normaliser(recherche);
    const parPopularite = (a: Produit, b: Produit) =>
      (populaires.get(b.id) ?? 0) - (populaires.get(a.id) ?? 0) || a.nom.localeCompare(b.nom, "fr");
    const filtres = produits
      .filter((p) => (categorie === TOUTES || p.categorie.trim() === categorie) && (!terme || normaliser(p.nom).includes(terme)))
      .sort(parPopularite);
    if (terme) return { populairesAffiches: [] as Produit[], autres: filtres };
    const top = filtres.filter((p) => (populaires.get(p.id) ?? 0) > 0).slice(0, NB_POPULAIRES);
    const idsTop = new Set(top.map((p) => p.id));
    return { populairesAffiches: top, autres: filtres.filter((p) => !idsTop.has(p.id)) };
  }, [produits, populaires, recherche, categorie]);

  const produitsParId = useMemo(() => new Map(produits.map((p) => [p.id, p])), [produits]);
  const entreesPanier = Object.entries(panier)
    .map(([id, quantite]) => ({ produit: produitsParId.get(id), quantite }))
    .filter((e): e is { produit: Produit; quantite: number } => e.produit !== undefined);
  const articles = entreesPanier.reduce((n, e) => n + e.quantite, 0);
  const totaux = entreesPanier.reduce(
    (acc, { produit, quantite }) => {
      const montant = Number(produit.prix) * quantite;
      return produit.devise === Devise.USD ? { ...acc, usd: acc.usd + montant } : { ...acc, cdf: acc.cdf + montant };
    },
    { usd: 0, cdf: 0 }
  );

  function changer(produit: Produit, delta: number) {
    const stock = Number(produit.stockActuel);
    setErreur(null);
    setPanier((courant) => {
      const quantite = Math.max(0, (courant[produit.id] ?? 0) + delta);
      // Jamais plus que le stock connu (le serveur recontrôle de toute façon).
      if (delta > 0 && stock > 0 && quantite > stock) return courant;
      const suivant = { ...courant };
      if (quantite === 0) delete suivant[produit.id];
      else suivant[produit.id] = quantite;
      return suivant;
    });
  }

  const panierRef = useRef(panier);
  panierRef.current = panier;

  /** Code lu (douchette, webcam ou recherche) → l'article part au panier, sans appel réseau. */
  function ajouterParCode(brut: string): string {
    const code = normaliserCodeBarres(brut);
    if (!code) return "";
    const idAssocie = codesAssocies[code];
    const produit = (idAssocie && produitsParId.get(idAssocie)) || trouverProduitParCode(produits, code);
    if (!produit) {
      bip("erreur");
      setCodeInconnu(code);
      const message = `Code ${code} inconnu`;
      setInfoScan(message);
      return message;
    }
    const stock = Number(produit.stockActuel);
    const deja = panierRef.current[produit.id] ?? 0;
    if (produit.typeProduit !== TypeProduit.PLAT && deja + 1 > stock) {
      bip("erreur");
      const message = stock <= 0 ? `${produit.nom} : épuisé` : `${produit.nom} : plus que ${stock} en stock`;
      setInfoScan(message);
      return message;
    }
    changer(produit, 1);
    bip("ok");
    setCodeInconnu(null);
    const message = `${produit.nom} ajouté (${deja + 1})`;
    setInfoScan(message);
    return message;
  }

  useDouchette(ajouterParCode, !webcamOuverte);

  /** Associe le code inconnu au produit choisi (route ouverte à la cafétaria), puis l'ajoute. */
  async function associerCode() {
    const code = codeInconnu;
    const produit = produitsParId.get(produitAssocie);
    if (!code || !produit) return;
    try {
      await client.associerCodeBarres(produit.id, code);
      setCodesAssocies((courant) => ({ ...courant, [code]: produit.id }));
      setCodeInconnu(null);
      setProduitAssocie("");
      changer(produit, 1);
      bip("ok");
      setInfoScan(`Code associé à ${produit.nom} — ajouté à la sélection.`);
    } catch (e) {
      setInfoScan(e instanceof Error ? e.message : "Association impossible.");
    }
  }

  function retour() {
    if (articles > 0 && !window.confirm("Abandonner la sélection ? Les produits choisis ne seront pas ajoutés.")) return;
    onRetour();
  }

  async function valider() {
    if (articles === 0 || enEnvoi) return;
    setEnEnvoi(true);
    setErreur(null);
    const restants = { ...panier };
    try {
      for (const { produit, quantite } of entreesPanier) {
        await client.ajouterLigne(compte.id, { sousCompteId: personne.id, produitId: produit.id, quantite });
        delete restants[produit.id];
      }
      onAjoute();
    } catch (e) {
      // Échec partiel : on garde dans le panier ce qui n'a PAS été ajouté, pour ne rien dupliquer au nouvel essai.
      setPanier(restants);
      setErreur(
        `${e instanceof Error ? e.message : "Erreur inconnue."} — ${Object.keys(restants).length} produit(s) non ajouté(s), les autres l'ont été.`
      );
      setEnEnvoi(false);
    }
  }

  const libelleTotal = [
    totaux.usd > 0 ? formatMontant(totaux.usd, Devise.USD) : null,
    totaux.cdf > 0 ? formatMontant(totaux.cdf, Devise.CDF) : null,
  ]
    .filter(Boolean)
    .join(" + ");

  function carteProduit(p: Produit) {
    const quantite = panier[p.id] ?? 0;
    const stock = Number(p.stockActuel);
    const epuise = stock <= 0;
    const bas = !epuise && stock <= Number(p.seuilAlerte);
    return (
      <div key={p.id} className={`produit-carte${quantite > 0 ? " produit-carte--choisi" : ""}${epuise ? " produit-carte--epuise" : ""}`}>
        <div className="produit-carte__infos">
          <p className="hc-text-body-strong">{p.nom}</p>
          <p className="hc-text-caption texte-discret">
            {formatMontant(p.prix, p.devise)}
            {epuise && <span className="produit-carte__etat produit-carte__etat--epuise"> · Épuisé</span>}
            {bas && <span className="produit-carte__etat produit-carte__etat--bas"> · Stock bas ({stock})</span>}
          </p>
        </div>
        {!epuise &&
          (quantite === 0 ? (
            <button type="button" className="produit-carte__ajout" onClick={() => changer(p, 1)} aria-label={`Ajouter ${p.nom}`}>
              <Plus size={18} aria-hidden="true" />
            </button>
          ) : (
            <div className="produit-carte__stepper">
              <button type="button" onClick={() => changer(p, -1)} aria-label={`Retirer ${p.nom}`}>
                <Minus size={16} aria-hidden="true" />
              </button>
              <span>{quantite}</span>
              <button type="button" onClick={() => changer(p, 1)} aria-label={`Ajouter ${p.nom}`}>
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Ajouter pour {personne.nom}</h1>
          <p className="hc-text-body page__sous-titre">{compte.tableOuNom}</p>
        </div>
        <Button type="button" variant="secondary" onClick={retour}>
          Retour
        </Button>
      </header>

      <div className="ajout-conso">
        <div className="ajout-conso__catalogue">
          <div className="barre-filtres">
            <label className="champ-recherche">
              <Search size={18} aria-hidden="true" />
              <span className="visuellement-cache">Rechercher un produit</span>
              <input
                type="search"
                placeholder="Rechercher un produit…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                onKeyDown={(e) => {
                  // Code saisi ou collé à la main puis Entrée : ajout direct s'il est connu.
                  if (e.key === "Enter" && (trouverProduitParCode(produits, recherche) || codesAssocies[normaliserCodeBarres(recherche)])) {
                    ajouterParCode(recherche);
                    setRecherche("");
                  }
                }}
                autoFocus
              />
              {recherche && (
                <button type="button" className="champ-recherche__effacer" onClick={() => setRecherche("")} aria-label="Effacer la recherche">
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </label>
            <Button type="button" variant="secondary" onClick={() => setWebcamOuverte(true)}>
              <Camera size={16} aria-hidden="true" /> Scanner
            </Button>
          </div>

          {infoScan && (
            <div
              className="carte-formulaire"
              role="status"
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderColor: codeInconnu ? "var(--hc-danger)" : "var(--hc-success)" }}
            >
              <ScanBarcode size={16} aria-hidden="true" />
              <span className="hc-text-body" style={{ flex: 1 }}>
                {infoScan}
              </span>
              {codeInconnu && (
                <>
                  <select value={produitAssocie} onChange={(e) => setProduitAssocie(e.target.value)} aria-label="Produit correspondant">
                    <option value="">Associer à un produit…</option>
                    {produits
                      .filter((p) => p.typeProduit !== TypeProduit.PLAT && !p.codeBarres)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                  </select>
                  <Button type="button" onClick={associerCode} disabled={!produitAssocie}>
                    Associer
                  </Button>
                </>
              )}
              <button
                type="button"
                className="champ-recherche__effacer"
                onClick={() => {
                  setInfoScan(null);
                  setCodeInconnu(null);
                }}
                aria-label="Fermer le message"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {categories.length > 2 && (
            <div className="puces" role="group" aria-label="Catégorie">
              {categories.map((c) => (
                <button key={c} type="button" className="puce" aria-pressed={categorie === c} onClick={() => setCategorie(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {menuDuJour && menuDuJour.items.length > 0 && (
            <div className="ajout-conso__menu-du-jour">
              <p className="hc-text-label ajout-conso__menu-du-jour__titre">
                <Star size={13} aria-hidden="true" />
                Menu du jour
              </p>
              <div className="ajout-conso__grille">
                {menuDuJour.items
                  .filter((item) => produits.find((p) => p.id === item.produitId))
                  .map((item) => {
                    const p = produits.find((p) => p.id === item.produitId)!;
                    const prixAffiche = item.prixSpecial ?? p.prix;
                    const deviseAffichee = item.deviseSpeciale ?? p.devise;
                    return carteProduit({ ...p, prix: prixAffiche, devise: deviseAffichee as Devise });
                  })}
              </div>
              <hr className="ajout-conso__separateur" />
            </div>
          )}

          {populairesAffiches.length > 0 && (
            <>
              <p className="hc-text-label texte-discret">Populaires aujourd'hui</p>
              <div className="ajout-conso__grille">{populairesAffiches.map(carteProduit)}</div>
              <p className="hc-text-label texte-discret">{categorie === TOUTES ? "Tous les produits" : categorie}</p>
            </>
          )}
          <div className="ajout-conso__grille">{autres.map(carteProduit)}</div>
          {populairesAffiches.length === 0 && autres.length === 0 && (
            <p className="hc-text-body texte-discret">
              {recherche ? "Aucun produit ne correspond à la recherche." : "Aucun produit disponible."}
            </p>
          )}
        </div>

        <aside className="ajout-conso__panier carte-formulaire" aria-label="Sélection">
          <p className="hc-text-label texte-discret">Sélection pour {personne.nom}</p>
          {entreesPanier.length === 0 ? (
            <p className="hc-text-body texte-discret">Choisissez des produits à gauche.</p>
          ) : (
            entreesPanier.map(({ produit, quantite }) => (
              <div className="parametres-ligne" key={produit.id}>
                <span className="hc-text-body">
                  {quantite}x {produit.nom}
                </span>
                <span className="hc-text-price">{formatMontant(Number(produit.prix) * quantite, produit.devise)}</span>
              </div>
            ))
          )}
          {articles > 0 && <p className="hc-text-body-strong">{libelleTotal}</p>}
          {erreur && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreur}
            </p>
          )}
          <Button type="button" onClick={valider} disabled={articles === 0 || enEnvoi}>
            {enEnvoi ? "Ajout en cours…" : articles === 0 ? "Choisissez des produits" : `Ajouter à ${personne.nom} (${articles})`}
          </Button>
        </aside>
      </div>

      {webcamOuverte && (
        <ScannerWebcam mode="continu" onCode={ajouterParCode} onFermer={() => setWebcamOuverte(false)} titre={`Scanner pour ${personne.nom}`} />
      )}
    </div>
  );
}
