import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { CircleAlert, CircleCheck, Copy, HandCoins, UserPlus } from "lucide-react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { formaterTelephone, lienWhatsApp, lireMontant, montantAbonnement, numeroInternational } from "@hotel-chicago/regles";
import type { ModeRemboursement, MotifRemboursement, RemboursementVue, TraiterRemboursement } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { ouvrirLienSur } from "../liens";
import { copierTexte } from "../copier";
import { dateComplete } from "../dates";
import { useSession } from "../contexteSession";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { BoutonPlein } from "../composants/BoutonPlein";

export interface EcranRemboursementsProps {
  client: ClientApi;
  onRetour: () => void;
  /** Le nombre de remboursements « à faire » vient d'être relu : permet à l'appelant de mettre sa pastille à jour. */
  onCompteur?: (nombre: number) => void;
}

type Onglet = "a-faire" | "historique";

const LIBELLE_MOTIF: Record<MotifRemboursement, string> = {
  ANNULATION_CLIENT: "Le client a annulé",
  ANNULATION_HOTEL: "L'hôtel a annulé",
  NON_PRESENTATION: "Client non présenté",
  CHAMBRE_INDISPONIBLE: "Chambre indisponible",
  AUTRE: "Autre raison",
};

const LIBELLE_MODE: Record<ModeRemboursement, string> = {
  SCANLINKPAY: "Compte ScanLinkPay",
  MOBILE_MONEY: "Mobile Money",
  ESPECES: "Espèces",
  AUTRE: "Autre moyen",
};
const MODES: ModeRemboursement[] = ["SCANLINKPAY", "MOBILE_MONEY", "ESPECES", "AUTRE"];

function libelleMotif(motif: string): string {
  return LIBELLE_MOTIF[motif as MotifRemboursement] ?? "Autre raison";
}

/** « Chambre 12 · arrivée le 20/10/2026 » (les deux morceaux sont facultatifs). */
function descriptionSejour(r: RemboursementVue): string {
  const morceaux: string[] = [];
  if (r.chambreNumero) morceaux.push(`Chambre ${r.chambreNumero}`);
  if (r.dateArrivee) morceaux.push(`arrivée le ${dateComplete(r.dateArrivee)}`);
  return morceaux.join(" · ");
}

function modeParDefaut(r: RemboursementVue): ModeRemboursement {
  return r.destinataireScanLinkPay ? "SCANLINKPAY" : r.destinataireTelephone ? "MOBILE_MONEY" : "ESPECES";
}

/**
 * Remboursements (PATRON) : les acomptes payés en ligne dont la réservation a été annulée. Pour chacun, le patron décide : rendre l'argent (en
 * tout ou en partie) ou le conserver. L'application ne bouge jamais l'argent : le patron l'envoie lui-même depuis l'application ScanLinkPay
 * (ou en Mobile Money / espèces) puis le note ici avec « J'ai remboursé ».
 */
