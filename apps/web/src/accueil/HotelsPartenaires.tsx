import * as React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listerHotelsPartenaires } from "@hotel-chicago/api-client";
import type { HotelPartenairePublic } from "@hotel-chicago/types";
import { configuration } from "../config";
import { Apparition } from "./animations";
import { EnteteSection } from "./Sections";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("");
}

function CarteHotel({ hotel }: { hotel: HotelPartenairePublic }) {
  const couleur = hotel.couleur ?? "#1769e0";
  return (
    <a href={`/?hotel=${encodeURIComponent(hotel.sousDomaine)}`} className="carte-hotel">
      <span className="carte-hotel__logo" style={{ background: hotel.logoUrl ? "#fff" : couleur }}>
        {hotel.logoUrl ? <img src={hotel.logoUrl} alt="" loading="lazy" /> : initiales(hotel.nom)}
      </span>
      <span className="carte-hotel__nom">{hotel.nom}</span>
      {hotel.adresse && <span className="carte-hotel__adresse">{hotel.adresse}</span>}
      <span className="carte-hotel__lien">Visiter le site →</span>
    </a>
  );
}

/** Hôtels déjà clients. Repli « rejoignez-nous » si la liste est vide ou si
 * l'API est injoignable : cette section ne doit jamais casser la page. */
export function HotelsPartenaires() {
  const [hotels, setHotels] = useState<HotelPartenairePublic[] | null>(null);

  useEffect(() => {
    let annule = false;
    listerHotelsPartenaires({ url: configuration.apiUrl })
      .then((liste) => !annule && setHotels(liste))
      .catch(() => !annule && setHotels([]));
    return () => {
      annule = true;
    };
  }, []);

  return (
    <section id="hotels" className="section section--alt">
      <EnteteSection
        etiquette="Ils nous font confiance"
        titre="Des hôtels qui tournent déjà avec HotelSaver"
        texte="Chaque établissement a son propre site de réservation, à ses couleurs."
      />

      {hotels === null && (
        <div className="hotels-piste" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="carte-hotel carte-hotel--squelette" />
          ))}
        </div>
      )}

      {hotels !== null && hotels.length > 0 && (
        <div className="hotels-piste">
          {hotels.map((h, i) => (
            <Apparition key={h.sousDomaine} delai={Math.min(i, 5) * 0.06}>
              <CarteHotel hotel={h} />
            </Apparition>
          ))}
        </div>
      )}

      {hotels !== null && hotels.length === 0 && (
        <Apparition>
          <div className="hotels-vide">
            <h3>Soyez parmi les premiers</h3>
            <p>Rejoignez la plateforme : votre hôtel apparaîtra ici avec son propre site de réservation.</p>
            <Link to="/inscription" className="bouton-marketing bouton-marketing--primaire">
              Créer le compte de mon hôtel
            </Link>
          </div>
        </Apparition>
      )}
    </section>
  );
}
