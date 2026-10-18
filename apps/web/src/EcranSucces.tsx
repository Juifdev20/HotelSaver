import * as React from "react";
import { Link } from "react-router-dom";
import { CreditCard, Monitor, Phone, Smartphone, UserPlus } from "lucide-react";
import { formaterTelephoneRdc } from "@hotel-chicago/types";
import { configuration } from "./config";
import { MiseEnPageAuth } from "./auth/MiseEnPageAuth";
import { OuvrirApplication } from "./accueil/OuvrirApplication";
import { BoutonTelechargement } from "./accueil/BoutonTelechargement";

/** Le site n'a pas de session (DECISIONS.md, Phase 8) : après l'inscription, la
 * suite — se connecter, créer les comptes réception et cafétaria — se passe
 * obligatoirement dans l'application. Cet écran propose de l'ouvrir si elle est déjà
 * installée, sinon de la télécharger. */
export function EcranSucces({ telephone, payerMaintenant = false, sansEssai = false }: { telephone: string; payerMaintenant?: boolean; sansEssai?: boolean }) {
  return (
    <MiseEnPageAuth>
      <div className="carte-auth">
        <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
        <h1 className="carte-auth__titre">Votre hôtel est créé 🎉</h1>
        <p className="carte-auth__sous-titre">Dernière étape : ouvrez l'application HotelSaver pour vous connecter et gérer votre hôtel.</p>

        <ol className="parcours">
          <li>
            <Phone size={20} aria-hidden="true" />
            <span>
              <strong>Connectez-vous avec votre numéro</strong>
              <small>
                Votre identifiant : {formaterTelephoneRdc(telephone)}, avec le mot de passe que vous venez de choisir.
              </small>
            </span>
          </li>
          <li>
            <Smartphone size={20} aria-hidden="true" />
            <span>
              <strong>Ouvrez l'application</strong>
              <small>La connexion se fait dans l'application, sur téléphone ou sur ordinateur.</small>
            </span>
          </li>
          <li>
            <UserPlus size={20} aria-hidden="true" />
            <span>
              <strong>Créez les comptes de votre équipe</strong>
              <small>Dans « Plus › Utilisateurs » : un compte pour la réception, un pour la cafétaria.</small>
            </span>
          </li>
        </ol>

        {payerMaintenant && (
          <div className="parcours-payer">
            <p>
              <CreditCard size={18} aria-hidden="true" />{" "}
              {sansEssai
                ? "Ce numéro a déjà bénéficié d'un essai gratuit : votre hôtel est créé, payez l'abonnement pour commencer."
                : "Vous avez choisi de payer tout de suite."} Payez votre abonnement ici (Mobile Money), avec le numéro et le mot de passe
              que vous venez de créer :
            </p>
            <Link className="bouton-auth" to={`/payer?telephone=${encodeURIComponent(telephone)}`}>
              Payer mon abonnement
            </Link>
          </div>
        )}

        <div className="telechargements">
          <OuvrirApplication telephone={telephone} />
          <BoutonTelechargement url={configuration.urlAndroidApk} icone={Smartphone} libelle="Application Android (téléphone)" detail="Télécharger l'APK" />
          <BoutonTelechargement url={configuration.urlWindows} icone={Monitor} libelle="Application Windows (ordinateur)" />
        </div>
      </div>
    </MiseEnPageAuth>
  );
}
