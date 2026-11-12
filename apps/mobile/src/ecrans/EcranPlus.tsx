import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowLeftRight,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ChefHat,
  ChevronRight,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  Wallet,
  LucideIcon,
  Package,
  Printer,
  ReceiptText,
  RefreshCw,
  Settings,
  ShoppingCart,
  Ticket,
  UserCog,
  Globe,
  HandCoins,
  Users,
  UtensilsCrossed,
  Volume2, Download, BellRing } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { consommerRetourReglages, retourReglagesDemande } from "../theme/theme";
import { LIBELLE_ROLE, fonctionManquante, sectionsPlusPourRole } from "../navigation";
import { Role, peutOperer } from "@hotel-chicago/types";
import type { CodeFonction } from "@hotel-chicago/types";
import { bandeauAbonnement } from "@hotel-chicago/regles";
import { useSession } from "../contexteSession";
import { useNotifications } from "../notifications/ContexteNotifications";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { useRemboursementsAFaire } from "../hooks/useRemboursementsAFaire";
import { FonctionNonIncluse } from "../composants/FonctionNonIncluse";
import { EnteteMobile } from "../composants/EnteteMobile";
import { useNombreComptesOuverts } from "../hooks/useNombreComptesOuverts";
import { EcranMiseAJour } from "./EcranMiseAJour";
import { EcranDiagnosticNotifications } from "./EcranDiagnosticNotifications";
import { useMiseAJour } from "../miseAJour/ContexteMiseAJour";
import { EcranParametresMobile } from "./EcranParametresMobile";
import { EcranMenu } from "./EcranMenu";
import { EcranStock } from "./EcranStock";
import { EcranEnCours } from "./EcranEnCours";
import { EcranVente } from "./EcranVente";
import { EcranCompteCafeteria } from "./EcranCompteCafeteria";
import { EcranSynchronisation } from "./EcranSynchronisation";
import { EcranImprimante } from "./EcranImprimante";
import { EcranSons } from "./EcranSons";
import { EcranUtilisateurs } from "./EcranUtilisateurs";
import { EcranSiteHotel } from "./EcranSiteHotel";
import { EcranReservations } from "./EcranReservations";
import { EcranClients } from "./EcranClients";
import { EcranJourneeReception } from "./EcranJourneeReception";
import { EcranTauxChange } from "./EcranTauxChange";
import { EcranJournalRecus } from "./EcranJournalRecus";
import { EcranRapports } from "./EcranRapports";
import { AvatarUtilisateur } from "../composants/AvatarUtilisateur";
import { EcranDepenses } from "./EcranDepenses";
import { EcranInventaire } from "./EcranInventaire";
import { EcranCuisine } from "./EcranCuisine";
import { EcranRetraitCommande } from "./EcranRetraitCommande";
import { EcranAbonnement } from "./EcranAbonnement";
import { EcranRemboursements } from "./EcranRemboursements";
import { EcranPaiementEnLigne } from "./EcranPaiementEnLigne";
import { EcranGuides } from "./EcranGuides";


type VuePlus =
  | { id: "liste" }
  | { id: "parametres" }
  | { id: "synchronisation" }
  | { id: "abonnement" }
  | { id: "paiement-en-ligne" }
  | { id: "remboursements" }
  /** Écran fermé par la formule de l'hôtel (notification, lien) : explique et mène aux formules. */
  | { id: "fonction-non-incluse"; fonction: CodeFonction }
  | { id: "imprimante" }
  | { id: "sons" }
  | { id: "guides" }
  | { id: "menu" }
  | { id: "stock" }
  | { id: "comptes-ouverts" }
  | { id: "caisse" }
  | { id: "retrait-commande" }
  /** retour : écran vers lequel mène « Retour » du détail (liste par défaut). */
  | { id: "compte"; compteId: string; retour?: "comptes-ouverts" | "cuisine" | "retrait-commande"; venteRapide?: boolean }
  | { id: "utilisateurs" }
  | { id: "site-hotel" }
  | { id: "planning" }
  | { id: "journal-journee" }
  | { id: "clients" }
  | { id: "taux-de-change" }
  | { id: "journal-recus" }
  | { id: "rapports" }
  | { id: "depenses" }
  | { id: "inventaire" }
  | { id: "cuisine" }
  | { id: "mise-a-jour" }
  | { id: "diagnostic-notifications" };

