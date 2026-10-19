import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useConditions } from "./conditions";

/** Page publique /conditions (19/10/2026) : le texte publié depuis le super-admin, tel quel (paragraphes conservés). */
export function EcranConditions() {
  const { conditions, erreur } = useConditions();
  return (
    <main className="page-conditions">
      <Link to="/" className="page-conditions__retour">
        <ArrowLeft size={16} aria-hidden="true" /> Accueil
      </Link>
      {erreur && <p role="alert">{erreur}</p>}
      {!conditions && !erreur && <p>Chargement…</p>}
      {conditions && (
        <>
          <p className="page-conditions__version">
            Version {conditions.version} — publiée le {new Date(conditions.publieLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <article className="page-conditions__texte">{conditions.texte}</article>
        </>
      )}
    </main>
  );
}
