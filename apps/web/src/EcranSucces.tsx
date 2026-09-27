import * as React from "react";

/** Pas de connexion automatique ici, contrairement au mobile (Phase 6) :
 * apps/web n'est pas un client de gestion d'hôtel — le personnel utilise
 * mobile/desktop, pas un navigateur (voir DECISIONS.md, Phase 8). */
export function EcranSucces({ email }: { email: string }) {
  return (
    <div className="page-centree">
      <div className="carte carte--etroite" style={{ textAlign: "center" }}>
        <h1 className="titre">Compte créé !</h1>
        <p className="sous-titre" style={{ marginTop: 12 }}>
          Vérifiez votre boîte mail (<strong>{email}</strong>) pour confirmer votre adresse, puis connectez-vous
          depuis l'application mobile ou desktop.
        </p>
      </div>
    </div>
  );
}
