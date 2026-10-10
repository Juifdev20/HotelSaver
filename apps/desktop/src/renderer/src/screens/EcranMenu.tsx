import * as React from "react";
import { useEffect, useState } from "react";
import { useConfirmation } from "../components/DialogueConfirmation";
import { ErreurApi, type ClientApi } from "@hotel-chicago/api-client";
import { construireEtiquette, genererEan13Interne } from "@hotel-chicago/receipts";
import { Devise, Produit, Role, TypeProduit, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, StatusBadge, formatMontant } from "@hotel-chicago/ui";
import { Camera, Printer, UtensilsCrossed } from "lucide-react";
import { ScannerWebcam } from "../components/ScannerWebcam";
import { SelecteurPhotos, nettoyerImages } from "../components/SelecteurPhotos";
import { ApercuRecu } from "../components/ApercuRecu";
import { lireMontant, lireQuantite } from "@hotel-chicago/miroir-local";

export interface EcranMenuProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  /** Imprimante configurée (Paramètres) — pour les étiquettes code-barres. */
  interfaceImprimante?: string | null;
}

interface FormulaireProduit {
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  typeProduit: TypeProduit;
  seuilAlerte: string;
  prixAchat: string;
  quantiteInitiale: string;
  portionsDisponibles: string;
  description: string;
  commandableEnLigne: boolean;
  actif: boolean;
  /** ARTICLE : code du fabricant (scanné) ou EAN-13 interne (généré). */
  codeBarres: string;
}

const FORMULAIRE_VIDE: FormulaireProduit = { nom: "", categorie: "", prix: "", devise: Devise.USD, typeProduit: TypeProduit.ARTICLE, seuilAlerte: "", prixAchat: "", quantiteInitiale: "", portionsDisponibles: "", description: "", commandableEnLigne: false, actif: true, codeBarres: "" };

/** Placeholders adaptés au type : « Coca-Cola » ne doit pas être suggéré
 * quand on saisit un plat. */
function placeholdersPour(typeProduit: TypeProduit) {
  return typeProduit === TypeProduit.PLAT
    ? { nom: "Poulet braisé", categorie: "Plats" }
    : { nom: "Coca-Cola", categorie: "Boissons" };
}

/** Équivalent desktop de apps/mobile/src/ecrans/EcranMenu.tsx — CAFETARIA en
 * lecture seule, PATRON gère (créer/modifier/supprimer), même matrice que
 * ProduitsController côté API. */
