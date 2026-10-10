import * as React from "react";

interface Etat {
  erreur: Error | null;
}

/**
 * Filet de sécurité : sans lui, une exception pendant l'affichage d'un écran démonte tout
 * l'arbre React et la fenêtre devient BLANCHE, sans aucune explication. Ici l'utilisateur voit
 * un message clair et peut recharger l'application (ses données sont sur le serveur : rien
 * n'est perdu).
 */
export class FrontiereErreur extends React.Component<{ children: React.ReactNode }, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Erreur d'affichage :", erreur, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="hc-page-centree" role="alert">
        <div className="hc-ecran-erreur">
          <h1 className="hc-text-heading">Un problème est survenu</h1>
          <p className="hc-text-body texte-discret">
            L'écran n'a pas pu s'afficher. Rechargez l'application ; si le problème revient, notez ce que vous faisiez
            juste avant et signalez-le.
          </p>
          {/* Message d'exception brut : réservé à qui doit le signaler, replié par défaut. */}
          <details>
            <summary className="hc-text-caption texte-discret">Détails techniques</summary>
            <pre className="hc-ecran-erreur__detail">{this.state.erreur.message}</pre>
          </details>
          <button type="button" className="hc-ecran-erreur__bouton" onClick={() => window.location.reload()}>
            Recharger l'application
          </button>
        </div>
      </div>
    );
  }
}
