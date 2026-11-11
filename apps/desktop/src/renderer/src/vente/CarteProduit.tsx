import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { estEpuise, limiteDisponible } from "@hotel-chicago/regles";
import { Devise, type Produit } from "@hotel-chicago/types";
import { formatMontant } from "@hotel-chicago/ui";
import { IconeProduit } from "./IconeProduit";

/** Carte d'un produit : « + » ajoute, un compteur apparaît ensuite. Épuisé : grisé ; « Plus que N » prévient quand le stock baisse. */
export function CarteProduit({ produit, quantite, onChanger, lectureSeule = false }: { produit: Produit; quantite: number; onChanger: (delta: number) => void; lectureSeule?: boolean }) {
  const epuise = estEpuise(produit);
  const limite = limiteDisponible(produit);
  const bientotEpuise = !epuise && limite !== null && limite > 0 && limite <= 5;
  const choisi = quantite > 0;
  return (
    <div className={`vente-carte${choisi ? " vente-carte--choisie" : ""}${epuise ? " vente-carte--epuisee" : ""}`}>
      <div className="vente-carte__haut">
        <IconeProduit produit={produit} />
        {bientotEpuise && <span className="vente-puce vente-puce--alerte">Plus que {limite}</span>}
      </div>
      <p className="vente-carte__nom">{produit.nom}</p>
      <div className="vente-carte__bas">
        <strong className="vente-carte__prix">{formatMontant(Number(produit.prix), produit.devise as Devise)}</strong>
        {epuise ? (
          <span className="vente-puce vente-puce--danger">Épuisé</span>
        ) : lectureSeule ? null : !choisi ? (
          <button type="button" className="vente-plus" onClick={() => onChanger(1)} aria-label={`Ajouter ${produit.nom}`}>
            <Plus size={18} aria-hidden="true" />
          </button>
        ) : (
          <span className="vente-compteur">
            <button type="button" onClick={() => onChanger(-1)} aria-label={`Retirer un ${produit.nom}`}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <b aria-label={`${quantite} ${produit.nom}`}>{quantite}</b>
            <button type="button" onClick={() => onChanger(1)} aria-label={`Ajouter un ${produit.nom}`}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
