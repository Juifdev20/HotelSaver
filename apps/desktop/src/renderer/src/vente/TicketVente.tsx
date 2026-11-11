import * as React from "react";
import { Button } from "@hotel-chicago/ui";
import { formatMontant } from "@hotel-chicago/ui";
import { CircleCheck, Minus, Plus, X } from "lucide-react";
import { Devise, type Produit } from "@hotel-chicago/types";
import { IconeProduit } from "./IconeProduit";

export interface LigneAjout {
  produit: Produit;
  quantite: number;
}

export interface LigneTable {
  cle: string;
  produit: Produit;
  quantite: number;
}

export interface ActionTicket {
  id: string;
  libelle: string;
  icone?: React.ReactNode;
  /** « vert » = encaisser ; « primaire » = bleu ; « contour » = secondaire ; « discret » = lien. */
  style: "vert" | "primaire" | "contour" | "discret";
  raccourci?: string;
  onClick: () => void;
  occupe?: boolean;
  desactive?: boolean;
}

export interface TicketVenteProps {
  titre: string;
  sousTitre?: string;
  /** Produits choisis (avec compteur) : le panier de la nouvelle vente, ou ce qui reste à ajouter à une table. */
  lignesAjout: LigneAjout[];
  libelleAjout: string;
  /** Ce qui est déjà sur la table (à payer), en lecture seule. */
  lignesTable?: LigneTable[];
  dejaPaye?: { articles: number; libelle: string } | null;
  /** Totaux en lignes de texte (une par devise) avec leur libellé. */
  total: { libelle: string; lignes: string[] };
  actions: ActionTicket[];
  erreur?: string | null;
  aide?: string;
  onChanger: (produit: Produit, delta: number) => void;
  onVider?: () => void;
  onDetail?: () => void;
  /** Sous la largeur du bureau : le ticket s'ouvre en volet par-dessus l'écran ; ce bouton le referme. */
  onFermer?: () => void;
  lectureSeule?: boolean;
}

/** Le ticket : à droite de l'écran (grand écran) ou en volet (fenêtre étroite). Mêmes boutons partout : Encaisser, Il reste, Ajouter, Terminer. */
export function TicketVente({ titre, sousTitre, lignesAjout, libelleAjout, lignesTable, dejaPaye, total, actions, erreur, aide, onChanger, onVider, onDetail, onFermer, lectureSeule }: TicketVenteProps) {
  const articlesAjout = lignesAjout.reduce((n, l) => n + l.quantite, 0);
  return (
    <aside className="vente-ticket" aria-label="Ticket">
      <header className="vente-ticket__entete">
        <div>
          <h2 className="vente-ticket__titre">
            {titre}
            {articlesAjout > 0 && <span className="vente-ticket__compte"> · {articlesAjout} article{articlesAjout > 1 ? "s" : ""}</span>}
          </h2>
          {sousTitre && <p className="vente-ticket__sous">{sousTitre}</p>}
        </div>
        <div className="vente-ticket__outils">
          {onDetail && (
            <button type="button" className="vente-lien" onClick={onDetail}>
              Détail
            </button>
          )}
          {onVider && articlesAjout > 0 && !lectureSeule && (
            <button type="button" className="vente-lien vente-lien--danger" onClick={onVider}>
              Vider
            </button>
          )}
          {onFermer && (
            <button type="button" className="vente-fermer" onClick={onFermer} aria-label="Fermer le ticket">
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {dejaPaye && dejaPaye.articles > 0 && (
        <div className="vente-paye" role="status">
          <CircleCheck size={22} aria-hidden="true" />
          <div>
            <strong>
              Déjà payé · {dejaPaye.articles} article{dejaPaye.articles > 1 ? "s" : ""}
            </strong>
            <span>{dejaPaye.libelle}</span>
          </div>
        </div>
      )}

      <div className="vente-ticket__corps">
        {lignesTable && lignesTable.length > 0 && (
          <section>
            <h3 className="vente-ticket__section">Sur la table · à payer</h3>
            <ul className="vente-lignes">
              {lignesTable.map((l) => (
                <li key={l.cle} className="vente-ligne">
                  <IconeProduit produit={l.produit} taille={38} />
                  <span className="vente-ligne__texte">
                    <span className="vente-ligne__nom">{l.produit.nom}</span>
                    <span className="vente-ligne__aide">
                      {l.quantite} × {formatMontant(Number(l.produit.prix), l.produit.devise as Devise)}
                    </span>
                  </span>
                  <b className="vente-ligne__total">{formatMontant(Number(l.produit.prix) * l.quantite, l.produit.devise as Devise)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
        {lignesAjout.length > 0 ? (
          <section>
            {lignesTable && lignesTable.length > 0 && <h3 className="vente-ticket__section">{libelleAjout}</h3>}
            <ul className="vente-lignes">
              {lignesAjout.map(({ produit, quantite }) => (
                <li key={produit.id} className="vente-ligne">
                  <IconeProduit produit={produit} taille={38} />
                  <span className="vente-ligne__texte">
                    <span className="vente-ligne__nom">{produit.nom}</span>
                    <span className="vente-ligne__aide">{formatMontant(Number(produit.prix), produit.devise as Devise)} l'unité</span>
                  </span>
                  <span className="vente-compteur vente-compteur--clair">
                    <button type="button" onClick={() => onChanger(produit, -1)} aria-label={`Ticket : retirer un ${produit.nom}`} disabled={lectureSeule}>
                      <Minus size={15} aria-hidden="true" />
                    </button>
                    <b>{quantite}</b>
                    <button type="button" onClick={() => onChanger(produit, 1)} aria-label={`Ticket : ajouter un ${produit.nom}`} disabled={lectureSeule}>
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </span>
                  <b className="vente-ligne__total">{formatMontant(Number(produit.prix) * quantite, produit.devise as Devise)}</b>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          !(lignesTable && lignesTable.length > 0) && <p className="vente-vide">{lectureSeule ? "Lecture seule." : "Touchez un produit pour l'ajouter."}</p>
        )}
      </div>

      <div className="vente-total">
        <span>{total.libelle}</span>
        <span className="vente-total__montants">
          {total.lignes.map((l) => (
            <strong key={l}>{l}</strong>
          ))}
        </span>
      </div>

      {erreur && (
        <p role="alert" className="vente-erreur">
          {erreur}
        </p>
      )}

      <div className="vente-actions">
        {actions.map((a) => (
          <Button
            key={a.id}
            type="button"
            variant={a.style === "contour" ? "secondary" : "primary"}
            className={`vente-action vente-action--${a.style}`}
            onClick={a.onClick}
            disabled={a.desactive || a.occupe}
          >
            {a.icone}
            <span>{a.occupe ? "…" : a.libelle}</span>
            {a.raccourci && <kbd>{a.raccourci}</kbd>}
          </Button>
        ))}
      </div>
      {aide && <p className="vente-aide">{aide}</p>}
    </aside>
  );
}
