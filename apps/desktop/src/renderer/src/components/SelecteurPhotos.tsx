import * as React from "react";
import { useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { UsageImage } from "@hotel-chicago/types";
import { ImagePlus, Loader2, X } from "lucide-react";

export interface SelecteurPhotosProps {
  client: ClientApi;
  usage: UsageImage;
  /** URLs actuelles, dans l'ordre (la première sert de couverture). */
  photos: string[];
  max: number;
  onChange: (photos: string[]) => void;
  /** Appelé pour chaque image envoyée pendant l'édition : le parent s'en sert
   * pour supprimer du stockage celles qui ne seront finalement pas gardées. */
  onEnvoyee?: (url: string) => void;
  libelle?: string;
}

const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

/** Envoi d'images vers l'API (qui les redimensionne et les convertit en WebP :
 * pas besoin de les préparer ici). Le patron voit tout de suite la miniature. */
export function SelecteurPhotos({ client, usage, photos, max, onChange, onEnvoyee, libelle }: SelecteurPhotosProps) {
  const entree = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function choisir(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setErreur(null);
    const restantes = max - photos.length;
    const aEnvoyer = Array.from(fichiers).slice(0, restantes);
    setEnCours(true);
    let courantes = photos;
    try {
      for (const fichier of aEnvoyer) {
        if (!fichier.type.startsWith("image/")) throw new Error(`« ${fichier.name} » n'est pas une image.`);
        if (fichier.size > TAILLE_MAX_OCTETS) throw new Error(`« ${fichier.name} » dépasse 10 Mo.`);
        const corps = new FormData();
        corps.append("fichier", fichier);
        const { url } = await client.televerserImage(corps, usage);
        onEnvoyee?.(url);
        courantes = [...courantes, url];
        onChange(courantes);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnCours(false);
      if (entree.current) entree.current.value = "";
    }
  }

  return (
    <div className="selecteur-photos">
      {libelle && (
        <p className="hc-text-label texte-discret">
          {libelle} ({photos.length}/{max})
        </p>
      )}
      <div className="selecteur-photos__grille">
        {photos.map((url, i) => (
          <div key={url} className="selecteur-photos__vignette">
            <img src={url} alt={`Photo ${i + 1}`} />
            {i === 0 && max > 1 && usage === "chambre" && <span className="selecteur-photos__badge">Couverture</span>}
            <button
              type="button"
              className="selecteur-photos__retirer"
              onClick={() => onChange(photos.filter((p) => p !== url))}
              aria-label={`Retirer la photo ${i + 1}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button type="button" className="selecteur-photos__ajouter" onClick={() => entree.current?.click()} disabled={enCours}>
            {enCours ? <Loader2 size={22} className="selecteur-photos__tourne" /> : <ImagePlus size={22} />}
            <span>{enCours ? "Envoi…" : "Ajouter"}</span>
          </button>
        )}
      </div>
      <input
        ref={entree}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={max - photos.length > 1}
        hidden
        onChange={(e) => void choisir(e.target.files)}
      />
      {erreur && (
        <p className="hc-text-body texte-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  );
}

/** Supprime du stockage les images qui ne sont plus référencées : celles qui
 * existaient avant et ont été retirées, et celles envoyées pendant l'édition
 * puis abandonnées. Jamais bloquant. */
export async function nettoyerImages(client: ClientApi, avant: string[], envoyees: string[], gardees: string[]): Promise<void> {
  const inutiles = [...new Set([...avant, ...envoyees])].filter((u) => !gardees.includes(u));
  await Promise.all(inutiles.map((u) => client.supprimerImage(u).catch(() => undefined)));
}
