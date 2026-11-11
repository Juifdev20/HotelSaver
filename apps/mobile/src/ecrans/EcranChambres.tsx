import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Chambre, Devise, Reservation, Role, StatutChambre, peutOperer } from "@hotel-chicago/types";
import { BedDouble, Brush, CalendarDays, Check, EllipsisVertical, LayoutGrid, List, LogIn, LogOut, Search, User } from "lucide-react-native";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurPhotos, nettoyerImages } from "../composants/SelecteurPhotos";
import { MAX_PHOTOS_CHAMBRE } from "@hotel-chicago/types";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { actionPourChambre, comparerNumeros, compterParStatut, lireMontant, sejoursParChambre, typesDeChambres } from "@hotel-chicago/regles";
import type { ProposeAction, SejoursDeLaChambre } from "@hotel-chicago/regles";
import { dateCourte } from "../dates";
import { parTheme } from "../theme/theme";

const CLE_VUE = "hotelsaver:chambres:vue";

const ICONE_ACTION: Record<ProposeAction["id"], typeof LogIn> = { arrivee: LogIn, depart: LogOut, voir: CalendarDays, propre: Check };

/** Ligne d'information d'une carte : qui est dans la chambre / qui arrive. */
function resumeChambre(chambre: Chambre, sejours?: SejoursDeLaChambre): { ligne1: string | null; ligne2: string; icone: typeof User } {
  const enCours = sejours?.enCours;
  const prochaine = sejours?.prochaine;
  if (chambre.statut === StatutChambre.OCCUPEE) {
    return enCours
      ? { ligne1: enCours.client.nom, ligne2: `jusqu'au ${dateCourte(enCours.dateDepart)}`, icone: User }
      : { ligne1: null, ligne2: "Aucun séjour enregistré", icone: User };
  }
  if (chambre.statut === StatutChambre.RESERVEE) {
    return prochaine
      ? { ligne1: prochaine.client.nom, ligne2: `arrive le ${dateCourte(prochaine.dateArrivee)}`, icone: User }
      : { ligne1: null, ligne2: "Aucun séjour confirmé", icone: User };
  }
  if (chambre.statut === StatutChambre.NETTOYAGE) {
    return { ligne1: "À nettoyer", ligne2: prochaine ? `avant l'arrivée du ${dateCourte(prochaine.dateArrivee)}` : "Puis elle redevient libre", icone: Brush };
  }
  return { ligne1: null, ligne2: prochaine ? `Prochaine arrivée le ${dateCourte(prochaine.dateArrivee)}` : "Prête à accueillir", icone: User };
}

const COULEUR_PAR_STATUT: Record<StatutChambre, { fond: string; texte: string }> = parTheme(() => ({
  [StatutChambre.LIBRE]: { fond: couleurs.succesClair, texte: couleurs.succes },
  [StatutChambre.RESERVEE]: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  [StatutChambre.OCCUPEE]: { fond: couleurs.dangerClair, texte: couleurs.danger },
  [StatutChambre.NETTOYAGE]: { fond: couleurs.violetClair, texte: couleurs.violet },
}));

const LABEL_PAR_STATUT: Record<StatutChambre, string> = {
  [StatutChambre.LIBRE]: "Libre",
  [StatutChambre.RESERVEE]: "Réservée",
  [StatutChambre.OCCUPEE]: "Occupée",
  [StatutChambre.NETTOYAGE]: "Nettoyage",
};

const TOUS_LES_STATUTS = [StatutChambre.LIBRE, StatutChambre.RESERVEE, StatutChambre.OCCUPEE, StatutChambre.NETTOYAGE];

