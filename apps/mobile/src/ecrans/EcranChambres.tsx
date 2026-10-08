import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { Chambre, Devise, Role, StatutChambre, peutOperer } from "@hotel-chicago/types";
import { BedDouble } from "lucide-react-native";
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
import { listerChambresMiroir, ecrireStatutChambreLocal, supprimerChambreLocale } from "../stockage/chambresMirroir";

const COULEUR_PAR_STATUT: Record<StatutChambre, { fond: string; texte: string }> = {
  [StatutChambre.LIBRE]: { fond: couleurs.succesClair, texte: couleurs.succes },
  [StatutChambre.RESERVEE]: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  [StatutChambre.OCCUPEE]: { fond: couleurs.dangerClair, texte: couleurs.danger },
  [StatutChambre.NETTOYAGE]: { fond: couleurs.violetClair, texte: couleurs.violet },
};

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
export function EcranChambres({ onRetour }: { onRetour: () => void }) {
  const { client, moteurSync, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);

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
    listerChambresMiroir()
      .then(setChambres)
      .catch((e: Error) => setErreur(e.message));
  }, []);

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
    await ecrireStatutChambreLocal(chambre.id, statut);
    setChambres((liste) => liste?.map((c) => (c.id === chambre.id ? { ...c, statut } : c)) ?? liste);
    await moteurSync.mettreEnFile({
      entiteType: "Chambre",
      localId: chambre.id,
      remoteId: chambre.id,
      operation: "UPDATE",
      payload: { statut },
      baseSyncVersion: chambre.syncVersion,
    });
  }

  /** Création/modification/suppression de chambre : actions PATRON en ligne
   * direct (comme la gestion des Utilisateurs) — le pull qui suit remet le
   * miroir à jour ; pour la suppression il faut retirer la ligne locale
   * tout de suite, le pull ne supprime rien (pas de tombstone). */
  async function synchroniserApresAction() {
    await moteurSync.forcerSynchronisation();
    rechargerMiroir();
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
    const prixNombre = Number(prix.replace(/\s/g, "").replace(",", "."));
    if (!numero.trim() || !type.trim()) {
      setErreur("Le numéro et le type sont obligatoires.");
      return;
    }
    if (Number.isNaN(prixNombre) || prixNombre <= 0) {
      setErreur("Le prix par nuit doit être un nombre positif.");
      return;
    }
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
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerChambre() {
    if (!chambreEnEdition) return;
    const cible = chambreEnEdition;
    setEnCours(true);
    setErreur(null);
    try {
      await client.supprimerChambre(cible.id);
      await supprimerChambreLocale(cible.id);
      setFormulaire("ferme");
      rechargerMiroir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Chambres"
        sousTitre={chambres ? `${chambres.length} chambre${chambres.length > 1 ? "s" : ""}` : "Chargement…"}
        onRetour={onRetour}
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {chambres?.length === 0 && (
        <View style={styles.videConteneur}>
          <BedDouble size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucune chambre enregistrée</Text>
        </View>
      )}

      <FlatList
        data={chambres ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => {
          const tone = COULEUR_PAR_STATUT[item.statut];
          return (
            <Pressable style={styles.carte} onPress={() => setChambreChoisie(item)}>
              <View style={styles.carteEntete}>
                <Text style={styles.numero}>{item.numero}</Text>
                <View style={[styles.badge, { backgroundColor: tone.fond }]}>
                  <Text style={[styles.badgeTexte, { color: tone.texte }]}>{LABEL_PAR_STATUT[item.statut]}</Text>
                </View>
              </View>
              <Text style={styles.type}>{item.type}</Text>
              <Text style={styles.prix}>{formatMontant(item.prixParNuit, item.devise)}</Text>
            </Pressable>
          );
        }}
      />

      <FeuilleModale
        visible={!!chambreChoisie}
        onFermer={() => setChambreChoisie(null)}
        titre={chambreChoisie ? `Chambre ${chambreChoisie.numero}` : undefined}
      >
        {peutOperer(utilisateur) &&
          TOUS_LES_STATUTS.map((statut) => (
            <Pressable key={statut} style={styles.optionStatut} onPress={() => choisirStatut(statut)}>
              <View style={[styles.pastilleStatut, { backgroundColor: COULEUR_PAR_STATUT[statut].texte }]} />
              <Text style={styles.optionStatutTexte}>{LABEL_PAR_STATUT[statut]}</Text>
            </Pressable>
          ))}
        {estPatron && chambreChoisie && (
          <Pressable style={styles.optionModifier} onPress={() => ouvrirEdition(chambreChoisie)} disabled={!etatSync.enLigne}>
            <Text style={styles.optionModifierTexte}>Modifier la chambre (numéro, type, prix)</Text>
          </Pressable>
        )}
      </FeuilleModale>

      <FeuilleModale
        visible={formulaire !== "ferme"}
        onFermer={fermerFormulaire}
        titre={formulaire === "creation" ? "Nouvelle chambre" : `Chambre ${chambreEnEdition?.numero ?? ""}`}
      >
        <Text style={styles.champLabel}>Numéro</Text>
        <TextInput style={styles.champ} value={numero} onChangeText={setNumero} placeholder="Ex. 104" placeholderTextColor={couleurs.encreFaible} />
        <Text style={styles.champLabel}>Type</Text>
        <TextInput style={styles.champ} value={type} onChangeText={setType} placeholder="Ex. Standard, Suite…" placeholderTextColor={couleurs.encreFaible} />
        <Text style={styles.champLabel}>Prix par nuit</Text>
        <TextInput style={styles.champ} value={prix} onChangeText={setPrix} placeholder="Ex. 45" placeholderTextColor={couleurs.encreFaible} keyboardType="numeric" />
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
            >
              <Text style={[styles.optionDeviseTexte, devise === d && styles.optionDeviseTexteActif]}>{d}</Text>
            </Pressable>
          ))}
        </View>
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        <Pressable style={styles.boutonEnregistrer} onPress={enregistrerChambre} disabled={enCours}>
          <Text style={styles.boutonEnregistrerTexte}>{enCours ? "…" : "Enregistrer"}</Text>
        </Pressable>
        {formulaire === "edition" && (
          <Pressable style={styles.boutonSupprimer} onPress={supprimerChambre} disabled={enCours}>
            <Text style={styles.boutonSupprimerTexte}>{enCours ? "…" : "Supprimer la chambre"}</Text>
          </Pressable>
        )}
      </FeuilleModale>

      {/* FAB bas-droite (PATRON, en ligne) — standard Android, sous le pouce. */}
      {estPatron && (
        <BoutonAjouterFlottant onPress={ouvrirCreation} disabled={!etatSync.enLigne} accessibilityLabel="Nouvelle chambre" />
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
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  numero: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  badge: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  type: { fontSize: 14, color: couleurs.encreAttenuee },
  prix: { fontSize: 16, fontWeight: "700", color: couleurs.encre, marginTop: 2 },
  optionStatut: { flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingVertical: espacements.s3 },
  pastilleStatut: { width: 12, height: 12, borderRadius: rayons.pill },
  optionStatutTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  optionModifier: {
    marginTop: espacements.s3,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espacements.s3,
  },
  optionModifierTexte: { fontSize: 14, fontWeight: "600", color: couleurs.bleu },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  selecteurDevise: { flexDirection: "row", gap: espacements.s2 },
  optionDevise: {
    flex: 1,
    height: 40,
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
    height: 48,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s2,
  },
  boutonEnregistrerTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonSupprimer: {
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSupprimerTexte: { color: couleurs.danger, fontWeight: "700", fontSize: 14 },
});
