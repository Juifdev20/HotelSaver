import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@hotel-chicago/ui";
import { Bluetooth, Check, Printer, RefreshCw, Usb } from "lucide-react";
import { construireTicketDeTest, enteteHotel, type ImprimanteProposee } from "@hotel-chicago/receipts";
import type { ProfilConnecte } from "@hotel-chicago/types";
import type { ConfigurationApp } from "../../../main/config-store";

export interface EcranImprimanteProps {
  /** Le ticket de test porte le nom de l'hôtel de l'utilisateur. */
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
  onEnregistrer: (partielle: Partial<ConfigurationApp>) => void;
  onRetour: () => void;
}

type ResultatTest = { etat: "envoi" } | { etat: "envoye" } | { etat: "erreur"; message: string };

function IconeImprimante({ type, bluetooth }: { type: ImprimanteProposee["type"]; bluetooth: boolean }) {
  if (bluetooth) return <Bluetooth size={20} aria-hidden="true" />;
  if (type === "serie") return <Usb size={20} aria-hidden="true" />;
  return <Printer size={20} aria-hidden="true" />;
}

/**
 * Choix de l'imprimante de tickets. Le poste cherche tout seul les imprimantes installées dans Windows (USB, réseau, Bluetooth) et les ports
 * série ; l'utilisateur choisit dans la liste, imprime un ticket de test, et confirme que le ticket est bien sorti. Plus d'adresse à
 * connaître : la saisie manuelle (réseau, port) reste disponible sous « Réglage avancé ».
 */
