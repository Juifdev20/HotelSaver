import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, Produit, Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, StatusBadge, formatMontant } from "@hotel-chicago/ui";
import { UtensilsCrossed } from "lucide-react";

export interface EcranMenuProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
}

interface FormulaireProduit {
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  seuilAlerte: string;
  actif: boolean;
}

const FORMULAIRE_VIDE: FormulaireProduit = { nom: "", categorie: "", prix: "", devise: Devise.USD, seuilAlerte: "", actif: true };

/** Équivalent desktop de apps/mobile/src/ecrans/EcranMenu.tsx — CAFETARIA en
 * lecture seule, PATRON gère (créer/modifier/supprimer), même matrice que
 * ProduitsController côté API. */
export function EcranMenu({ client, utilisateur }: EcranMenuProps) {
  const peutModifier = utilisateur.role === Role.PATRON;
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [produitEnEdition, setProduitEnEdition] = useState<Produit | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [formulaire, setFormulaire] = useState<FormulaireProduit>(FORMULAIRE_VIDE);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);

  function charger() {
    client.listerProduits().then(setProduits).catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  function ouvrirCreation() {
    setProduitEnEdition(null);
    setFormulaire(FORMULAIRE_VIDE);
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
      actif: produit.actif,
    });
    setErreurFormulaire(null);
    setFormulaireOuvert(true);
  }

  async function enregistrer() {
    const prixNombre = Number(formulaire.prix);
    if (!formulaire.nom.trim() || !formulaire.categorie.trim() || !Number.isFinite(prixNombre) || prixNombre <= 0) {
      setErreurFormulaire("Nom, catégorie et prix (positif) sont obligatoires.");
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      const seuilAlerte = formulaire.seuilAlerte.trim() ? Number(formulaire.seuilAlerte) : undefined;
      if (produitEnEdition) {
        await client.modifierProduit(produitEnEdition.id, {
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          seuilAlerte,
          actif: formulaire.actif,
        });
      } else {
        await client.creerProduit({
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          seuilAlerte,
        });
      }
      setFormulaireOuvert(false);
      charger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function supprimer(produit: Produit) {
    setEnEnvoi(true);
    setErreur(null);
    try {
      await client.supprimerProduit(produit.id);
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

      {formulaireOuvert && peutModifier && (
        <div className="carte-formulaire formulaire">
          <label className="hc-text-label" htmlFor="champ-nom-produit">
            Nom
          </label>
          <input id="champ-nom-produit" value={formulaire.nom} onChange={(e) => setFormulaire((f) => ({ ...f, nom: e.target.value }))} placeholder="Coca-Cola" />

          <label className="hc-text-label" htmlFor="champ-categorie-produit">
            Catégorie
          </label>
          <input
            id="champ-categorie-produit"
            value={formulaire.categorie}
            onChange={(e) => setFormulaire((f) => ({ ...f, categorie: e.target.value }))}
            placeholder="Boissons"
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
            <Button type="button" onClick={enregistrer} disabled={enEnvoi}>
              {enEnvoi ? "…" : "Enregistrer"}
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
                {peutModifier && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {produits.map((p) => (
                <tr key={p.id}>
                  <td className="hc-text-body-strong">{p.nom}</td>
                  <td className="texte-discret">{p.categorie}</td>
                  <td className="texte-discret">{formatMontant(p.prix, p.devise)}</td>
                  <td className="texte-discret">{p.stockActuel}</td>
                  <td>
                    <StatusBadge tone={p.actif ? "success" : "neutral"} label={p.actif ? "Actif" : "Inactif"} />
                  </td>
                  {peutModifier && (
                    <td>
                      <Button type="button" variant="secondary" size="sm" onClick={() => ouvrirEdition(p)}>
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
    </div>
  );
}
