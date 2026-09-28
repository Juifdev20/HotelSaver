import * as React from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Printer, RefreshCw, Settings, UserRound } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE, sectionsPlusPourRole } from "../navigation";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EcranParametresMobile } from "./EcranParametresMobile";
import { EcranMenu } from "./EcranMenu";
import { EcranStock } from "./EcranStock";
import { EcranComptesOuverts } from "./EcranComptesOuverts";
import { EcranCaisse } from "./EcranCaisse";
import { EcranCompteCafeteria } from "./EcranCompteCafeteria";
import { EcranSynchronisation } from "./EcranSynchronisation";
import { EcranImprimante } from "./EcranImprimante";
import { EcranUtilisateurs } from "./EcranUtilisateurs";
import { EcranReservations } from "./EcranReservations";
import { EcranClients } from "./EcranClients";
import { EcranTauxChange } from "./EcranTauxChange";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

type VuePlus =
  | { id: "liste" }
  | { id: "parametres" }
  | { id: "synchronisation" }
  | { id: "imprimante" }
  | { id: "menu" }
  | { id: "stock" }
  | { id: "comptes-ouverts" }
  | { id: "caisse" }
  | { id: "compte"; compteId: string }
  | { id: "utilisateurs" }
  | { id: "arrivees-departs" }
  | { id: "clients" }
  | { id: "taux-de-change" };

const VUE_LISTE: VuePlus = { id: "liste" };

/** Onglet "Plus" — profil courant, actions rattachées à l'appareil, et les
 * modules du rôle qui n'ont pas leur propre onglet en bas (Réception
 * au-delà de Chambres, Cafétaria, Administration — voir
 * `sectionsPlusPourRole`). CoquilleOnglets.tsx est un Tab.Navigator plat
 * sans stack imbriqué : le passage à un écran (Paramètres, Menu, Stock...)
 * et son retour à cette liste sont gérés par un état local ici, même
 * principe que le swap d'écrans déjà utilisé au niveau de App.tsx. */
export function EcranPlus() {
  const { client, utilisateur, changerDeProfil } = useSession();
  const sections = sectionsPlusPourRole(utilisateur.role);
  const [vue, setVue] = useState<VuePlus>(VUE_LISTE);
  const etatSync = useSyncEtat();

  if (vue.id === "parametres") {
    return <EcranParametresMobile client={client} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "synchronisation") {
    return <EcranSynchronisation onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "imprimante") {
    return <EcranImprimante onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "menu") {
    return <EcranMenu client={client} utilisateur={utilisateur} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "stock") {
    return <EcranStock client={client} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "comptes-ouverts") {
    return (
      <EcranComptesOuverts
        onRetour={() => setVue(VUE_LISTE)}
        onOuvrirCompte={(compteId) => setVue({ id: "compte", compteId })}
      />
    );
  }
  if (vue.id === "caisse") {
    return (
      <EcranCaisse
        onRetour={() => setVue(VUE_LISTE)}
        onCompteOuvert={(compteId) => setVue({ id: "compte", compteId })}
      />
    );
  }
  if (vue.id === "compte") {
    return (
      <EcranCompteCafeteria client={client} compteId={vue.compteId} onRetour={() => setVue({ id: "comptes-ouverts" })} />
    );
  }
  if (vue.id === "utilisateurs") {
    return <EcranUtilisateurs client={client} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "arrivees-departs") {
    return <EcranReservations segmentInitial="aujourdhui" onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "clients") {
    return <EcranClients onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "taux-de-change") {
    return <EcranTauxChange onRetour={() => setVue(VUE_LISTE)} />;
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.carteProfil}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>{initiales(utilisateur.nom)}</Text>
          </View>
          <Text style={styles.nom}>{utilisateur.nom}</Text>
          <Text style={styles.role}>{LIBELLE_ROLE[utilisateur.role]}</Text>
        </View>

        <Pressable style={styles.ligne} onPress={changerDeProfil}>
          <UserRound size={18} color={couleurs.encre} />
          <Text style={styles.ligneTexte}>Changer de profil</Text>
        </Pressable>

        <Pressable style={styles.ligne} onPress={() => setVue({ id: "parametres" })}>
          <Settings size={18} color={couleurs.encre} />
          <Text style={styles.ligneTexte}>Paramètres</Text>
        </Pressable>

        <Pressable style={styles.ligne} onPress={() => setVue({ id: "synchronisation" })}>
          <RefreshCw size={18} color={couleurs.encre} />
          <Text style={styles.ligneTexte}>Synchronisation</Text>
          {(etatSync.enAttente > 0 || etatSync.conflits > 0) && (
            <View style={styles.badgeCompteur}>
              <Text style={styles.badgeCompteurTexte}>{etatSync.enAttente + etatSync.conflits}</Text>
            </View>
          )}
        </Pressable>

        <Pressable style={styles.ligne} onPress={() => setVue({ id: "imprimante" })}>
          <Printer size={18} color={couleurs.encre} />
          <Text style={styles.ligneTexte}>Imprimante</Text>
        </Pressable>

        {/* Modules qui n'ont pas leur propre onglet en bas (Réception au-delà
            de Chambres, Cafétaria, Administration) — même contenu que la
            barre latérale desktop, voir navigation.ts. Sans ça, un compte
            CAFETARIA ne voit nulle part que son module existe. */}
        {sections.map((section) => (
          <View key={section.titre} style={styles.section}>
            <Text style={styles.titreSection}>{section.titre}</Text>
            {section.entrees.map((entree) => {
              if (!entree.disponible) {
                return (
                  <View key={entree.id} style={[styles.ligne, styles.ligneDesactivee]}>
                    <Text style={[styles.ligneTexte, styles.ligneTexteDesactive]}>{entree.libelle}</Text>
                    <View style={styles.badgeBientot}>
                      <Text style={styles.badgeBientotTexte}>Bientôt</Text>
                    </View>
                  </View>
                );
              }
              return (
                <Pressable
                  key={entree.id}
                  style={styles.ligne}
                  onPress={() =>
                    setVue({
                      id: entree.id as
                        | "caisse"
                        | "comptes-ouverts"
                        | "menu"
                        | "stock"
                        | "utilisateurs"
                        | "arrivees-departs"
                        | "clients"
                        | "taux-de-change",
                    })
                  }
                >
                  <Text style={styles.ligneTexte}>{entree.libelle}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carteProfil: {
    alignItems: "center",
    gap: espacements.s1,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s5,
    marginBottom: espacements.s2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: espacements.s2,
  },
  avatarTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 18 },
  nom: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  role: { fontSize: 13, color: couleurs.encreAttenuee },
  section: { gap: espacements.s2, marginTop: espacements.s2 },
  titreSection: {
    fontSize: 12,
    fontWeight: "700",
    color: couleurs.encreAttenuee,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ligne: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
  },
  ligneDesactivee: { opacity: 0.7 },
  ligneTexte: { flex: 1, fontSize: 15, fontWeight: "600", color: couleurs.encre },
  ligneTexteDesactive: { color: couleurs.encreFaible },
  badgeBientot: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeBientotTexte: { fontSize: 10, fontWeight: "700", color: couleurs.encreAttenuee },
  badgeCompteur: {
    minWidth: 20,
    height: 20,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.alerte,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeCompteurTexte: { fontSize: 11, fontWeight: "700", color: "#fff" },
});
