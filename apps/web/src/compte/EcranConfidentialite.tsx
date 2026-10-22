import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ContactWhatsApp } from "../accueil/ContactWhatsApp";
import "./compte.css";

/** Date du texte ci-dessous : à changer à chaque modification du texte. */
const MISE_A_JOUR = "22 octobre 2026";

/**
 * Politique de confidentialité, page publique /confidentialite (Google Play en demande l'adresse). Écrite d'après ce que
 * l'application collecte vraiment (schéma Prisma, permissions du mobile, prestataires) : une nouvelle collecte = ce texte change.
 */
export function EcranConfidentialite() {
  return (
    <main className="page-doc">
      <Link to="/" className="page-doc__retour">
        <ArrowLeft size={16} aria-hidden="true" /> Accueil
      </Link>
      <h1>Politique de confidentialité</h1>
      <p className="page-doc__date">HotelSaver · mise à jour le {MISE_A_JOUR}</p>

      <h2>En bref</h2>
      <p>
        HotelSaver est le logiciel de gestion de votre hôtel : chambres, réservations, factures, cafétéria, stock et site de réservation.
        Les données de chaque hôtel sont séparées de celles des autres. Nous ne vendons pas les données et nous ne les utilisons pas
        pour de la publicité.
      </p>

      <h2>Ce que nous collectons</h2>
      <ul>
        <li><strong>Le compte du patron et de son équipe</strong> : nom, numéro de téléphone, email (facultatif), rôle (patron, réception, cafétéria) et mot de passe (enregistré chiffré par notre prestataire d'authentification).</li>
        <li><strong>L'hôtel</strong> : nom, adresse, logo, couleurs, photos des chambres, tarifs, réglages et abonnement.</li>
        <li><strong>Les clients de l'hôtel</strong>, saisis par l'hôtel : nom, téléphone, email, type et numéro de pièce d'identité (registre de police), notes, réservations et factures. L'hôtel en est responsable ; HotelSaver les garde pour lui.</li>
        <li><strong>L'activité</strong> : ventes de la cafétéria, stock, dépenses, encaissements, taux de change, rapports.</li>
        <li><strong>Les paiements en ligne</strong> : pour un acompte ou un abonnement payé par Mobile Money ou carte, le montant, le réseau et le numéro (masqué) ; le paiement lui-même est fait par ScanLinkPay.</li>
        <li><strong>Les notifications</strong> : un identifiant technique du téléphone, pour prévenir l'équipe (réservation, commande…).</li>
      </ul>

      <h2>Ce que nous ne collectons pas</h2>
      <ul>
        <li>Pas votre position.</li>
        <li>L'appareil photo sert seulement à scanner le code-barres d'un article ; les photos ne sont prises que si vous en ajoutez (chambres, site).</li>
        <li>Le Bluetooth sert seulement à l'imprimante de tickets.</li>
        <li>Pas de numéro de carte bancaire : il est saisi chez le prestataire de paiement.</li>
      </ul>

      <h2>Pourquoi</h2>
      <ul>
        <li>Faire fonctionner l'hôtel dans l'application, sur l'ordinateur et sur son site de réservation.</li>
        <li>Encaisser les acomptes et les abonnements, et rembourser quand il le faut.</li>
        <li>Sécuriser les comptes et garder la trace des opérations (qui a fait quoi).</li>
        <li>Prévenir l'équipe et le patron (réservations, échéances d'abonnement).</li>
      </ul>

      <h2>Avec qui nous les partageons</h2>
      <ul>
        <li><strong>Supabase</strong> (base de données, comptes, fichiers) et <strong>Render</strong> (serveurs, site) : hébergement.</li>
        <li><strong>ScanLinkPay</strong> : paiements en ligne (Mobile Money et carte).</li>
        <li><strong>Google</strong> (Firebase Cloud Messaging) : notifications sur Android.</li>
        <li><strong>Cloudflare</strong> (Turnstile) : protection des formulaires du site contre les robots.</li>
        <li>Les autorités, seulement lorsque la loi l'exige.</li>
      </ul>
      <p>Les visiteurs du site de l'hôtel voient ce que l'hôtel publie (chambres, prix, menu), jamais les données de ses clients.</p>

      <h2>Combien de temps</h2>
      <p>
        Tant que l'hôtel utilise HotelSaver. Quand le patron supprime son compte, l'hôtel et tout ce qui lui appartient sont effacés :
        comptes de l'équipe, clients, réservations, factures, photos, site. Nous gardons seulement le nom de l'hôtel, sa date de
        suppression et la raison du départ, et une empreinte non lisible du numéro du patron pour que l'essai gratuit ne serve qu'une fois.
      </p>

      <h2>Vos droits</h2>
      <p>
        Le patron peut consulter et corriger les informations dans l'application, et{" "}
        <Link to="/supprimer-mon-compte"><strong>supprimer son compte et son hôtel</strong></Link> à tout moment. Un client d'un hôtel
        qui veut faire corriger ou effacer sa fiche s'adresse à l'hôtel. Pour toute autre demande :
      </p>
      <ContactWhatsApp />

      <h2>Changements</h2>
      <p>Si cette politique change, la date en haut de la page change aussi.</p>
    </main>
  );
}