export function EcranImprimante({ utilisateur, interfaceImprimante, onEnregistrer, onRetour }: EcranImprimanteProps) {
  const [liste, setListe] = useState<ImprimanteProposee[] | null>(null);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [choisie, setChoisie] = useState<string | null>(interfaceImprimante);
  const [resultats, setResultats] = useState<Record<string, ResultatTest>>({});
  const [confirmee, setConfirmee] = useState<string | null>(null);
  const [saisieAvancee, setSaisieAvancee] = useState(interfaceImprimante && !interfaceImprimante.startsWith("windows:") ? interfaceImprimante : "");
  const [messageAvance, setMessageAvance] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreurListe(null);
    setListe(null);
    window.hotelChicago
      .listerImprimantes()
      .then((trouvees) => {
        setListe(trouvees);
        // Aucune imprimante déjà choisie et une seule qui ressemble à une imprimante de tickets : on la présélectionne.
        setChoisie((actuelle) => {
          if (actuelle) return actuelle;
          const candidates = trouvees.filter((i) => i.recommandee);
          return candidates.length === 1 ? candidates[0]!.interface : null;
        });
      })
      .catch((e: unknown) => {
        setListe([]);
        setErreurListe(e instanceof Error ? e.message : "La recherche des imprimantes a échoué.");
      });
  }, []);

  useEffect(charger, [charger]);

  async function tester(adresse: string) {
    setResultats((r) => ({ ...r, [adresse]: { etat: "envoi" } }));
    setConfirmee(null);
    try {
      await window.hotelChicago.imprimer(adresse, construireTicketDeTest(enteteHotel(utilisateur)));
      setResultats((r) => ({ ...r, [adresse]: { etat: "envoye" } }));
    } catch (e) {
      const message = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Impression impossible.";
      setResultats((r) => ({ ...r, [adresse]: { etat: "erreur", message } }));
    }
  }

  function utiliser(adresse: string) {
    onEnregistrer({ imprimanteInterface: adresse });
    setChoisie(adresse);
    setConfirmee(adresse);
  }

  const nomChoisi = liste?.find((i) => i.interface === interfaceImprimante)?.nom ?? interfaceImprimante;

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Imprimante</h1>
          <p className="hc-text-body page__sous-titre">Choisissez l'imprimante de tickets : le poste la cherche tout seul.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </header>

      {interfaceImprimante && (
        <p className="hc-text-body imprimante-actuelle" role="status">
          <Check size={16} aria-hidden="true" /> Imprimante utilisée pour les tickets : <strong>{nomChoisi}</strong>
        </p>
      )}

      <div className="page__colonnes">
        <div className="carte-formulaire">
          <div className="parametres-ligne">
            <p className="hc-text-body-strong">Imprimantes trouvées</p>
            <Button type="button" variant="secondary" size="sm" onClick={charger} disabled={liste === null}>
              <RefreshCw size={14} aria-hidden="true" /> Actualiser
            </Button>
          </div>

          {liste === null && <p className="hc-text-body texte-discret">Recherche des imprimantes…</p>}
          {erreurListe && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreurListe}
            </p>
          )}
          {liste?.length === 0 && !erreurListe && (
            <p className="hc-text-body texte-discret">
              Aucune imprimante trouvée sur cet ordinateur. Branchez-la ou appairez-la en Bluetooth (voir à droite), puis touchez « Actualiser ».
            </p>
          )}

          <ul className="liste-imprimantes">
            {liste?.map((i) => {
              const test = resultats[i.interface];
              const estChoisie = choisie === i.interface;
              return (
                <li key={i.interface} className={`imprimante-carte${estChoisie ? " imprimante-carte--choisie" : ""}`}>
                  <label className="imprimante-carte__entete">
                    <input type="radio" name="imprimante" checked={estChoisie} onChange={() => setChoisie(i.interface)} />
                    <span className="imprimante-carte__icone">
                      <IconeImprimante type={i.type} bluetooth={i.bluetooth} />
                    </span>
                    <span className="imprimante-carte__texte">
                      <span className="hc-text-body-strong">
                        {i.nom}
                        {i.recommandee && <span className="imprimante-etiquette imprimante-etiquette--ok">Imprimante de tickets</span>}
                        {i.parDefaut && <span className="imprimante-etiquette">Par défaut dans Windows</span>}
                        {i.horsLigne && <span className="imprimante-etiquette imprimante-etiquette--alerte">Windows la voit éteinte</span>}
                      </span>
                      <span className="hc-text-caption texte-discret">{i.detail}</span>
                    </span>
                  </label>

                  {estChoisie && (
                    <div className="imprimante-carte__actions">
                      <Button type="button" variant="secondary" onClick={() => void tester(i.interface)} disabled={test?.etat === "envoi"}>
                        {test?.etat === "envoi" ? "Envoi…" : "Imprimer un ticket de test"}
                      </Button>
                      {test?.etat === "envoye" && confirmee !== i.interface && (
                        <div className="imprimante-confirmation" role="status">
                          <span className="hc-text-body">Le ticket est-il sorti de l'imprimante ?</span>
                          <Button type="button" onClick={() => utiliser(i.interface)}>
                            Oui, utiliser cette imprimante
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => setResultats((r) => ({ ...r, [i.interface]: { etat: "erreur", message: "Rien n'est sorti. Vérifiez que l'imprimante est allumée, qu'il y a du papier et que le cache est bien fermé ; si c'est une imprimante Bluetooth, qu'aucun autre appareil n'y est connecté." } }))}>
                            Non
                          </Button>
                        </div>
                      )}
                      {test?.etat === "erreur" && (
                        <p role="alert" className="hc-text-body texte-erreur">
                          {test.message}
                        </p>
                      )}
                      {confirmee === i.interface && (
                        <p className="hc-text-body texte-succes" role="status">
                          C'est enregistré : les tickets sortiront sur cette imprimante.
                        </p>
                      )}
                      {test === undefined && (
                        <Button type="button" onClick={() => utiliser(i.interface)}>
                          Utiliser sans tester
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <details className="imprimante-avance">
            <summary className="hc-text-body">Réglage avancé (imprimante réseau ou port)</summary>
            <div className="formulaire">
              <label className="hc-text-label" htmlFor="champ-interface-imprimante">
                Adresse
              </label>
              <input
                id="champ-interface-imprimante"
                type="text"
                value={saisieAvancee}
                onChange={(e) => {
                  setSaisieAvancee(e.target.value);
                  setMessageAvance(null);
                }}
                placeholder="tcp://192.168.1.50:9100"
              />
              <p className="hc-text-caption texte-discret">
                Imprimante réseau : tcp://adresse-IP:9100. Port série ou Bluetooth : \\.\COM5 (le numéro est donné par Windows).
              </p>
              {messageAvance && (
                <p className="hc-text-body" role="status">
                  {messageAvance}
                </p>
              )}
              <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
                <Button
                  type="button"
                  onClick={() => {
                    onEnregistrer({ imprimanteInterface: saisieAvancee.trim() || null });
                    setChoisie(saisieAvancee.trim() || null);
                    setMessageAvance("Enregistré.");
                  }}
                >
                  Enregistrer
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!saisieAvancee.trim()}
                  onClick={() => {
                    void window.hotelChicago
                      .imprimer(saisieAvancee.trim(), construireTicketDeTest(enteteHotel(utilisateur)))
                      .then(() => setMessageAvance("Ticket de test envoyé. Vérifiez qu'il est sorti."))
                      .catch((e: unknown) => setMessageAvance(e instanceof Error ? e.message : "Impression impossible."));
                  }}
                >
                  Imprimer un ticket de test
                </Button>
              </div>
            </div>
          </details>
        </div>

        <aside className="carte-formulaire" aria-label="Aide pour trouver l'imprimante">
          <p className="hc-text-body-strong">Vous ne voyez pas votre imprimante ?</p>
          <dl className="aide-adresses">
            <dt className="hc-text-label texte-discret">Imprimante USB (câble)</dt>
            <dd className="hc-text-body">
              Branchez-la, allumez-la et attendez quelques secondes : Windows l'installe tout seul. Touchez ensuite « Actualiser ».
              <span className="hc-text-caption texte-discret">Si elle n'apparaît pas, installez le pilote donné par le fabricant (ou « Generic / Text Only »).</span>
            </dd>
            <dt className="hc-text-label texte-discret">Imprimante Bluetooth</dt>
            <dd className="hc-text-body">
              Allumez-la et appairez-la dans les paramètres Bluetooth de Windows (code 0000 ou 1234 si demandé). Elle apparaît alors ici.
              <span className="hc-text-caption texte-discret">Une imprimante Bluetooth ne parle qu'à un appareil à la fois : déconnectez-la du téléphone avant de l'utiliser sur l'ordinateur.</span>
            </dd>
            <dt className="hc-text-label texte-discret">Imprimante réseau (Wi-Fi ou câble réseau)</dt>
            <dd className="hc-text-body">Si Windows la connaît, elle est dans la liste. Sinon, utilisez le « Réglage avancé » avec son adresse IP.</dd>
          </dl>
          <div style={{ display: "flex", gap: "var(--hc-space-2)", flexWrap: "wrap" }}>
            <Button type="button" variant="secondary" onClick={() => void window.hotelChicago.ouvrirReglages("bluetooth")}>
              <Bluetooth size={16} aria-hidden="true" /> Ouvrir les réglages Bluetooth
            </Button>
            <Button type="button" variant="secondary" onClick={() => void window.hotelChicago.ouvrirReglages("imprimantes")}>
              <Printer size={16} aria-hidden="true" /> Imprimantes Windows
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