const VUE_LISTE: VuePlus = { id: "liste" };

/** Une icône par entrée de menu — même choix que `ICONES` de la coquille
 * desktop (layout/Coquille.tsx) pour que les deux apps parlent pareil. */
const ICONES_MENU: Record<string, LucideIcon> = {
  planning: CalendarDays,
  "journal-journee": BookOpenCheck,
  clients: Users,
  caisse: ShoppingCart,
  "comptes-ouverts": ClipboardList,
  "retrait-commande": Ticket,
  menu: UtensilsCrossed,
  stock: Package,
  cuisine: ChefHat,
  inventaire: ClipboardList,
  "journal-recus": ReceiptText,
  utilisateurs: UserCog,
  "site-hotel": Globe,
  "taux-de-change": Coins,
  rapports: FileText,
  depenses: Wallet,
  abonnement: CreditCard,
  remboursements: HandCoins,
};

/** Ligne de menu standardisée : icône, libellé, chevron (ou badge « Bientôt »). */
function LigneMenu({
  icone: Icone,
  libelle,
  desactive,
  badge,
  onPress,
  libelleAccessible,
}: {
  icone: LucideIcon;
  libelle: string;
  /** Phrase lue par le lecteur d'écran quand le badge porte une information (« 3 à envoyer »). */
  libelleAccessible?: string;
  desactive?: boolean;
  badge?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.ligne, desactive && styles.ligneDesactivee]}
      onPress={onPress}
      disabled={desactive}
      accessibilityRole="button"
      accessibilityLabel={desactive ? `${libelle}, bientôt disponible` : (libelleAccessible ?? libelle)}
      accessibilityState={{ disabled: !!desactive }}
    >
      <Icone size={18} color={desactive ? couleurs.encreFaible : couleurs.encre} />
      <Text style={[styles.ligneTexte, desactive && styles.ligneTexteDesactive]}>{libelle}</Text>
      {badge}
      {!desactive && <ChevronRight size={16} color={couleurs.encreFaible} />}
    </Pressable>
  );
}

/** Tuile du menu « Plus » : icône, nom et pastille (nombre à traiter, « Nouvelle »…). Deux par ligne. */
function Tuile({ icone: Icone, libelle, badge, accent, onPress, libelleAccessible }: { icone: LucideIcon; libelle: string; badge?: React.ReactNode; accent?: boolean; onPress: () => void; libelleAccessible?: string }) {
  return (
    <Pressable style={styles.tuile} onPress={onPress} accessibilityRole="button" accessibilityLabel={libelleAccessible ?? libelle}>
      <View style={[styles.tuileIcone, accent && { backgroundColor: couleurs.alerteClair }]}>
        <Icone size={19} color={accent ? couleurs.alerte : couleurs.bleu} />
      </View>
      <Text style={styles.tuileTexte} numberOfLines={2}>
        {libelle}
      </Text>
      {badge}
    </Pressable>
  );
}

/** Onglet "Plus" — profil courant, actions rattachées à l'appareil, et les
 * modules du rôle qui n'ont pas leur propre onglet en bas (Réception
 * au-delà de Chambres, Cafétaria, Administration — voir
 * `sectionsPlusPourRole`). CoquilleOnglets.tsx est un Tab.Navigator plat
 * sans stack imbriqué : le passage à un écran (Paramètres, Menu, Stock...)
 * et son retour à cette liste sont gérés par un état local ici, même
 * principe que le swap d'écrans déjà utilisé au niveau de App.tsx. */
