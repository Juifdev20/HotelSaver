import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { CompteCafeteria, Devise, ModePaiement, Produit, StatutCompte, ProfilConnecte, VenteCafeteria } from "@hotel-chicago/types";
import { construireRecuVente, enteteHotel } from "@hotel-chicago/receipts";
import { Button, formatMontant } from "@hotel-chicago/ui";

export interface EcranCompteCafeteriaProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  compteId: string;
  interfaceImprimante: string | null;
  onRetour: () => void;
}

function totalSousCompte(sousCompte: CompteCafeteria["sousComptes"][number]): { usd: number; cdf: number } {
  let usd = 0;
  let cdf = 0;
  for (const ligne of sousCompte.lignes) {
    const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
    if (ligne.devise === Devise.USD) usd += montant;
    else cdf += montant;
  }
  return { usd, cdf };
}

function totalCompte(compte: CompteCafeteria): { usd: number; cdf: number } {
  return compte.sousComptes.reduce(
    (acc, sc) => {
      const t = totalSousCompte(sc);
      return { usd: acc.usd + t.usd, cdf: acc.cdf + t.cdf };
    },
    { usd: 0, cdf: 0 }
  );
}

/**
 * Détail d'un compte cafétaria (Phase 15 — équivalent desktop de
 * apps/mobile/src/ecrans/EcranCompteCafeteria.tsx). En ligne directe : pas
 * de miroir, chaque action appelle l'API et recharge le compte.
 */
