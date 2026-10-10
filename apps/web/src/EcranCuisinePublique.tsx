import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Captcha, captchaActif } from "./Captcha";
import { creerCommandeWeb, listerMenu } from "@hotel-chicago/api-client";
import { formatMontant } from "@hotel-chicago/ui";
import type { CommandeWebCreee, Produit } from "@hotel-chicago/types";
import { configuration } from "./config";

interface LignePanier {
  produit: Produit;
  quantite: number;
}

/**
 * Page « Cuisine » du site public : le visiteur compose sa commande depuis la
 * carte opt-in de l'hôtel (produits commandableEnLigne — GET /public/menu ne
 * renvoie déjà que ceux-là). Pas de paiement en ligne : la commande arrive à
 * la cafétéria, le client paie et est servi au comptoir.
 */
export function EcranCuisinePublique({ sousDomaine }: { sousDomaine: string }) {
  const [jetonCaptcha, setJetonCaptcha] = useState<string | undefined>(undefined);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState<CommandeWebCreee | null>(null);
  const [client, setClient] = useState({ nom: "", telephone: "", chambre: "", note: "" });

  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      setErreur(null);
      try {
        const resultat = await listerMenu({ url: configuration.apiUrl }, sousDomaine);
        if (!annule) setProduits(resultat);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Erreur de chargement.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [sousDomaine]);

  const lignes = useMemo<LignePanier[]>(() => {
    return produits
      .filter((p) => (panier[p.id] ?? 0) > 0)
      .map((p) => ({ produit: p, quantite: panier[p.id]! }));
  }, [produits, panier]);

  const totalUSD = lignes.reduce((s, l) => (l.produit.devise === "USD" ? s + Number(l.produit.prix) * l.quantite : s), 0);
  const totalCDF = lignes.reduce((s, l) => (l.produit.devise === "CDF" ? s + Number(l.produit.prix) * l.quantite : s), 0);

  const parCategorie = useMemo(() => {
    const map = new Map<string, Produit[]>();
    for (const p of produits) {
      const liste = map.get(p.categorie) ?? [];
      liste.push(p);
      map.set(p.categorie, liste);
    }
    return [...map.entries()];
  }, [produits]);

  const changerQuantite = (produitId: string, delta: number) => {
    const produit = produits.find((p) => p.id === produitId);
    setPanier((actuel) => {
      const quantite = Math.max(0, (actuel[produitId] ?? 0) + delta);
      // Portions limitées : impossible de commander au-delà (le serveur
      // recontrôle de toute façon).
      const restant = produit?.portionsDisponibles;
      if (delta > 0 && restant != null && quantite > restant) return actuel;
      const suivant = { ...actuel };
      if (quantite === 0) delete suivant[produitId];
      else suivant[produitId] = quantite;
      return suivant;
    });
  };

  // Un plat n'a pas de stock compté (préparé à la commande) : disponible tant
  // que le patron l'a marqué actif + commandable, sauf si des portions
  // limitées sont déclarées et épuisées.
  const disponible = (p: Produit) => p.portionsDisponibles == null || p.portionsDisponibles > 0;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envoi || lignes.length === 0) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const resultat = await creerCommandeWeb(
        { url: configuration.apiUrl },
        {
          sousDomaine,
          client: {
            nom: client.nom.trim(),
            telephone: client.telephone.trim() || undefined,
            chambre: client.chambre.trim() || undefined,
            note: client.note.trim() || undefined,
          },
          lignes: lignes.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
          captchaToken: jetonCaptcha,
        }
      );
      setConfirmation(resultat);
      setPanier({});
      window.scrollTo(0, 0);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Impossible d'envoyer la commande.");
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement) {
    return (
      <div className="hotel-page">
        <div className="hotel-page__entete"><h1>Cuisine</h1></div>
        <div className="hotel-page__corps"><p className="hotel-vide">Chargement de la carte…</p></div>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="hotel-page">
        <div className="hotel-page__entete">
          <h1>Commande envoyée</h1>
          <p>Votre commande a été transmise à la cafétéria.</p>
        </div>
        <div className="hotel-page__corps">
          <div className="commande-succes">
            <p className="commande-succes__reference">Référence <strong>{confirmation.reference}</strong></p>
            <p>
              Présentez-vous au comptoir ou à la réception avec cette référence pour payer et récupérer votre
              commande — paiement sur place uniquement.
            </p>
            {(confirmation.totalUSD > 0 || confirmation.totalCDF > 0) && (
              <p className="commande-succes__total">
                Total : {[confirmation.totalUSD > 0 ? `${confirmation.totalUSD.toFixed(2)} $` : null, confirmation.totalCDF > 0 ? `${Math.round(confirmation.totalCDF).toLocaleString("fr-FR")} FC` : null].filter(Boolean).join(" + ")}
              </p>
            )}
            <div className="commande-succes__actions">
              <a
                className="hotel-bouton"
                href={`${configuration.apiUrl}/public/commande/${confirmation.compteId}/ticket?sousDomaine=${encodeURIComponent(sousDomaine)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Télécharger le ticket (PDF)
              </a>
              <button type="button" className="hotel-bouton hotel-bouton--contour" onClick={() => setConfirmation(null)}>
                Passer une autre commande
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hotel-page">
      <div className="hotel-page__entete">
        <h1>Cuisine</h1>
        <p>Composez votre commande — vous la récupérez et la payez au comptoir.</p>
      </div>

      <div className="hotel-page__corps cuisine-corps">
        <div className="cuisine-carte-produits">
          {parCategorie.map(([categorie, items]) => (
            <section key={categorie} className="cuisine-section">
              <h2>{categorie}</h2>
              <div className="cuisine-grille">
                {items.map((p) => {
                  const quantite = panier[p.id] ?? 0;
                  const epuise = !disponible(p);
                  return (
                    <article key={p.id} className={`plat-carte ${epuise ? "plat-carte--epuise" : ""}`}>
                      {p.photo ? (
                        <div className="plat-carte__media">
                          <img src={p.photo} alt="" loading="lazy" />
                        </div>
                      ) : (
                        <div className="plat-carte__media plat-carte__media--vide" aria-hidden="true">
                          {p.nom.slice(0, 1)}
                        </div>
                      )}
                      <div className="plat-carte__corps">
                        <h3>{p.nom}</h3>
                        {p.description && <p>{p.description}</p>}
                        <div className="plat-carte__prix">
                          <strong>{formatMontant(p.prix, p.devise)}</strong>
                          {epuise ? (
                            <span className="plat-carte__epuise">Épuisé</span>
                          ) : quantite === 0 ? (
                            <button type="button" className="hotel-bouton hotel-bouton--contour plat-carte__ajouter" onClick={() => changerQuantite(p.id, 1)}>
                              Ajouter
                            </button>
                          ) : (
                            <span className="quantite-controle">
                              <button type="button" aria-label="Retirer" onClick={() => changerQuantite(p.id, -1)}>−</button>
                              <span>{quantite}</span>
                              <button type="button" aria-label="Ajouter" onClick={() => changerQuantite(p.id, 1)}>+</button>
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {produits.length === 0 && (
            <p className="hotel-vide">La carte n'est pas encore disponible — revenez bientôt.</p>
          )}
          {erreur && <p className="erreur">{erreur}</p>}
        </div>

        <aside className="panier" aria-label="Votre commande">
          <h2>Votre commande</h2>
          {lignes.length === 0 ? (
            <p className="panier__vide">Touchez « Ajouter » sur un plat pour commencer.</p>
          ) : (
            <>
              <ul className="panier__lignes">
                {lignes.map((l) => (
                  <li key={l.produit.id}>
                    <span>
                      {l.quantite} × {l.produit.nom}
                    </span>
                    <strong>{formatMontant(Number(l.produit.prix) * l.quantite, l.produit.devise)}</strong>
                  </li>
                ))}
              </ul>
              {(totalUSD > 0 || totalCDF > 0) && (
                <p className="panier__total">
                  Total{" "}
                  <strong>
                    {[totalUSD > 0 ? `${totalUSD.toFixed(2)} $` : null, totalCDF > 0 ? `${Math.round(totalCDF).toLocaleString("fr-FR")} FC` : null]
                      .filter(Boolean)
                      .join(" + ")}
                  </strong>
                </p>
              )}

              <form className="panier__form" onSubmit={envoyer}>
                <label>
                  Votre nom *
                  <input
                    required
                    value={client.nom}
                    onChange={(e) => setClient({ ...client, nom: e.target.value })}
                    placeholder="Nom et prénom"
                  />
                </label>
                <label>
                  Téléphone / WhatsApp
                  <input
                    type="tel"
                    value={client.telephone}
                    onChange={(e) => setClient({ ...client, telephone: e.target.value })}
                    placeholder="+243…"
                  />
                </label>
                <label>
                  N° de chambre (si vous séjournez ici)
                  <input
                    value={client.chambre}
                    onChange={(e) => setClient({ ...client, chambre: e.target.value })}
                    placeholder="Ex. 12"
                  />
                </label>
                <label>
                  Instruction (facultatif)
                  <input
                    value={client.note}
                    onChange={(e) => setClient({ ...client, note: e.target.value })}
                    placeholder="Ex. sans piment"
                  />
                </label>
                <Captcha onJeton={setJetonCaptcha} />
                <button type="submit" className="hotel-bouton hotel-bouton--primaire" disabled={envoi || !client.nom.trim() || (captchaActif && !jetonCaptcha)}>
                  {envoi ? "Envoi…" : "Envoyer la commande"}
                </button>
              </form>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