export function EcranRemboursements({ client, onRetour, onCompteur }: EcranRemboursementsProps) {
  const { utilisateur } = useSession();
  const monte = useRef(true);
  const [onglet, setOnglet] = useState<Onglet>("a-faire");
  const [aFaire, setAFaire] = useState<RemboursementVue[] | null>(null);
  const [historique, setHistorique] = useState<RemboursementVue[] | null>(null);
  const [erreurAFaire, setErreurAFaire] = useState<string | null>(null);
  const [erreurHistorique, setErreurHistorique] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [urlScanLinkPay, setUrlScanLinkPay] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [erreurLien, setErreurLien] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  // Feuille d'action : « J'ai remboursé » ou « Conserver l'acompte ».
  const [feuille, setFeuille] = useState<{ type: "rembourser" | "conserver"; item: RemboursementVue } | null>(null);
  const [saisieMontant, setSaisieMontant] = useState("");
  const [mode, setMode] = useState<ModeRemboursement>("SCANLINKPAY");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [erreurFeuille, setErreurFeuille] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  // Un numéro par chargement et par liste : la réponse d'un chargement dépassé (tirer pour actualiser deux fois, action finie entre-temps) est ignorée.
  const numeros = useRef({ aFaire: 0, historique: 0 });
  const charger = useCallback(
    async (cible: Onglet) => {
      const cle = cible === "a-faire" ? "aFaire" : "historique";
      const mien = ++numeros.current[cle];
      try {
        if (cible === "a-faire") {
          const liste = await client.listerRemboursements("A_FAIRE");
          if (!monte.current || mien !== numeros.current.aFaire) return;
          setAFaire(liste);
          setErreurAFaire(null);
          onCompteur?.(liste.length);
        } else {
          const liste = await client.listerRemboursements();
          if (!monte.current || mien !== numeros.current.historique) return;
          setHistorique(
            liste
              .filter((r) => r.statut !== "A_FAIRE")
              .sort((a, b) => (b.traiteLe ?? b.createdAt).localeCompare(a.traiteLe ?? a.createdAt))
          );
          setErreurHistorique(null);
        }
      } catch (e) {
        if (!monte.current) return;
        const texte = messageErreur(e, "Les remboursements n'ont pas pu être chargés. Vérifiez la connexion puis réessayez.");
        if (cible === "a-faire" && mien === numeros.current.aFaire) setErreurAFaire(texte);
        if (cible === "historique" && mien === numeros.current.historique) setErreurHistorique(texte);
      }
    },
    [client, onCompteur]
  );

  // À l'ouverture : la liste à faire (et l'adresse ScanLinkPay, pour inviter un client qui n'a pas de compte).
  useEffect(() => {
    void charger("a-faire");
    let annule = false;
    client
      .reglagesPaiementEnLigne()
      .then((r) => {
        if (!annule && monte.current) setUrlScanLinkPay(r.urlScanLinkPay);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEffect(() => {
    if (onglet === "historique" && historique === null) void charger("historique");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet]);

  async function actualiser() {
    setRafraichissement(true);
    setSucces(null);
    await charger(onglet);
    if (monte.current) setRafraichissement(false);
  }

  function ouvrirFeuille(type: "rembourser" | "conserver", item: RemboursementVue) {
    setSaisieMontant(String(item.montantARembourser));
    setMode(modeParDefaut(item));
    setReference("");
    setNote("");
    setErreurFeuille(null);
    setFeuille({ type, item });
  }

  /** Envoie la décision au serveur (déjà confirmée par l'utilisateur). Les erreurs restent dans la feuille, jamais derrière elle. */
  async function envoyer(item: RemboursementVue, dto: TraiterRemboursement, messageSucces: string) {
    setEnCours(true);
    setErreurFeuille(null);
    try {
      await client.traiterRemboursement(item.id, dto);
      if (!monte.current) return;
      setFeuille(null);
      setSucces(messageSucces);
      setHistorique(null); // à relire à la prochaine ouverture de l'historique
      await charger("a-faire");
    } catch (e) {
      if (monte.current) setErreurFeuille(messageErreur(e, "L'enregistrement n'a pas abouti. Vérifiez la connexion puis réessayez."));
    } finally {
      if (monte.current) setEnCours(false);
    }
  }

  function validerRemboursement() {
    if (!feuille) return;
    const item = feuille.item;
    const lu = lireMontant(saisieMontant, item.devise, { max: 100_000_000 });
    if (!lu.ok) {
      setErreurFeuille(lu.message);
      return;
    }
    if (lu.valeur > item.montantPaye) {
      setErreurFeuille(`Le montant ne peut pas dépasser ce que le client a payé (${montantAbonnement(item.montantPaye, item.devise)}).`);
      return;
    }
    setErreurFeuille(null);
    const montant = lu.valeur;
    const dto: TraiterRemboursement = {
      action: "EFFECTUE",
      montant,
      mode,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    confirmerAction({
      titre: "Confirmer le remboursement ?",
      message: `Vous avez rendu ${montantAbonnement(montant, item.devise)} à ${item.clientNom} (${LIBELLE_MODE[mode]}). Cette décision est définitive.`,
      libelleConfirmer: "Oui, j'ai remboursé",
      libelleRefuser: "Pas encore",
      onConfirmer: () => envoyer(item, dto, `Remboursement de ${montantAbonnement(montant, item.devise)} enregistré pour ${item.clientNom}.`),
    });
  }

  function validerConservation() {
    if (!feuille) return;
    const item = feuille.item;
    setErreurFeuille(null);
    const dto: TraiterRemboursement = { action: "CONSERVE", ...(note.trim() ? { note: note.trim() } : {}) };
    confirmerAction({
      titre: "Conserver l'acompte ?",
      message: `Vous gardez ${montantAbonnement(item.montantPaye, item.devise)} payés par ${item.clientNom}. Le client ne sera pas remboursé. Cette décision est définitive.`,
      libelleConfirmer: "Oui, conserver",
      libelleRefuser: "Non, revenir",
      destructif: true,
      onConfirmer: () => envoyer(item, dto, `Acompte de ${item.clientNom} conservé.`),
    });
  }

  async function copier(texte: string) {
    setCopie(null);
    const ok = await copierTexte(texte);
    if (!ok && monte.current) setCopie("Le numéro n'a pas pu être copié. Appuyez longuement dessus pour le copier.");
  }

  async function inviter(item: RemboursementVue) {
    setErreurLien(null);
    const telephone = item.destinataireTelephone;
    if (!telephone) return;
    const lien = urlScanLinkPay ? ` Voici le lien : ${urlScanLinkPay}` : "";
    const message = `Bonjour ${item.clientNom}, c'est l'hôtel ${utilisateur.hotelNom}. Pour vous rembourser votre acompte tout de suite, créez gratuitement votre compte ScanLinkPay.${lien} Ensuite, envoyez-nous votre numéro ScanLinkPay (SLP-…). Merci !`;
    try {
      await ouvrirLienSur(lienWhatsApp(numeroInternational(telephone) ?? telephone, message));
    } catch {
      if (monte.current) setErreurLien("WhatsApp ne s'est pas ouvert. Appelez ou écrivez directement au client.");
    }
  }

  const liste = onglet === "a-faire" ? aFaire : historique;
  const erreur = onglet === "a-faire" ? erreurAFaire : erreurHistorique;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Remboursements"
        sousTitre={onglet === "a-faire" ? (aFaire ? `${aFaire.length} à faire` : "Chargement…") : "Décisions déjà prises"}
        onRetour={onRetour}
      />

      <View style={styles.onglets} accessibilityRole="tablist">
        {(
          [
            { id: "a-faire", libelle: aFaire && aFaire.length > 0 ? `À faire (${aFaire.length})` : "À faire" },
            { id: "historique", libelle: "Historique" },
          ] as { id: Onglet; libelle: string }[]
        ).map((o) => (
          <Pressable
            key={o.id}
            style={[styles.onglet, onglet === o.id && styles.ongletActif]}
            onPress={() => {
              setOnglet(o.id);
              setSucces(null);
            }}
            accessibilityRole="tab"
            accessibilityLabel={o.libelle}
            accessibilityState={{ selected: onglet === o.id }}
          >
            <Text style={[styles.ongletTexte, onglet === o.id && styles.ongletTexteActif]}>{o.libelle}</Text>
          </Pressable>
        ))}
      </View>

      {succes && (
        <View style={styles.succes} accessibilityLiveRegion="polite">
          <CircleCheck size={18} color={couleurs.succes} />
          <Text style={styles.succesTexte}>{succes}</Text>
        </View>
      )}

      <FlatList
        data={liste ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.liste}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={() => void actualiser()} />}
        ListHeaderComponent={
          <View style={styles.colonne}>
            {erreur && (
              <View style={styles.carte}>
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreur}
                </Text>
                <BoutonPlein libelle="Réessayer" variante="secondaire" onPress={() => void charger(onglet)} />
              </View>
            )}
            {onglet === "a-faire" && liste && liste.length > 0 && (
              <Text style={styles.aideListe}>
                Ces clients ont payé un acompte en ligne, puis leur réservation a été annulée. Décidez pour chacun : rendre l'argent ou le garder.
              </Text>
            )}
            {erreurLien && (
              <Text style={styles.erreur} accessibilityRole="alert">
                {erreurLien}
              </Text>
            )}
            {copie && (
              <Text style={styles.erreur} accessibilityRole="alert">
                {copie}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          liste === null ? (
            erreur ? null : (
              <View style={styles.vide}>
                <ActivityIndicator color={couleurs.bleu} accessibilityLabel="Chargement des remboursements" />
                <Text style={styles.videTexte}>Chargement…</Text>
              </View>
            )
          ) : (
            <View style={styles.vide}>
              <HandCoins size={32} color={couleurs.encreFaible} />
              <Text style={styles.videTitre}>{onglet === "a-faire" ? "Aucun remboursement à faire" : "Aucune décision pour le moment"}</Text>
              <Text style={styles.videTexte}>
                {onglet === "a-faire"
                  ? "Quand un client annule après avoir payé son acompte en ligne, il apparaît ici pour que vous décidiez."
                  : "Les acomptes rendus ou conservés apparaîtront ici."}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          onglet === "a-faire" ? (
            <CarteAFaire
              item={item}
              onRembourser={() => ouvrirFeuille("rembourser", item)}
              onConserver={() => ouvrirFeuille("conserver", item)}
              onCopier={(t) => void copier(t)}
              onInviter={() => void inviter(item)}
            />
          ) : (
            <CarteHistorique item={item} />
          )
        }
      />

      <FeuilleModale
        visible={feuille?.type === "rembourser"}
        onFermer={() => setFeuille(null)}
        titre="J'ai remboursé"
        modifie={feuille?.type === "rembourser" && (reference.trim() !== "" || note.trim() !== "" || (feuille ? saisieMontant !== String(feuille.item.montantARembourser) : false))}
        enCours={enCours}
      >
        {feuille?.type === "rembourser" && (
          <>
            <Text style={styles.texte}>
              {feuille.item.clientNom} a payé {montantAbonnement(feuille.item.montantPaye, feuille.item.devise)} en ligne.
            </Text>
            <Text style={styles.libelle}>Montant rendu ({feuille.item.devise === "USD" ? "dollars" : "francs congolais"})</Text>
            <TextInput
              style={styles.champ}
              value={saisieMontant}
              onChangeText={(t) => {
                setSaisieMontant(t);
                setErreurFeuille(null);
              }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel={`Montant rendu en ${feuille.item.devise === "USD" ? "dollars" : "francs congolais"}, au plus ${montantAbonnement(feuille.item.montantPaye, feuille.item.devise)}`}
            />
            <Text style={styles.aide}>Au plus {montantAbonnement(feuille.item.montantPaye, feuille.item.devise)}. Vous pouvez rendre une partie seulement.</Text>

            <Text style={styles.libelle}>Comment avez-vous remboursé ?</Text>
            <View accessibilityRole="radiogroup" style={styles.rangee}>
              {MODES.map((m) => {
                const actif = mode === m;
                return (
                  <Pressable
                    key={m}
                    style={[styles.choix, actif && styles.choixActif]}
                    onPress={() => setMode(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: actif }}
                    accessibilityLabel={LIBELLE_MODE[m]}
                  >
                    <Text style={[styles.choixTexte, actif && styles.choixTexteActif]}>{LIBELLE_MODE[m]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.libelle}>Référence de l'envoi (facultatif)</Text>
            <TextInput
              style={styles.champ}
              value={reference}
              onChangeText={setReference}
              maxLength={80}
              autoCapitalize="characters"
              placeholder="Numéro de la transaction"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Référence de l'envoi, facultatif"
            />
            <Text style={styles.libelle}>Note (facultatif)</Text>
            <TextInput
              style={[styles.champ, styles.champLong]}
              value={note}
              onChangeText={setNote}
              maxLength={300}
              multiline
              textAlignVertical="top"
              placeholder="Exemple : remboursé après appel du client"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Note, facultatif"
            />
            {erreurFeuille && (
              <Text style={styles.erreur} accessibilityRole="alert">
                {erreurFeuille}
              </Text>
            )}
            <BoutonPlein libelle="Enregistrer le remboursement" variante="succes" onPress={validerRemboursement} occupe={enCours} />
          </>
        )}
      </FeuilleModale>

      <FeuilleModale
        visible={feuille?.type === "conserver"}
        onFermer={() => setFeuille(null)}
        titre="Conserver l'acompte"
        modifie={feuille?.type === "conserver" && note.trim() !== ""}
        enCours={enCours}
      >
        {feuille?.type === "conserver" && (
          <>
            <Text style={styles.texte}>
              Vous gardez les {montantAbonnement(feuille.item.montantPaye, feuille.item.devise)} payés par {feuille.item.clientNom}. Le client ne sera pas remboursé.
            </Text>
            <Text style={styles.libelle}>Pourquoi ? (facultatif)</Text>
            <TextInput
              style={[styles.champ, styles.champLong]}
              value={note}
              onChangeText={setNote}
              maxLength={300}
              multiline
              textAlignVertical="top"
              placeholder="Exemple : annulation tardive, selon nos conditions"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Raison de la conservation, facultatif"
            />
            {erreurFeuille && (
              <Text style={styles.erreur} accessibilityRole="alert">
                {erreurFeuille}
              </Text>
            )}
            <BoutonPlein libelle="Conserver l'acompte" variante="danger" onPress={validerConservation} occupe={enCours} />
          </>
        )}
      </FeuilleModale>
    </View>
  );
}

function CarteAFaire({
  item,
  onRembourser,
  onConserver,
  onCopier,
  onInviter,
}: {
  item: RemboursementVue;
  onRembourser: () => void;
  onConserver: () => void;
  onCopier: (texte: string) => void;
  onInviter: () => void;
}) {
  const sejour = descriptionSejour(item);
  const slp = item.destinataireScanLinkPay;
  const telephone = item.destinataireTelephone;
  const telephoneLisible = telephone ? formaterTelephone(numeroInternational(telephone) ?? telephone) : null;
  const destination = slp ?? telephoneLisible;
  return (
    <View style={styles.carte}>
      <View style={styles.enteteCarte}>
        <Text style={styles.nom}>{item.clientNom}</Text>
        <View style={styles.badgeMotif}>
          <Text style={styles.badgeMotifTexte}>{libelleMotif(item.motif)}</Text>
        </View>
      </View>
      {sejour !== "" && <Text style={styles.sejour}>{sejour}</Text>}

      <View style={styles.montants}>
        <View style={styles.montantBloc}>
          <Text style={styles.montantLibelle}>Payé en ligne</Text>
          <Text style={styles.montantValeur}>{montantAbonnement(item.montantPaye, item.devise)}</Text>
        </View>
        <View style={styles.montantBloc}>
          <Text style={styles.montantLibelle}>Montant proposé</Text>
          <Text style={[styles.montantValeur, { color: couleurs.succes }]}>{montantAbonnement(item.montantARembourser, item.devise)}</Text>
        </View>
      </View>

      <View style={styles.destination}>
        {destination ? (
          <>
            <Text style={styles.destinationLibelle}>{slp ? "Envoyer sur le compte ScanLinkPay du client" : "Envoyer au numéro du client"}</Text>
            <View style={styles.ligneDestination}>
              <Text style={styles.destinationValeur} selectable accessibilityLabel={`${slp ? "Numéro ScanLinkPay" : "Téléphone"} du client : ${destination}`}>
                {destination}
              </Text>
              <Pressable
                style={styles.boutonCopier}
                onPress={() => onCopier(slp ?? (telephone ? (numeroInternational(telephone) ?? telephone) : destination))}
                accessibilityRole="button"
                accessibilityLabel="Copier le numéro"
                accessibilityHint="Ouvre le menu de partage : choisissez Copier"
              >
                <Copy size={16} color={couleurs.bleu} />
                <Text style={styles.boutonCopierTexte}>Copier</Text>
              </Pressable>
            </View>
            <Text style={styles.aide}>Dans l'application ScanLinkPay : Envoyer → numéro du client.</Text>
          </>
        ) : (
          <>
            <Text style={styles.destinationLibelle}>Où envoyer l'argent ?</Text>
            <Text style={styles.texte}>Le client n'a donné ni numéro ScanLinkPay ni téléphone. Contactez-le pour savoir où lui envoyer l'argent.</Text>
          </>
        )}
        {!slp && telephone && (
          <Pressable style={styles.boutonInviter} onPress={onInviter} accessibilityRole="button" accessibilityLabel="Inviter ce client sur ScanLinkPay, par WhatsApp">
            <UserPlus size={16} color={couleurs.succes} />
            <Text style={styles.boutonInviterTexte}>Inviter ce client sur ScanLinkPay</Text>
          </Pressable>
        )}
      </View>

      <BoutonPlein libelle="J'ai remboursé" variante="succes" onPress={onRembourser} libelleAccessible={`J'ai remboursé ${item.clientNom}`} />
      <BoutonPlein libelle="Conserver l'acompte" variante="secondaire" onPress={onConserver} libelleAccessible={`Conserver l'acompte de ${item.clientNom}`} />
    </View>
  );
}

function CarteHistorique({ item }: { item: RemboursementVue }) {
  const rembourse = item.statut === "EFFECTUE";
  const sejour = descriptionSejour(item);
  const quand = item.traiteLe ? dateComplete(item.traiteLe) : null;
  const resume = rembourse
    ? `Rendu : ${montantAbonnement(item.montantARembourser, item.devise)} sur ${montantAbonnement(item.montantPaye, item.devise)} payés${item.mode ? ` · ${LIBELLE_MODE[item.mode]}` : ""}`
    : `Acompte conservé : ${montantAbonnement(item.montantPaye, item.devise)}`;
  return (
    <View
      style={styles.carte}
      accessible
      accessibilityLabel={`${item.clientNom}, ${rembourse ? "remboursé" : "acompte conservé"}. ${resume}${quand ? `, le ${quand}` : ""}`}
    >
      <View style={styles.enteteCarte}>
        <Text style={styles.nom}>{item.clientNom}</Text>
        <View style={[styles.badgeStatut, { backgroundColor: rembourse ? couleurs.succesClair : couleurs.alerteClair }]}>
          {rembourse ? <CircleCheck size={14} color={couleurs.succes} /> : <CircleAlert size={14} color={couleurs.alerte} />}
          <Text style={[styles.badgeStatutTexte, { color: rembourse ? couleurs.succes : couleurs.alerte }]}>{rembourse ? "Remboursé" : "Conservé"}</Text>
        </View>
      </View>
      {sejour !== "" && <Text style={styles.sejour}>{sejour}</Text>}
      <Text style={styles.texte}>{libelleMotif(item.motif)}</Text>
      <Text style={styles.texteGras}>{resume}</Text>
      {quand && <Text style={styles.aide}>Décidé le {quand}</Text>}
      {item.reference && <Text style={styles.aide}>Référence : {item.reference}</Text>}
      {item.note && <Text style={styles.note}>Note : {item.note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  colonne: { gap: espacements.s2 },
  onglets: { flexDirection: "row", paddingHorizontal: espacements.s4, gap: espacements.s2, paddingBottom: espacements.s2 },
  onglet: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  ongletActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  ongletTexte: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  ongletTexteActif: { color: "#fff" },
  succes: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: espacements.s2,
    marginHorizontal: espacements.s4,
    marginBottom: espacements.s2,
    padding: espacements.s3,
    borderRadius: rayons.md,
    backgroundColor: couleurs.succesClair,
  },
  succesTexte: { flex: 1, fontSize: 14, fontWeight: "600", color: couleurs.succes, lineHeight: 20 },
  liste: { padding: espacements.s4, paddingTop: espacements.s2, paddingBottom: espacements.s7, gap: espacements.s3, flexGrow: 1 },
  aideListe: { fontSize: 13, color: couleurs.encreAttenuee, lineHeight: 18 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s3,
  },
  enteteCarte: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: espacements.s2 },
  nom: { flex: 1, fontSize: 17, fontWeight: "700", color: couleurs.encre },
  sejour: { fontSize: 14, color: couleurs.encre },
  badgeMotif: { backgroundColor: couleurs.alerteClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 3, maxWidth: "55%" },
  badgeMotifTexte: { fontSize: 12, fontWeight: "700", color: couleurs.alerte },
  badgeStatut: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 3 },
  badgeStatutTexte: { fontSize: 12, fontWeight: "700" },
  montants: { flexDirection: "row", gap: espacements.s3 },
  montantBloc: { flex: 1, backgroundColor: couleurs.surface100, borderRadius: rayons.md, padding: espacements.s3, gap: 2 },
  montantLibelle: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  montantValeur: { fontSize: 18, fontWeight: "700", color: couleurs.encre },
  destination: { backgroundColor: couleurs.bleuClair, borderRadius: rayons.md, padding: espacements.s3, gap: espacements.s2 },
  destinationLibelle: { fontSize: 13, fontWeight: "700", color: couleurs.navy },
  ligneDestination: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  destinationValeur: { flex: 1, fontSize: 20, fontWeight: "800", color: couleurs.navy, letterSpacing: 0.3 },
  boutonCopier: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s1,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    backgroundColor: couleurs.surface200,
  },
  boutonCopierTexte: { fontSize: 14, fontWeight: "700", color: couleurs.bleu },
  boutonInviter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    minHeight: 44,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.succes,
    backgroundColor: couleurs.surface200,
    paddingHorizontal: espacements.s3,
  },
  boutonInviterTexte: { fontSize: 14, fontWeight: "700", color: couleurs.succes, flexShrink: 1, textAlign: "center" },
  texte: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  texteGras: { fontSize: 14, fontWeight: "700", color: couleurs.encre, lineHeight: 20 },
  note: { fontSize: 13, color: couleurs.violet, fontStyle: "italic" },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, lineHeight: 17 },
  erreur: { fontSize: 13, color: couleurs.danger, fontWeight: "600" },
  vide: { alignItems: "center", gap: espacements.s2, paddingVertical: espacements.s6, paddingHorizontal: espacements.s4 },
  videTitre: { fontSize: 16, fontWeight: "700", color: couleurs.encre, textAlign: "center" },
  videTexte: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center", lineHeight: 20 },
  libelle: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  champ: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    fontSize: 16,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  champLong: { minHeight: 84, paddingTop: espacements.s3 },
  rangee: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  choix: {
    minHeight: 44,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    alignItems: "center",
    justifyContent: "center",
  },
  choixActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  choixTexte: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  choixTexteActif: { color: "#fff" },
});