export function EcranMenu({ client, utilisateur, interfaceImprimante = null }: EcranMenuProps) {
  const peutModifier = utilisateur.role === Role.PATRON;
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [produitEnEdition, setProduitEnEdition] = useState<Produit | null>(null);
  // Code-barres (08/10/2026) : scan webcam du code fabricant, génération, étiquette.
  const [webcamOuverte, setWebcamOuverte] = useState(false);
  const [codeGenere, setCodeGenere] = useState(false);
  const [exemplaires, setExemplaires] = useState("1");
  const [messageEtiquette, setMessageEtiquette] = useState<string | null>(null);
  // Étape « Étiquettes » : juste après l'enregistrement d'un article avec
  // code-barres, ou depuis le bouton « Étiquette » du tableau (réimpression).
  const [etiquette, setEtiquette] = useState<{ produit: Produit; enregistre: boolean } | null>(null);
  const [enImpression, setEnImpression] = useState(false);
  // « Enregistrer » imprime aussi les étiquettes d'un code nouveau (un seul
  // geste pour le patron) : null = nombre automatique, sinon saisi à la main.
  const [nbEtiquettesSaisi, setNbEtiquettesSaisi] = useState<string | null>(null);
  const [messageListe, setMessageListe] = useState<string | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [formulaire, setFormulaire] = useState<FormulaireProduit>(FORMULAIRE_VIDE);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const { demander, dialogue } = useConfirmation();
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  // Photo du plat (0 ou 1) : `envoyees`/`avant` permettent de nettoyer le
  // stockage des images abandonnées ou remplacées (pattern EcranChambres).
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosAvant, setPhotosAvant] = useState<string[]>([]);
  const [photosEnvoyees, setPhotosEnvoyees] = useState<string[]>([]);

  function charger() {
    client.listerProduits().then(setProduits).catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  function ouvrirCreation() {
    setProduitEnEdition(null);
    setFormulaire(FORMULAIRE_VIDE);
    setCodeGenere(false);
    setMessageEtiquette(null);
    setNbEtiquettesSaisi(null);
    setPhotos([]);
    setPhotosAvant([]);
    setPhotosEnvoyees([]);
    setErreurFormulaire(null);
    setFormulaireOuvert(true);
  }

  function ouvrirEdition(produit: Produit) {
    setProduitEnEdition(produit);
    setFormulaire({
      nom: produit.nom,
      categorie: produit.categorie,
      prix: produit.prix,
      devise: produit.devise,
      seuilAlerte: produit.seuilAlerte,
      prixAchat: produit.prixAchat ?? "",
      quantiteInitiale: "",
      portionsDisponibles: produit.portionsDisponibles != null ? String(produit.portionsDisponibles) : "",
      typeProduit: produit.typeProduit === TypeProduit.PLAT ? TypeProduit.PLAT : TypeProduit.ARTICLE,
      description: produit.description ?? "",
      commandableEnLigne: produit.commandableEnLigne === true,
      actif: produit.actif,
      codeBarres: produit.codeBarres ?? "",
    });
    setCodeGenere(false);
    setMessageEtiquette(null);
    setNbEtiquettesSaisi(null);
    setPhotos(produit.photo ? [produit.photo] : []);
    setPhotosAvant(produit.photo ? [produit.photo] : []);
    setPhotosEnvoyees([]);
    setErreurFormulaire(null);
    setFormulaireOuvert(true);
  }

  /** EAN-13 interne (préfixe 2) ; sur collision (409), `enregistrer` en refait un. */
  function genererCode() {
    setFormulaire((f) => ({ ...f, codeBarres: genererEan13Interne() }));
    setCodeGenere(true);
  }

  /** Étiquette (nom, prix, code-barres) — seulement pour un code déjà enregistré. */
  async function imprimerEtiquette(produit: Produit | null = produitEnEdition) {
    if (!produit?.codeBarres) return;
    if (!interfaceImprimante) {
      setMessageEtiquette("Aucune imprimante configurée — Paramètres > Imprimante.");
      return;
    }
    setMessageEtiquette(null);
    setEnImpression(true);
    try {
      const n = Math.max(1, Math.round(Number(exemplaires)) || 1);
      await window.hotelChicago.imprimer(interfaceImprimante, construireEtiquette(produit, n));
      setMessageEtiquette(`${n} étiquette${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""} à l'imprimante.`);
    } catch (e) {
      setMessageEtiquette(e instanceof Error ? e.message : "Impression impossible.");
    } finally {
      setEnImpression(false);
    }
  }

  /** Ouvre l'étape « Étiquettes » ; `exemplairesParDefaut` = une étiquette par
   * article mis en stock à la création. */
  function ouvrirEtiquettes(produit: Produit, enregistre: boolean, exemplairesParDefaut = 1) {
    setExemplaires(String(Math.max(1, exemplairesParDefaut)));
    setMessageEtiquette(null);
    setEtiquette({ produit, enregistre });
  }

  // Code nouveau (création, ou code ajouté/changé) d'un article : ses
  // étiquettes partent à l'imprimante dès l'enregistrement. Une retouche du
  // prix ou du nom (même code) n'imprime rien.
  const codeSaisi = formulaire.codeBarres.replace(/\s+/g, "");
  const codeNouveau =
    formulaire.typeProduit !== TypeProduit.PLAT && codeSaisi !== "" && codeSaisi !== (produitEnEdition?.codeBarres ?? "");
  // Par défaut : une étiquette par article en stock, au moins 1, sans limite.
  const nbEtiquettesAuto = Math.max(
    1,
    Math.round(Number(produitEnEdition ? produitEnEdition.stockActuel : formulaire.quantiteInitiale) || 1)
  );
  const nbEtiquettesDefaut = codeNouveau ? nbEtiquettesAuto : 0;
  const nbEtiquettes =
    formulaire.typeProduit !== TypeProduit.PLAT && codeSaisi !== ""
      ? Math.max(0, Math.round(Number(nbEtiquettesSaisi ?? nbEtiquettesDefaut)) || 0)
      : 0;

  async function enregistrer(essai = 0): Promise<void> {
    if (!formulaire.nom.trim() || !formulaire.categorie.trim()) {
      setErreurFormulaire("Le nom et la catégorie sont obligatoires.");
      return;
    }
    const prixLu = lireMontant(formulaire.prix, formulaire.devise, { max: 100_000_000 });
    if (!prixLu.ok) {
      setErreurFormulaire(`Prix : ${prixLu.message}`);
      return;
    }
    const prixNombre = prixLu.valeur;
    const prixAchatLu = formulaire.prixAchat.trim() ? lireMontant(formulaire.prixAchat, formulaire.devise, { max: 100_000_000 }) : null;
    if (prixAchatLu && !prixAchatLu.ok) {
      setErreurFormulaire(`Prix d'achat : ${prixAchatLu.message}`);
      return;
    }
    const seuilLu = formulaire.seuilAlerte.trim() ? lireQuantite(formulaire.seuilAlerte, { autoriserZero: true, max: 1_000_000 }) : null;
    if (seuilLu && !seuilLu.ok) {
      setErreurFormulaire(`Seuil d'alerte : ${seuilLu.message}`);
      return;
    }
    const quantiteInitialeLu = formulaire.quantiteInitiale.trim() ? lireQuantite(formulaire.quantiteInitiale, { autoriserZero: true, max: 1_000_000 }) : null;
    if (quantiteInitialeLu && !quantiteInitialeLu.ok) {
      setErreurFormulaire(`Quantité initiale : ${quantiteInitialeLu.message}`);
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      const estPlat = formulaire.typeProduit === TypeProduit.PLAT;
      const seuilAlerte = estPlat ? undefined : seuilLu && seuilLu.ok ? seuilLu.valeur : undefined;
      const prixAchat  = estPlat ? undefined : prixAchatLu && prixAchatLu.ok ? prixAchatLu.valeur : undefined;
      const description = estPlat ? formulaire.description.trim() || undefined : undefined;
      const commandableEnLigne = estPlat ? formulaire.commandableEnLigne : false;
      // Vide = illimité ; null explicite en modification pour repasser en
      // illimité un plat qui avait des portions.
      const portions = formulaire.portionsDisponibles.trim();
      const portionsDisponibles = estPlat ? (portions ? Number(portions) : null) : undefined;
      const code = formulaire.codeBarres.replace(/\s+/g, "");
      let enregistre: Produit;
      if (produitEnEdition) {
        enregistre = await client.modifierProduit(produitEnEdition.id, {
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          typeProduit: formulaire.typeProduit,
          photo: estPlat ? (photos[0] ?? null) : undefined,
          seuilAlerte,
          prixAchat,
          description,
          commandableEnLigne,
          portionsDisponibles,
          actif: formulaire.actif,
          codeBarres: estPlat ? undefined : code || null,
        });
      } else {
        enregistre = await client.creerProduit({
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          typeProduit: formulaire.typeProduit,
          photo: estPlat ? photos[0] : undefined,
          seuilAlerte,
          prixAchat,
          stockActuel: !estPlat && quantiteInitialeLu && quantiteInitialeLu.ok ? quantiteInitialeLu.valeur : undefined,
          description,
          commandableEnLigne,
          portionsDisponibles: estPlat && portions ? Number(portions) : undefined,
          codeBarres: !estPlat && code ? code : undefined,
        });
      }
      // Enregistré : on ne garde dans le stockage que la photo conservée.
      void nettoyerImages(client, photosAvant, photosEnvoyees, photos);
      setFormulaireOuvert(false);
      charger();
      // Un seul geste : les étiquettes du code nouveau partent directement.
      // Si l'impression échoue, le produit reste enregistré et le panneau
      // « Étiquettes » s'ouvre pour réessayer sans rien ressaisir.
      const n = nbEtiquettes;
      if (!estPlat && enregistre.codeBarres && n > 0) {
        setMessageListe(`Impression de ${n} étiquette${n > 1 ? "s" : ""} pour « ${enregistre.nom} »…`);
        try {
          if (!interfaceImprimante) throw new Error("Aucune imprimante configurée — Paramètres > Imprimante.");
          await window.hotelChicago.imprimer(interfaceImprimante, construireEtiquette(enregistre, n));
          setMessageListe(`✓ « ${enregistre.nom} » enregistré — ${n} étiquette${n > 1 ? "s" : ""} imprimée${n > 1 ? "s" : ""}.`);
        } catch (erreurImpression) {
          setMessageListe(null);
          ouvrirEtiquettes(enregistre, true, n);
          setMessageEtiquette(
            `Produit enregistré, mais l'impression a échoué : ${erreurImpression instanceof Error ? erreurImpression.message : "erreur inconnue"}`
          );
        }
      } else {
        setMessageListe(`✓ « ${enregistre.nom} » enregistré.`);
      }
    } catch (e) {
      // Code généré déjà pris (très rare) : un autre, et on réessaie.
      if (e instanceof ErreurApi && e.statusCode === 409 && codeGenere && essai < 3) {
        const nouveau = genererEan13Interne();
        formulaire.codeBarres = nouveau;
        setFormulaire((f) => ({ ...f, codeBarres: nouveau }));
        return enregistrer(essai + 1);
      }
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function supprimer(produit: Produit) {
    const confirme = await demander({
      titre: `Supprimer « ${produit.nom} » du menu ?`,
      message: "Le produit disparaît de la caisse et du site de l'hôtel. Les ventes déjà enregistrées ne changent pas.",
      libelleConfirmer: "Supprimer ce produit",
      destructif: true,
    });
    if (!confirme) return;
    setEnEnvoi(true);
    setErreur(null);
    try {
      await client.supprimerProduit(produit.id);
      void nettoyerImages(client, [produit.photo ?? ""].filter(Boolean), [], []);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Menu</h1>
          <p className="hc-text-body page__sous-titre">
            {peutModifier ? "Gérez les produits en vente." : "Seul le Patron peut modifier le menu."}
          </p>
        </div>
        {peutModifier && (
          <Button type="button" onClick={ouvrirCreation}>
            Nouveau produit
          </Button>
        )}
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {messageListe && (
        <p className="hc-text-body texte-succes" role="status" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {messageListe}
          <button type="button" className="champ-recherche__effacer" onClick={() => setMessageListe(null)} aria-label="Fermer le message">
            ×
          </button>
        </p>
      )}

      {etiquette && (
        <div className="carte-formulaire formulaire" role="region" aria-label="Étiquettes code-barres">
          {etiquette.enregistre ? (
            <p className="hc-text-body texte-succes">
              ✓ « {etiquette.produit.nom} » est enregistré. Imprimez ses étiquettes et collez-les sur les articles pour les scanner à la caisse.
            </p>
          ) : (
            <p className="hc-text-label texte-discret">Étiquette de « {etiquette.produit.nom} »</p>
          )}
          <div style={{ maxWidth: 320 }}>
            <ApercuRecu lignes={construireEtiquette(etiquette.produit, 1)} />
          </div>
          <label className="hc-text-label" htmlFor="champ-nb-etiquettes">
            Nombre d'étiquettes
          </label>
          <input
            id="champ-nb-etiquettes"
            type="number"
            min="1"
                        value={exemplaires}
            onChange={(e) => setExemplaires(e.target.value)}
            style={{ width: 100 }}
          />
          {messageEtiquette && <p className="hc-text-body texte-discret">{messageEtiquette}</p>}
          <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
            <Button type="button" onClick={() => void imprimerEtiquette(etiquette.produit)} disabled={enImpression}>
              <Printer size={16} aria-hidden="true" /> {enImpression ? "Impression…" : "Imprimer les étiquettes"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEtiquette(null)}>
              Terminer
            </Button>
          </div>
        </div>
      )}

      {formulaireOuvert && peutModifier && (
        <div className="carte-formulaire formulaire">
          <span className="hc-text-label">Type de produit</span>
          <div className="puces" role="group" aria-label="Type de produit">
            {([
              { valeur: TypeProduit.ARTICLE, titre: "Article comptoir (stocké : bière, sucre…)" },
              { valeur: TypeProduit.PLAT, titre: "Plat préparé (cuisiné : publiable sur le site)" },
            ] as const).map((t) => (
              <button
                key={t.valeur}
                type="button"
                className="puce"
                aria-pressed={formulaire.typeProduit === t.valeur}
                onClick={() => setFormulaire((f) => ({ ...f, typeProduit: t.valeur }))}
              >
                {t.titre}
              </button>
            ))}
          </div>

          <label className="hc-text-label" htmlFor="champ-nom-produit">
            Nom
          </label>
          <input
            id="champ-nom-produit"
            value={formulaire.nom}
            onChange={(e) => setFormulaire((f) => ({ ...f, nom: e.target.value }))}
            placeholder={placeholdersPour(formulaire.typeProduit).nom}
          />

          <label className="hc-text-label" htmlFor="champ-categorie-produit">
            Catégorie
          </label>
          <input
            id="champ-categorie-produit"
            value={formulaire.categorie}
            onChange={(e) => setFormulaire((f) => ({ ...f, categorie: e.target.value }))}
            placeholder={placeholdersPour(formulaire.typeProduit).categorie}
          />

          <label className="hc-text-label" htmlFor="champ-prix-produit">
            Prix
          </label>
          <input
            id="champ-prix-produit"
            type="number"
            step="0.01"
            value={formulaire.prix}
            onChange={(e) => setFormulaire((f) => ({ ...f, prix: e.target.value }))}
            placeholder="0"
          />

          <div className="puces" role="group" aria-label="Devise">
            {[Devise.USD, Devise.CDF].map((d) => (
              <button
                key={d}
                type="button"
                className="puce"
                aria-pressed={formulaire.devise === d}
                onClick={() => setFormulaire((f) => ({ ...f, devise: d }))}
              >
                {d}
              </button>
            ))}
          </div>

          {formulaire.typeProduit === TypeProduit.ARTICLE && (
            <>
              {!produitEnEdition && (
                <>
                  <label className="hc-text-label" htmlFor="champ-quantite-produit">
                    Quantité initiale en stock (optionnel — ensuite via l'écran Stock)
                  </label>
                  <input
                    id="champ-quantite-produit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formulaire.quantiteInitiale}
                    onChange={(e) => setFormulaire((f) => ({ ...f, quantiteInitiale: e.target.value }))}
                    placeholder="0"
                  />
                </>
              )}

              <label className="hc-text-label" htmlFor="champ-seuil-produit">
                Seuil d'alerte (optionnel)
              </label>
              <input
                id="champ-seuil-produit"
                type="number"
                value={formulaire.seuilAlerte}
                onChange={(e) => setFormulaire((f) => ({ ...f, seuilAlerte: e.target.value }))}
                placeholder="0"
              />

              <label className="hc-text-label" htmlFor="champ-prix-achat-produit">
                Prix d'achat (optionnel — pour calcul de marge dans l'inventaire)
              </label>
              <input
                id="champ-prix-achat-produit"
                type="number"
                step="0.01"
                min="0"
                value={formulaire.prixAchat}
                onChange={(e) => setFormulaire((f) => ({ ...f, prixAchat: e.target.value }))}
                placeholder="0.00"
              />

              <label className="hc-text-label" htmlFor="champ-code-barres-produit">
                Code-barres (optionnel — code du fabricant, ou « Générer » puis étiquette)
              </label>
              <div style={{ display: "flex", gap: "var(--hc-space-2)", alignItems: "center" }}>
                <input
                  id="champ-code-barres-produit"
                  value={formulaire.codeBarres}
                  onChange={(e) => {
                    setCodeGenere(false);
                    setFormulaire((f) => ({ ...f, codeBarres: e.target.value }));
                  }}
                  placeholder="Scanner avec la douchette, la webcam, ou générer"
                  style={{ flex: 1 }}
                />
                <Button type="button" variant="secondary" onClick={() => setWebcamOuverte(true)}>
                  <Camera size={16} aria-hidden="true" /> Scanner
                </Button>
                <Button type="button" variant="secondary" onClick={genererCode}>
                  Générer
                </Button>
              </div>
              <p className="hc-text-caption texte-discret">Le code ne contient pas le prix : changer un prix ne demande pas de réimprimer.</p>

              <label className="hc-text-label" htmlFor="champ-nb-etiquettes-enregistrement">
                Nombre d'étiquettes code-barres à imprimer
              </label>
              <input
                id="champ-nb-etiquettes-enregistrement"
                type="number"
                min="0"
                                value={nbEtiquettesSaisi ?? String(nbEtiquettesDefaut)}
                onChange={(e) => setNbEtiquettesSaisi(e.target.value)}
                style={{ width: 100 }}
              />
              <p className="hc-text-caption texte-discret">
                {codeSaisi === ""
                  ? "Générez ou scannez d'abord un code : les étiquettes s'impriment à l'enregistrement."
                  : "Imprimées automatiquement en cliquant sur Enregistrer. 0 = aucune."}
              </p>
              {messageEtiquette && <p className="hc-text-caption texte-discret">{messageEtiquette}</p>}

              {webcamOuverte && (
                <ScannerWebcam
                  mode="unique"
                  onCode={(code) => {
                    setCodeGenere(false);
                    setFormulaire((f) => ({ ...f, codeBarres: code }));
                  }}
                  onFermer={() => setWebcamOuverte(false)}
                />
              )}
            </>
          )}

          {formulaire.typeProduit === TypeProduit.PLAT && (
            <>
              <SelecteurPhotos
                client={client}
                usage="produit"
                photos={photos}
                max={1}
                onChange={setPhotos}
                onEnvoyee={(url) => setPhotosEnvoyees((l) => [...l, url])}
                libelle="Photo du plat (optionnel, visible sur le site)"
              />

              <label className="hc-text-label" htmlFor="champ-portions-produit">
                Portions disponibles (optionnel — vide = illimité, cuisine à la commande)
              </label>
              <input
                id="champ-portions-produit"
                type="number"
                min="0"
                value={formulaire.portionsDisponibles}
                onChange={(e) => setFormulaire((f) => ({ ...f, portionsDisponibles: e.target.value }))}
                placeholder="Illimité"
              />

              <label className="hc-text-label" htmlFor="champ-description-produit">
                Description sur le site (optionnel — ex. « Poulet braisé, frites et salade »)
              </label>
              <input
                id="champ-description-produit"
                value={formulaire.description}
                onChange={(e) => setFormulaire((f) => ({ ...f, description: e.target.value }))}
              />

              <div className="parametres-ligne">
                <span className="hc-text-body">Visible et commandable sur le site (« Cuisine »)</span>
                <input
                  type="checkbox"
                  checked={formulaire.commandableEnLigne}
                  onChange={(e) => setFormulaire((f) => ({ ...f, commandableEnLigne: e.target.checked }))}
                />
              </div>
              <p className="hc-text-caption texte-discret">
                Le plat apparaît sur le site web de l'hôtel si la commande en ligne est activée dans Paramètres.
              </p>
            </>
          )}

          {erreurFormulaire && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreurFormulaire}
            </p>
          )}

          <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-2)" }}>
            {produitEnEdition && (
              <Button type="button" variant="danger" onClick={() => supprimer(produitEnEdition)} disabled={enEnvoi}>
                Supprimer
              </Button>
            )}
            <Button type="button" onClick={() => void enregistrer()} disabled={enEnvoi}>
              {enEnvoi
                ? "…"
                : nbEtiquettes > 0
                  ? `Enregistrer et imprimer ${nbEtiquettes} étiquette${nbEtiquettes > 1 ? "s" : ""}`
                  : "Enregistrer"}
            </Button>
          </div>
        </div>
      )}

      {produits === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {produits?.length === 0 && (
        <div className="etat-vide">
          <UtensilsCrossed size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun produit enregistré</p>
        </div>
      )}

      {produits && produits.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-menu">
          <table className="tableau">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Catégorie</th>
                <th>Prix</th>
                <th>Stock</th>
                <th>Statut</th>
                <th>Code-barres</th>
                {peutModifier && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {produits.map((p) => (
                <tr key={p.id}>
                  <td className="hc-text-body-strong">{p.nom}</td>
                  <td className="texte-discret">{p.categorie}</td>
                  <td className="texte-discret">{formatMontant(p.prix, p.devise)}</td>
                  <td className="texte-discret">
                    {p.typeProduit === TypeProduit.PLAT
                      ? p.portionsDisponibles == null
                        ? "—"
                        : p.portionsDisponibles > 0
                          ? `${p.portionsDisponibles} portion${p.portionsDisponibles > 1 ? "s" : ""}`
                          : "Épuisé"
                      : p.stockActuel}
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", gap: "var(--hc-space-1)" }}>
                      {p.typeProduit === TypeProduit.PLAT && <StatusBadge tone="purple" label="Plat" />}
                      <StatusBadge tone={p.actif ? "success" : "neutral"} label={p.actif ? "Actif" : "Inactif"} />
                      {p.commandableEnLigne && <StatusBadge tone="info" label="Site" />}
                    </span>
                  </td>
                  <td>
                    {p.typeProduit !== TypeProduit.PLAT && p.codeBarres ? (
                      <span style={{ display: "inline-flex", gap: "var(--hc-space-2)", alignItems: "center" }}>
                        <span className="texte-discret" style={{ fontVariantNumeric: "tabular-nums" }}>{p.codeBarres}</span>
                        <Button type="button" variant="secondary" size="sm" aria-label={`Étiquette de ${p.nom}`} onClick={() => ouvrirEtiquettes(p, false)}>
                          <Printer size={14} aria-hidden="true" /> Étiquette
                        </Button>
                      </span>
                    ) : (
                      <span className="texte-discret">—</span>
                    )}
                  </td>
                  {peutModifier && (
                    <td>
                      <Button type="button" variant="secondary" size="sm" aria-label={`Modifier ${p.nom}`} onClick={() => ouvrirEdition(p)}>
                        Modifier
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialogue}
    </div>
  );
}