export function EcranCompteCafeteria({ client, utilisateur, compteId, interfaceImprimante, onRetour }: EcranCompteCafeteriaProps) {
  const [compte, setCompte] = useState<CompteCafeteria | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nomPersonne, setNomPersonne] = useState("");
  const [enAjoutPersonne, setEnAjoutPersonne] = useState(false);

  const [sousCompteChoisi, setSousCompteChoisi] = useState("");
  const [produitChoisi, setProduitChoisi] = useState("");
  const [quantiteLigne, setQuantiteLigne] = useState("1");
  const [enAjoutLigne, setEnAjoutLigne] = useState(false);

  const [modePaiement, setModePaiement] = useState<ModePaiement>(ModePaiement.CASH);
  const [venteEncaissee, setVenteEncaissee] = useState<VenteCafeteria | null>(null);
  const [enEncaissement, setEnEncaissement] = useState(false);
  const [enImpression, setEnImpression] = useState(false);
  const [messageImpression, setMessageImpression] = useState<string | null>(null);

  const rechargerCompte = useCallback(() => {
    client
      .obtenirCompteCafeteria(compteId)
      .then((c) => {
        setCompte(c);
        setSousCompteChoisi((precedent) => precedent || c.sousComptes[0]?.id || "");
      })
      .catch((e: Error) => setErreur(e.message));
  }, [client, compteId]);

  useEffect(() => {
    rechargerCompte();
    client.listerProduits().then(setProduits).catch(() => {});
  }, [rechargerCompte, client]);

  async function ajouterPersonne() {
    if (!nomPersonne.trim()) {
      setErreur("Le nom de la personne est obligatoire.");
      return;
    }
    setEnAjoutPersonne(true);
    setErreur(null);
    try {
      await client.ajouterSousCompte(compteId, nomPersonne.trim());
      setNomPersonne("");
      rechargerCompte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnAjoutPersonne(false);
    }
  }

  async function ajouterLigne() {
    const quantiteNombre = Number(quantiteLigne);
    if (!sousCompteChoisi || !produitChoisi || !Number.isFinite(quantiteNombre) || quantiteNombre <= 0) {
      setErreur("Choisissez une personne, un produit et une quantité positive.");
      return;
    }
    setEnAjoutLigne(true);
    setErreur(null);
    try {
      await client.ajouterLigne(compteId, { sousCompteId: sousCompteChoisi, produitId: produitChoisi, quantite: quantiteNombre });
      setQuantiteLigne("1");
      rechargerCompte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnAjoutLigne(false);
    }
  }

  async function encaisser() {
    setEnEncaissement(true);
    setErreur(null);
    try {
      const ventes = await client.encaisserCompte(compteId, { mode: "GROUPE", modePaiement });
      setVenteEncaissee(ventes[0]);
      rechargerCompte();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEncaissement(false);
    }
  }

  async function imprimerRecu() {
    if (!venteEncaissee || !compte) return;
    if (!interfaceImprimante) {
      setMessageImpression("Aucune imprimante configurée — réglez-la depuis Paramètres > Imprimante.");
      return;
    }
    setEnImpression(true);
    setMessageImpression(null);
    try {
      await window.hotelChicago.imprimer(interfaceImprimante, construireRecuVente(venteEncaissee, compte, utilisateur.nom, enteteHotel(utilisateur)));
      setMessageImpression("Reçu envoyé à l'imprimante.");
    } catch (e) {
      setMessageImpression(e instanceof Error ? e.message : "Échec de l'impression.");
    } finally {
      setEnImpression(false);
    }
  }

  if (!compte) {
    return (
      <div className="page">
        {erreur ? (
          <p role="alert" className="hc-text-body texte-erreur">
            {erreur}
          </p>
        ) : (
          <p className="hc-text-body texte-discret">Chargement…</p>
        )}
      </div>
    );
  }

  const total = totalCompte(compte);
  const compteOuvert = compte.statut === StatutCompte.OUVERT;

  if (venteEncaissee) {
    return (
      <div className="page">
        <header className="page__entete">
          <div>
            <h1 className="hc-text-display-md page__titre">Reçu {venteEncaissee.numeroRecu}</h1>
          </div>
        </header>
        <div className="carte-formulaire">
          {Number(venteEncaissee.montantTotalUSD) > 0 && (
            <p className="hc-text-price">{formatMontant(venteEncaissee.montantTotalUSD, Devise.USD)}</p>
          )}
          {Number(venteEncaissee.montantTotalCDF) > 0 && (
            <p className="hc-text-price">{formatMontant(venteEncaissee.montantTotalCDF, Devise.CDF)}</p>
          )}
          {messageImpression && (
            <p className="hc-text-body" role="status">
              {messageImpression}
            </p>
          )}
          <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
            <Button type="button" variant="secondary" onClick={imprimerRecu} disabled={enImpression}>
              {enImpression ? "…" : "Imprimer le reçu"}
            </Button>
            <Button type="button" onClick={onRetour}>
              Terminer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">{compte.tableOuNom}</h1>
          <p className="hc-text-body page__sous-titre">{compteOuvert ? "Compte ouvert." : "Ce compte est déjà encaissé."}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {compte.sousComptes.map((sousCompte) => {
        const totalPersonne = totalSousCompte(sousCompte);
        return (
          <div key={sousCompte.id} className="carte-formulaire">
            <p className="hc-text-label texte-discret">{sousCompte.nom}</p>
            {sousCompte.lignes.length === 0 ? (
              <p className="hc-text-body texte-discret">Aucune ligne.</p>
            ) : (
              sousCompte.lignes.map((ligne) => (
                <div className="parametres-ligne" key={ligne.id}>
                  <span className="hc-text-body">
                    {ligne.quantite}x {ligne.produit.nom}
                  </span>
                  <span className="hc-text-price">{formatMontant(Number(ligne.prixUnitaire) * Number(ligne.quantite), ligne.devise)}</span>
                </div>
              ))
            )}
            {(totalPersonne.usd > 0 || totalPersonne.cdf > 0) && (
              <p className="hc-text-body-strong" style={{ marginTop: "var(--hc-space-2)" }}>
                {totalPersonne.usd > 0 && formatMontant(totalPersonne.usd, Devise.USD)}
                {totalPersonne.usd > 0 && totalPersonne.cdf > 0 && " + "}
                {totalPersonne.cdf > 0 && formatMontant(totalPersonne.cdf, Devise.CDF)}
              </p>
            )}
          </div>
        );
      })}

      <div className="carte-formulaire">
        <p className="hc-text-label texte-discret">Total</p>
        {total.usd === 0 && total.cdf === 0 ? (
          <p className="hc-text-body texte-discret">Aucune ligne pour l'instant.</p>
        ) : (
          <>
            {total.usd > 0 && <p className="hc-text-price">{formatMontant(total.usd, Devise.USD)}</p>}
            {total.cdf > 0 && <p className="hc-text-price">{formatMontant(total.cdf, Devise.CDF)}</p>}
          </>
        )}
      </div>

      {compteOuvert && (
        <>
          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Ajouter une personne</p>
            <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
              <input value={nomPersonne} onChange={(e) => setNomPersonne(e.target.value)} placeholder="Ex. Personne 2" style={{ flex: 1 }} />
              <Button type="button" variant="secondary" onClick={ajouterPersonne} disabled={enAjoutPersonne}>
                {enAjoutPersonne ? "…" : "Ajouter"}
              </Button>
            </div>
          </div>

          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Ajouter une ligne</p>
            <div className="puces" role="group" aria-label="Personne">
              {compte.sousComptes.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  className="puce"
                  aria-pressed={sousCompteChoisi === sc.id}
                  onClick={() => setSousCompteChoisi(sc.id)}
                >
                  {sc.nom}
                </button>
              ))}
            </div>
            <label className="hc-text-label" htmlFor="champ-produit">
              Produit
            </label>
            <select id="champ-produit" value={produitChoisi} onChange={(e) => setProduitChoisi(e.target.value)}>
              <option value="">Choisir un produit</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} — {formatMontant(p.prix, p.devise)}
                </option>
              ))}
            </select>
            <label className="hc-text-label" htmlFor="champ-quantite">
              Quantité
            </label>
            <input
              id="champ-quantite"
              type="number"
              min="1"
              value={quantiteLigne}
              onChange={(e) => setQuantiteLigne(e.target.value)}
            />
            <Button type="button" onClick={ajouterLigne} disabled={enAjoutLigne} style={{ marginTop: "var(--hc-space-2)" }}>
              {enAjoutLigne ? "…" : "Ajouter la ligne"}
            </Button>
          </div>

          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Encaisser</p>
            <div className="puces" role="group" aria-label="Mode de paiement">
              {[ModePaiement.CASH, ModePaiement.MOBILE_MONEY].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="puce"
                  aria-pressed={modePaiement === m}
                  onClick={() => setModePaiement(m)}
                >
                  {m === ModePaiement.CASH ? "Espèces" : "Mobile money"}
                </button>
              ))}
            </div>
            <Button
              type="button"
              onClick={encaisser}
              disabled={enEncaissement || (total.usd === 0 && total.cdf === 0)}
              style={{ marginTop: "var(--hc-space-3)" }}
            >
              {enEncaissement ? "…" : "Encaisser"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