/**
 * Premier écran hors-ligne réel (voir @hotel-chicago/sync-engine) : lit
 * toujours le miroir SQLite local, jamais l'API directement — fonctionne
 * donc sans connexion. Une synchronisation est déclenchée en tâche de fond
 * (montage + tirer vers le bas) mais l'écran ne l'attend jamais pour
 * s'afficher. Changer le statut d'une chambre écrit dans le miroir tout de
 * suite (optimiste, comme `changerStatut` côté desktop) et met la
 * modification en file — elle part dès que possible, avec conflit visible
 * dans "Synchronisation" si le `syncVersion` a bougé entre-temps.
 */
/** `onRetour` : « ‹ Retour » vers l'Accueil (onglet sans stack, cf. EnteteRetour). */
export interface EcranChambresProps {
  onRetour: () => void;
  /** Enregistrer une arrivée dans cette chambre (ouvre « Séjours »). */
  onArrivee?: (chambreId: string) => void;
  /** Facturer le séjour en cours et libérer la chambre. */
  onFacturer?: (reservationId: string) => void;
  /** Ouvrir la fiche du séjour (réservation à venir). */
  onVoirSejour?: (reservationId: string) => void;
}

export function EcranChambres({ onRetour, onArrivee, onFacturer, onVoirSejour }: EcranChambresProps) {
  const { client, moteurSync, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filtreStatut, setFiltreStatut] = useState<StatutChambre | "TOUTES">("TOUTES");
  const [filtreType, setFiltreType] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [vue, setVue] = useState<"cartes" | "liste">("cartes");
  const operer = peutOperer(utilisateur);

  useEffect(() => {
    AsyncStorage.getItem(CLE_VUE)
      .then((v) => {
        if (v === "cartes" || v === "liste") setVue(v);
      })
      .catch(() => undefined);
  }, []);

  function choisirVue(v: "cartes" | "liste") {
    setVue(v);
    AsyncStorage.setItem(CLE_VUE, v).catch(() => undefined);
  }

  const estPatron = utilisateur.role === Role.PATRON;
  const [formulaire, setFormulaire] = useState<"ferme" | "creation" | "edition">("ferme");
  const [chambreEnEdition, setChambreEnEdition] = useState<Chambre | null>(null);
  const [numero, setNumero] = useState("");
  const [type, setType] = useState("");
  const [prix, setPrix] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosAvant, setPhotosAvant] = useState<string[]>([]);
  const [photosEnvoyees, setPhotosEnvoyees] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  const rechargerMiroir = useCallback(() => {
    client
      .listerChambres()
      .then(setChambres)
      .catch(() => setChambres((courant) => courant ?? []));
    // Les séjours servent à afficher qui occupe / va occuper chaque chambre ; leur absence ne bloque pas le tableau.
    client
      .listerReservations()
      .then(setReservations)
      .catch(() => undefined);
  }, [client]);

  useEffect(() => {
    rechargerMiroir();
    moteurSync.forcerSynchronisation();
  }, [rechargerMiroir, moteurSync]);

  // Une synchro (poll périodique ou manuelle) vient de finir : relit le
  // miroir pour refléter d'éventuelles lignes tirées du serveur.
  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerMiroir();
  }, [etatSync.dernierePousseeLe, rechargerMiroir]);

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    rechargerMiroir();
    setRafraichissement(false);
  }

  async function choisirStatut(statut: StatutChambre) {
    if (!chambreChoisie) return;
    const chambre = chambreChoisie;
    setChambreChoisie(null);
    setChambres((liste) => liste?.map((c) => (c.id === chambre.id ? { ...c, statut } : c)) ?? liste);
    try {
      // Écrit dans la base du téléphone ET dans la file d'envoi : marche sans réseau.
      await client.modifierStatutChambre(chambre.id, statut);
    } catch (e) {
      setErreur(messageErreur(e, "Le statut n'a pas pu être changé. Réessayez."));
    }
    rechargerMiroir();
  }

  /** Création/modification/suppression de chambre : actions PATRON en ligne
   * direct (comme la gestion des Utilisateurs) — le pull qui suit remet le
   * miroir à jour ; pour la suppression il faut retirer la ligne locale
   * tout de suite, le pull ne supprime rien (pas de tombstone). */
  async function synchroniserApresAction() {
    rechargerMiroir();
    void moteurSync.forcerSynchronisation();
  }

  function ouvrirCreation() {
    setChambreEnEdition(null);
    setNumero("");
    setType("");
    setPrix("");
    setDevise(Devise.USD);
    setPhotos([]);
    setPhotosAvant([]);
    setPhotosEnvoyees([]);
    setErreur(null);
    setFormulaire("creation");
  }

  /** Fermer sans enregistrer : les images envoyées pendant l'édition n'auront
   * servi à rien, on les retire du stockage. */
  function fermerFormulaire() {
    void nettoyerImages(client, [], photosEnvoyees, photosAvant);
    setFormulaire("ferme");
  }

  function ouvrirEdition(chambre: Chambre) {
    setChambreChoisie(null);
    setChambreEnEdition(chambre);
    setNumero(chambre.numero);
    setType(chambre.type);
    setPrix(chambre.prixParNuit);
    setDevise(chambre.devise);
    setPhotos(chambre.photos ?? []);
    setPhotosAvant(chambre.photos ?? []);
    setPhotosEnvoyees([]);
    setErreur(null);
    setFormulaire("edition");
  }

  async function enregistrerChambre() {
    if (!numero.trim() || !type.trim()) {
      setErreur("Le numéro et le type sont obligatoires.");
      return;
    }
    const prixLu = lireMontant(prix, devise, { max: 100_000_000 });
    if (!prixLu.ok) {
      setErreur(`Prix par nuit : ${prixLu.message}`);
      return;
    }
    const prixNombre = prixLu.valeur;
    setEnCours(true);
    setErreur(null);
    try {
      const donnees = { numero: numero.trim(), type: type.trim(), prixParNuit: prixNombre, devise, photos };
      if (formulaire === "creation") {
        await client.creerChambre(donnees);
      } else if (chambreEnEdition) {
        await client.modifierChambre(chambreEnEdition.id, donnees);
      }
      // Enregistré : on ne garde dans le stockage que les photos conservées.
      void nettoyerImages(client, photosAvant, photosEnvoyees, photos);
      setFormulaire("ferme");
      await synchroniserApresAction();
    } catch (e) {
      setErreur(messageErreur(e, "La chambre n'a pas pu être enregistrée. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  /** Supprimer une chambre est définitif : on la nomme avant (retour U3). */
  function demanderSuppression() {
    if (!chambreEnEdition) return;
    confirmerAction({
      titre: `Supprimer la chambre ${chambreEnEdition.numero} ?`,
      message: `${chambreEnEdition.type} · ${formatMontant(chambreEnEdition.prixParNuit, chambreEnEdition.devise)} par nuit.\nLa chambre disparaît de la liste et ne pourra plus être réservée. Les séjours et factures déjà faits restent dans l'historique.`,
      libelleConfirmer: "Supprimer la chambre",
      libelleRefuser: "Garder",
      destructif: true,
      onConfirmer: supprimerChambre,
    });
  }

  async function supprimerChambre() {
    if (!chambreEnEdition || enCours) return;
    const cible = chambreEnEdition;
    setEnCours(true);
    setErreur(null);
    try {
      await client.supprimerChambre(cible.id);
      setFormulaire("ferme");
      rechargerMiroir();
    } catch (e) {
      setErreur(messageErreur(e, "La chambre n'a pas pu être supprimée. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  /** Un champ du formulaire a été touché : la feuille demande avant d'abandonner (retour U12). */
  const saisieModifiee =
    formulaire === "creation"
      ? numero !== "" || type !== "" || prix !== "" || photos.length > 0
      : chambreEnEdition
        ? numero !== chambreEnEdition.numero ||
          type !== chambreEnEdition.type ||
          prix !== chambreEnEdition.prixParNuit ||
          devise !== chambreEnEdition.devise ||
          photos.join("|") !== photosAvant.join("|")
        : false;

  const sejours = useMemo(() => sejoursParChambre(reservations), [reservations]);
  const compteurs = useMemo(() => compterParStatut(chambres ?? []), [chambres]);
  const types = useMemo(() => typesDeChambres(chambres ?? []), [chambres]);
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (chambres ?? [])
      .filter((c) => filtreStatut === "TOUTES" || c.statut === filtreStatut)
      .filter((c) => !filtreType || c.type.trim() === filtreType)
      .filter((c) => {
        if (!q) return true;
        const s = sejours.get(c.id);
        const nom = (s?.enCours?.client.nom ?? s?.prochaine?.client.nom ?? "").toLowerCase();
        return c.numero.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || nom.includes(q);
      })
      .sort((a, b) => comparerNumeros(a.numero, b.numero));
  }, [chambres, filtreStatut, filtreType, recherche, sejours]);

  function agir(chambre: Chambre, action: ProposeAction) {
    const s = sejours.get(chambre.id);
    setChambreChoisie(null);
    if (action.id === "arrivee") onArrivee?.(chambre.id);
    else if (action.id === "depart" && s?.enCours) onFacturer?.(s.enCours.id);
    else if (action.id === "voir" && s?.prochaine) onVoirSejour?.(s.prochaine.id);
    else if (action.id === "propre") {
      setChambres((liste) => liste?.map((c) => (c.id === chambre.id ? { ...c, statut: StatutChambre.LIBRE } : c)) ?? liste);
      client
        .modifierStatutChambre(chambre.id, StatutChambre.LIBRE)
        .catch((e) => setErreur(messageErreur(e, "Le statut n'a pas pu être changé. Réessayez.")))
        .finally(rechargerMiroir);
    }
  }

  const libelleStatutChip: Record<string, string> = { TOUTES: "Toutes", ...LABEL_PAR_STATUT };

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Chambres"
        sousTitre={chambres ? `${chambres.length} chambre${chambres.length > 1 ? "s" : ""}` : "Chargement…"}
        onRetour={onRetour}
      />

      {erreur && formulaire === "ferme" && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}

      {chambres && chambres.length > 0 && (
        <View style={styles.barre}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(["TOUTES", ...TOUS_LES_STATUTS] as const).map((st) => {
              const actif = filtreStatut === st;
              return (
                <Pressable
                  key={st}
                  style={[styles.chip, actif && styles.chipActif]}
                  onPress={() => setFiltreStatut(st)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif }}
                  accessibilityLabel={`${libelleStatutChip[st]} : ${compteurs[st]}`}
                >
                  <Text style={[styles.chipTexte, actif && styles.chipTexteActif]}>
                    {libelleStatutChip[st]} · {compteurs[st]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.ligneRecherche}>
            <View style={styles.champRecherche}>
              <Search size={16} color={couleurs.encreFaible} />
              <TextInput
                style={styles.saisieRecherche}
                value={recherche}
                onChangeText={setRecherche}
                placeholder="Chambre, type ou client"
                placeholderTextColor={couleurs.encreFaible}
                accessibilityLabel="Chercher une chambre"
              />
            </View>
            <View style={styles.bascule}>
              {([
                ["cartes", LayoutGrid, "Cartes"],
                ["liste", List, "Liste"],
              ] as const).map(([v, Icone, nom]) => (
                <Pressable
                  key={v}
                  style={[styles.basculeBouton, vue === v && styles.basculeBoutonActif]}
                  onPress={() => choisirVue(v)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Vue ${nom}`}
                  accessibilityState={{ checked: vue === v }}
                >
                  <Icone size={18} color={vue === v ? "#fff" : couleurs.encreAttenuee} />
                </Pressable>
              ))}
            </View>
          </View>
          {types.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {types.map(({ type, nombre }) => {
                const actif = filtreType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.chipType, actif && styles.chipActif]}
                    onPress={() => setFiltreType(actif ? null : type)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: actif }}
                  >
                    <Text style={[styles.chipTexte, actif && styles.chipTexteActif]}>
                      {type} · {nombre}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {chambres?.length === 0 && (
        <View style={styles.videConteneur}>
          <BedDouble size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucune chambre enregistrée</Text>
        </View>
      )}
      {chambres && chambres.length > 0 && visibles.length === 0 && (
        <View style={styles.videConteneur}>
          <Search size={28} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucune chambre ne correspond</Text>
        </View>
      )}

      <FlatList
        key={vue}
        data={visibles}
        keyExtractor={(c) => c.id}
        numColumns={vue === "cartes" ? 2 : 1}
        columnWrapperStyle={vue === "cartes" ? styles.colonnes : undefined}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => {
          const tone = COULEUR_PAR_STATUT[item.statut];
          const s = sejours.get(item.id);
          const resume = resumeChambre(item, s);
          const action = actionPourChambre(item, s, operer);
          const IconeAction = action ? ICONE_ACTION[action.id] : null;
          const IconeLigne = resume.icone;
          return (
            <View style={[styles.carte, vue === "cartes" && styles.carteGrille, { borderTopColor: tone.texte }]}>
              <Pressable
                onPress={() => setChambreChoisie(item)}
                style={styles.carteCorps}
                accessibilityRole="button"
                accessibilityLabel={`Chambre ${item.numero}, ${item.type}, ${LABEL_PAR_STATUT[item.statut]}${resume.ligne1 ? `, ${resume.ligne1}` : ""}, ${resume.ligne2}, ${formatMontant(item.prixParNuit, item.devise)} par nuit`}
                accessibilityHint="Ouvre les détails et les autres actions de la chambre"
              >
                <View style={styles.carteEntete}>
                  <Text style={styles.numero}>{item.numero}</Text>
                  <View style={[styles.badge, { backgroundColor: tone.fond }]}>
                    <Text style={[styles.badgeTexte, { color: tone.texte }]}>{LABEL_PAR_STATUT[item.statut]}</Text>
                  </View>
                  <EllipsisVertical size={18} color={couleurs.encreFaible} accessibilityLabel="Plus d'actions" />
                </View>
                <Text style={styles.type} numberOfLines={1}>
                  {item.type} · {formatMontant(item.prixParNuit, item.devise)}
                </Text>
                {resume.ligne1 && (
                  <View style={styles.ligneInfo}>
                    <IconeLigne size={14} color={couleurs.encre} />
                    <Text style={styles.infoPrincipale} numberOfLines={1}>
                      {resume.ligne1}
                    </Text>
                  </View>
                )}
                <Text style={styles.infoSecondaire} numberOfLines={2}>
                  {resume.ligne2}
                </Text>
              </Pressable>
              {action && IconeAction && (
                <Pressable
                  style={styles.boutonAction}
                  onPress={() => agir(item, action)}
                  accessibilityRole="button"
                  accessibilityLabel={`${action.libelle}, chambre ${item.numero}`}
                >
                  <IconeAction size={16} color="#fff" />
                  <Text style={styles.boutonActionTexte}>{action.libelleCourt}</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <FeuilleModale
        visible={!!chambreChoisie}
        onFermer={() => setChambreChoisie(null)}
        titre={chambreChoisie ? `Chambre ${chambreChoisie.numero}` : undefined}
      >
        {chambreChoisie &&
          (() => {
            const s = sejours.get(chambreChoisie.id);
            const resume = resumeChambre(chambreChoisie, s);
            const action = actionPourChambre(chambreChoisie, s, operer);
            const IconeAction = action ? ICONE_ACTION[action.id] : null;
            return (
              <>
                <Text style={styles.feuilleType}>
                  {chambreChoisie.type} · {formatMontant(chambreChoisie.prixParNuit, chambreChoisie.devise)} par nuit
                </Text>
                <Text style={styles.feuilleInfo}>
                  {[resume.ligne1, resume.ligne2].filter(Boolean).join(" — ")}
                </Text>
                {action && IconeAction && (
                  <Pressable
                    style={styles.boutonActionGrand}
                    onPress={() => agir(chambreChoisie, action)}
                    accessibilityRole="button"
                    accessibilityLabel={action.libelle}
                  >
                    <IconeAction size={18} color="#fff" />
                    <Text style={styles.boutonActionTexte}>{action.libelle}</Text>
                  </Pressable>
                )}
              </>
            );
          })()}
        {operer && <Text style={styles.feuilleSection}>Changer le statut à la main</Text>}
        {operer &&
          TOUS_LES_STATUTS.map((statut) => (
            <Pressable
              key={statut}
              style={styles.optionStatut}
              onPress={() => choisirStatut(statut)}
              accessibilityRole="button"
              accessibilityLabel={`Passer la chambre en ${LABEL_PAR_STATUT[statut]}`}
              accessibilityState={{ selected: chambreChoisie?.statut === statut }}
            >
              <View style={[styles.pastilleStatut, { backgroundColor: COULEUR_PAR_STATUT[statut].texte }]} />
              <Text style={styles.optionStatutTexte}>{LABEL_PAR_STATUT[statut]}</Text>
            </Pressable>
          ))}
        {estPatron && chambreChoisie && (
          <Pressable style={styles.optionModifier} onPress={() => ouvrirEdition(chambreChoisie)} accessibilityRole="button">
            <Text style={styles.optionModifierTexte}>Modifier la chambre (numéro, type, prix)</Text>
          </Pressable>
        )}
      </FeuilleModale>

      <FeuilleModale
        visible={formulaire !== "ferme"}
        onFermer={fermerFormulaire}
        titre={formulaire === "creation" ? "Nouvelle chambre" : `Chambre ${chambreEnEdition?.numero ?? ""}`}
        modifie={saisieModifiee}
        enCours={enCours}
      >
        <Text style={styles.champLabel}>Numéro</Text>
        <TextInput style={styles.champ} value={numero} onChangeText={setNumero} accessibilityLabel="Numéro de la chambre" placeholder="Ex. 104" placeholderTextColor={couleurs.encreFaible} />
        <Text style={styles.champLabel}>Type</Text>
        <TextInput style={styles.champ} value={type} onChangeText={setType} accessibilityLabel="Type de la chambre" placeholder="Ex. Standard, Suite…" placeholderTextColor={couleurs.encreFaible} />
        <Text style={styles.champLabel}>Prix par nuit</Text>
        <TextInput style={styles.champ} value={prix} onChangeText={setPrix} accessibilityLabel="Prix par nuit" placeholder="Ex. 45" placeholderTextColor={couleurs.encreFaible} keyboardType="numeric" />
        <SelecteurPhotos
          client={client}
          usage="chambre"
          photos={photos}
          max={MAX_PHOTOS_CHAMBRE}
          onChange={setPhotos}
          onEnvoyee={(url) => setPhotosEnvoyees((liste) => [...liste, url])}
          libelle="Photos (visibles sur le site de l'hôtel)"
        />
        <Text style={styles.champLabel}>Devise</Text>
        <View style={styles.selecteurDevise}>
          {[Devise.USD, Devise.CDF].map((d) => (
            <Pressable
              key={d}
              style={[styles.optionDevise, devise === d && styles.optionDeviseActive]}
              onPress={() => setDevise(d)}
              accessibilityRole="radio"
              accessibilityLabel={`Devise ${d}`}
              accessibilityState={{ checked: devise === d }}
            >
              <Text style={[styles.optionDeviseTexte, devise === d && styles.optionDeviseTexteActif]}>{d}</Text>
            </Pressable>
          ))}
        </View>
        {erreur && (
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreur}
          </Text>
        )}
        <Pressable
          style={styles.boutonEnregistrer}
          onPress={enregistrerChambre}
          disabled={enCours}
          accessibilityRole="button"
          accessibilityState={{ disabled: enCours, busy: enCours }}
        >
          <Text style={styles.boutonEnregistrerTexte}>{enCours ? "…" : "Enregistrer"}</Text>
        </Pressable>
        {formulaire === "edition" && (
          <Pressable
            style={styles.boutonSupprimer}
            onPress={demanderSuppression}
            disabled={enCours}
            accessibilityRole="button"
            accessibilityState={{ disabled: enCours, busy: enCours }}
          >
            <Text style={styles.boutonSupprimerTexte}>{enCours ? "…" : "Supprimer la chambre"}</Text>
          </Pressable>
        )}
      </FeuilleModale>

      {/* FAB bas-droite (PATRON, en ligne) — standard Android, sous le pouce. */}
      {estPatron && (
        <BoutonAjouterFlottant onPress={ouvrirCreation} accessibilityLabel="Nouvelle chambre" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  // 88px de marge basse : le FAB ne recouvre pas la dernière carte.
  liste: { padding: espacements.s4, paddingBottom: 88, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  barre: { paddingTop: espacements.s2, gap: espacements.s2 },
  chips: { paddingHorizontal: espacements.s4, gap: espacements.s2 },
  chip: {
    minHeight: 36,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    justifyContent: "center",
  },
  chipType: {
    minHeight: 32,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface100,
    justifyContent: "center",
  },
  chipActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  chipTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  chipTexteActif: { color: "#fff" },
  ligneRecherche: { flexDirection: "row", alignItems: "center", gap: espacements.s2, paddingHorizontal: espacements.s4 },
  champRecherche: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    minHeight: 44,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
  },
  saisieRecherche: { flex: 1, fontSize: 14, color: couleurs.encre, paddingVertical: 0 },
  bascule: { flexDirection: "row", borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure, overflow: "hidden" },
  basculeBouton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface200 },
  basculeBoutonActif: { backgroundColor: couleurs.bleu },
  colonnes: { gap: espacements.s3 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: couleurs.bordure,
    overflow: "hidden",
  },
  carteGrille: { flex: 1 },
  carteCorps: { padding: espacements.s3, gap: 4, minHeight: 96 },
  ligneInfo: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoPrincipale: { flex: 1, fontSize: 13, fontWeight: "700", color: couleurs.encre },
  infoSecondaire: { fontSize: 12, color: couleurs.encreAttenuee },
  boutonAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: couleurs.bleu,
  },
  boutonActionGrand: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    marginVertical: espacements.s2,
  },
  boutonActionTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  feuilleType: { fontSize: 14, color: couleurs.encreAttenuee },
  feuilleInfo: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  feuilleSection: { marginTop: espacements.s3, fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 4 },
  numero: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  badge: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  type: { fontSize: 14, color: couleurs.encreAttenuee },
  prix: { fontSize: 16, fontWeight: "700", color: couleurs.encre, marginTop: 2 },
  optionStatut: { flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingVertical: espacements.s3, minHeight: 44 },
  pastilleStatut: { width: 12, height: 12, borderRadius: rayons.pill },
  optionStatutTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  optionModifier: {
    marginTop: espacements.s3,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espacements.s3,
    minHeight: 44,
    justifyContent: "center",
  },
  optionModifierTexte: { fontSize: 14, fontWeight: "600", color: couleurs.bleu },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  selecteurDevise: { flexDirection: "row", gap: espacements.s2 },
  optionDevise: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  optionDeviseActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  optionDeviseTexte: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  optionDeviseTexteActif: { color: "#fff" },
  boutonEnregistrer: {
    minHeight: 48,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s2,
  },
  boutonEnregistrerTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonSupprimer: {
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSupprimerTexte: { color: couleurs.danger, fontWeight: "700", fontSize: 14 },
});