export function EcranPlus() {
  const { client, utilisateur, changerDeProfil, seDeconnecter, rechargerProfil } = useSession();
  // Après un changement d'apparence (arbre remonté), on rouvre Paramètres là où la personne se trouvait.
  const [vue, setVue] = useState<VuePlus>(() => (retourReglagesDemande() ? { id: "parametres" } : VUE_LISTE));
  useEffect(() => {
    consommerRetourReglages();
  }, []);
  const etatSync = useSyncEtat();
  const { etat: etatMiseAJour, possible: miseAJourPossible } = useMiseAJour();
  const nouvelleVersion = etatMiseAJour === "disponible" || etatMiseAJour === "telechargement" || etatMiseAJour === "prete";
  const { demandePlus, consommerDemandePlus } = useNotifications();
  const alerteAbonnement = bandeauAbonnement(utilisateur.abonnement);
  const sections = sectionsPlusPourRole(utilisateur.role, peutOperer(utilisateur), utilisateur.cuisineActivee === true, utilisateur.fonctions);
  // Pastille « Remboursements » : seulement pour le patron, et seulement si la réception (donc les acomptes) est ouverte par la formule.
  const voitRemboursements = utilisateur.role === Role.PATRON && fonctionManquante("remboursements", utilisateur.role, utilisateur.fonctions) === null;
  const remboursements = useRemboursementsAFaire(client, voitRemboursements, vue.id === "liste");
  const comptesOuverts = useNombreComptesOuverts(utilisateur.role !== Role.RECEPTIONNISTE);

  // Tap sur une notification (stock, arrivées, commande web…) : ouvre
  // directement la vue concernée — le détail du compte si le lien porte un id.
  useEffect(() => {
    if (!demandePlus) return;
    if (demandePlus.vue === "compte") {
      if (demandePlus.compteId) setVue({ id: "compte", compteId: demandePlus.compteId });
    } else if (demandePlus.vue === "fonction-non-incluse") {
      if (demandePlus.fonction) setVue({ id: "fonction-non-incluse", fonction: demandePlus.fonction });
    } else {
      setVue({ id: demandePlus.vue });
    }
    consommerDemandePlus();
  }, [demandePlus, consommerDemandePlus]);

  // Un écran dont la fonction n'est plus ouverte par la formule (profil relu entre-temps, lien ancien) ne s'affiche jamais : on explique à la place.
  const ecranDemande = vue.id === "compte" ? "comptes-ouverts" : vue.id;
  const fonctionFermee = vue.id === "liste" || vue.id === "fonction-non-incluse" ? null : fonctionManquante(ecranDemande, utilisateur.role, utilisateur.fonctions);
  if (vue.id === "fonction-non-incluse") {
    return <FonctionNonIncluse fonction={vue.fonction} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (fonctionFermee) {
    return <FonctionNonIncluse fonction={fonctionFermee} onRetour={() => setVue(VUE_LISTE)} />;
  }

  if (vue.id === "parametres") {
    return (
      <EcranParametresMobile
        client={client}
        utilisateur={utilisateur}
        onChangerProfil={changerDeProfil}
        onProfilModifie={() => void rechargerProfil()}
        onOuvrirAbonnement={() => setVue({ id: "abonnement" })}
        onOuvrirPaiementEnLigne={() => setVue({ id: "paiement-en-ligne" })}
        onSeDeconnecter={seDeconnecter}
        onOuvrirImprimante={() => setVue({ id: "imprimante" })}
        onOuvrirSons={() => setVue({ id: "sons" })}
        onOuvrirDiagnostic={() => setVue({ id: "diagnostic-notifications" })}
        onOuvrirSynchronisation={() => setVue({ id: "synchronisation" })}
        onOuvrirMiseAJour={() => setVue({ id: "mise-a-jour" })}
        onOuvrirGuide={() => setVue({ id: "guides" })}
        onRetour={() => setVue(VUE_LISTE)}
      />
    );
  }
  if (vue.id === "abonnement") {
    return <EcranAbonnement onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "paiement-en-ligne") {
    return <EcranPaiementEnLigne client={client} onRetour={() => setVue({ id: "parametres" })} />;
  }
  if (vue.id === "remboursements") {
    return <EcranRemboursements client={client} onRetour={() => setVue(VUE_LISTE)} onCompteur={remboursements.definir} />;
  }
  if (vue.id === "diagnostic-notifications") {
    return <EcranDiagnosticNotifications onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "mise-a-jour") {
    return <EcranMiseAJour onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "synchronisation") {
    return <EcranSynchronisation onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "sons") {
    return <EcranSons client={client} alertesStock={utilisateur.role === Role.CAFETARIA || utilisateur.role === Role.PATRON} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "imprimante") {
    return <EcranImprimante utilisateur={utilisateur} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "menu") {
    return <EcranMenu client={client} utilisateur={utilisateur} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "stock") {
    return <EcranStock client={client} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "comptes-ouverts") {
    return (
      <EcranEnCours
        onRetour={() => setVue(VUE_LISTE)}
        onOuvrirCompte={(compteId) => setVue({ id: "compte", compteId })}
      />
    );
  }
  if (vue.id === "caisse") {
    // Même écran « Vente » que l'onglet de la cafétaria (le patron y est en lecture seule sauf réglage de l'hôtel).
    return <EcranVente onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "retrait-commande") {
    return (
      <EcranRetraitCommande
        client={client}
        onRetour={() => setVue(VUE_LISTE)}
        onOuvrirCompte={(compteId) => setVue({ id: "compte", compteId, retour: "retrait-commande" })}
      />
    );
  }
  if (vue.id === "compte") {
    return (
      <EcranCompteCafeteria
        client={client}
        compteId={vue.compteId}
        ouvrirAjoutAuDemarrage={vue.venteRapide === true}
        onRetour={() => setVue(vue.retour ? { id: vue.retour } : { id: "comptes-ouverts" })}
      />
    );
  }
  if (vue.id === "site-hotel") {
    return <EcranSiteHotel client={client} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "utilisateurs") {
    return <EcranUtilisateurs client={client} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "planning") {
    return <EcranReservations segmentInitial="planning" onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "journal-journee") {
    return <EcranJourneeReception onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "clients") {
    return <EcranClients onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "taux-de-change") {
    return <EcranTauxChange onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "journal-recus") {
    return <EcranJournalRecus onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "guides") {
    return <EcranGuides onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "rapports") {
    return <EcranRapports onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "depenses") {
    return <EcranDepenses onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "inventaire") {
    return <EcranInventaire client={client} utilisateur={utilisateur} onRetour={() => setVue(VUE_LISTE)} />;
  }
  if (vue.id === "cuisine") {
    return (
      <EcranCuisine
        client={client}
        onRetour={() => setVue(VUE_LISTE)}
        onOuvrirCompte={(compteId) => setVue({ id: "compte", compteId, retour: "cuisine" })}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        {/* Profil + pastille d'abonnement (un toucher ouvre l'écran Abonnement, visible par tous ; seul le patron y paie). */}
        <View style={styles.carteProfil}>
          <AvatarUtilisateur taille={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nom}>
              {utilisateur.nom} · {LIBELLE_ROLE[utilisateur.role]}
            </Text>
            <Text style={styles.role}>{utilisateur.hotelNom}</Text>
          </View>
          {fonctionManquante("abonnement", utilisateur.role, utilisateur.fonctions) === null && (
            <Pressable
              style={[styles.pastilleAbonnement, alerteAbonnement && (alerteAbonnement.niveau === "danger" ? styles.pastilleAbonnementDanger : styles.pastilleAbonnementAlerte)]}
              onPress={() => setVue({ id: "abonnement" })}
              accessibilityRole="button"
              accessibilityLabel={alerteAbonnement ? `Abonnement, ${alerteAbonnement.texte}` : "Abonnement actif. Ouvrir l'abonnement"}
            >
              <Text style={[styles.pastilleAbonnementTexte, alerteAbonnement && { color: "#fff" }]}>{alerteAbonnement ? "À renouveler ›" : "Abonnement actif ›"}</Text>
            </Pressable>
          )}
        </View>

        {/* Modules du rôle, en tuiles par métier — mêmes groupes que la barre latérale du bureau (navigation.ts). */}
        {sections.map((section) => (
          <View key={section.titre} style={styles.section}>
            <Text style={styles.titreSection}>{section.titre.toUpperCase()}</Text>
            <View style={styles.grille}>
              {section.entrees.map((entree) => {
                const pastille =
                  entree.id === "remboursements" && remboursements.nombre > 0
                    ? remboursements.nombre
                    : entree.id === "comptes-ouverts" && comptesOuverts > 0
                      ? comptesOuverts
                      : 0;
                return (
                  <Tuile
                    key={entree.id}
                    icone={ICONES_MENU[entree.id] ?? Settings}
                    libelle={entree.libelle}
                    accent={entree.id === "remboursements"}
                    libelleAccessible={pastille > 0 ? `${entree.libelle}, ${pastille}` : undefined}
                    badge={
                      pastille > 0 ? (
                        <View style={[styles.badgeCompteur, styles.badgeDanger, styles.badgeTuile]}>
                          <Text style={styles.badgeCompteurTexte}>{pastille > 99 ? "99+" : pastille}</Text>
                        </View>
                      ) : undefined
                    }
                    onPress={() => setVue({ id: entree.id as "caisse" | "comptes-ouverts" | "menu" | "stock" | "utilisateurs" | "remboursements" | "site-hotel" | "planning" | "journal-journee" | "clients" | "taux-de-change" | "journal-recus" | "rapports" | "depenses" })}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* Réglages : tout ce qui se règle (apparence, imprimante, sons, notifications, synchronisation, mise à jour, aide) au même endroit. */}
        <Pressable style={styles.reglages} onPress={() => setVue({ id: "parametres" })} accessibilityRole="button" accessibilityLabel={nouvelleVersion ? "Réglages, une mise à jour est disponible" : "Réglages"}>
          <View style={styles.reglagesIcone}>
            <Settings size={21} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reglagesTitre}>Réglages</Text>
            <Text style={styles.reglagesAide}>Apparence, imprimante, sons, notifications, aide</Text>
          </View>
          {nouvelleVersion && (
            <View style={styles.badgeBientot}>
              <Text style={styles.badgeBientotTexte}>Mise à jour</Text>
            </View>
          )}
          <ChevronRight size={18} color={couleurs.encreFaible} />
        </Pressable>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pastilleAbonnement: { paddingHorizontal: espacements.s2, paddingVertical: 5, borderRadius: rayons.pill, backgroundColor: couleurs.succesClair },
  pastilleAbonnementAlerte: { backgroundColor: couleurs.alerte },
  pastilleAbonnementDanger: { backgroundColor: couleurs.danger },
  pastilleAbonnementTexte: { fontSize: 11.5, fontWeight: "800", color: couleurs.succes },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  tuile: { width: "48.6%", minHeight: 56, flexDirection: "row", alignItems: "center", gap: espacements.s2, padding: espacements.s2, paddingHorizontal: espacements.s3, borderRadius: rayons.md + 4, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200 },
  tuileIcone: { width: 34, height: 34, borderRadius: 10, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center" },
  tuileTexte: { flex: 1, fontSize: 13.5, fontWeight: "700", color: couleurs.encre, lineHeight: 17 },
  badgeTuile: { position: "absolute", top: 5, right: 6, marginLeft: 0 },
  reglages: { flexDirection: "row", alignItems: "center", gap: espacements.s3, padding: espacements.s3, borderRadius: rayons.lg, borderWidth: 1.5, borderColor: couleurs.bleu, backgroundColor: couleurs.surface200, marginTop: espacements.s1 },
  reglagesIcone: { width: 38, height: 38, borderRadius: 11, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  reglagesTitre: { fontSize: 15, fontWeight: "800", color: couleurs.encre },
  reglagesAide: { fontSize: 12, color: couleurs.encreAttenuee },
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carteProfil: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
  },
  avatar: { marginBottom: espacements.s2 },
  nom: { fontSize: 15, fontWeight: "800", color: couleurs.encre },
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
  badgeDanger: { backgroundColor: couleurs.danger },
});
