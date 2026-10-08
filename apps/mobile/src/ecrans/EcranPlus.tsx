import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowLeftRight,
  BookOpenCheck,
  CalendarDays,
  ChefHat,
  ChevronRight,
  ClipboardList,
  Coins,
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
  Users,
  UtensilsCrossed,
} from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE, sectionsPlusPourRole } from "../navigation";
import { peutOperer } from "@hotel-chicago/types";
import { useSession } from "../contexteSession";
import { useNotifications } from "../notifications/ContexteNotifications";
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
import { EcranSiteHotel } from "./EcranSiteHotel";
import { EcranReservations } from "./EcranReservations";
import { EcranClients } from "./EcranClients";
import { EcranJourneeReception } from "./EcranJourneeReception";
import { EcranTauxChange } from "./EcranTauxChange";
import { EcranJournalRecus } from "./EcranJournalRecus";
import { EcranRapports } from "./EcranRapports";
import { EcranDepenses } from "./EcranDepenses";
import { EcranInventaire } from "./EcranInventaire";
import { EcranCuisine } from "./EcranCuisine";
import { EcranRetraitCommande } from "./EcranRetraitCommande";

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
  | { id: "retrait-commande" }
  /** retour : écran vers lequel mène « Retour » du détail (liste par défaut). */
  | { id: "compte"; compteId: string; retour?: "comptes-ouverts" | "cuisine" | "retrait-commande"; venteRapide?: boolean }
  | { id: "utilisateurs" }
  | { id: "site-hotel" }
  | { id: "arrivees-departs" }
  | { id: "planning" }
  | { id: "journal-journee" }
  | { id: "clients" }
  | { id: "taux-de-change" }
  | { id: "journal-recus" }
  | { id: "rapports" }
  | { id: "depenses" }
  | { id: "inventaire" }
  | { id: "cuisine" };

const VUE_LISTE: VuePlus = { id: "liste" };

/** Une icône par entrée de menu — même choix que `ICONES` de la coquille
 * desktop (layout/Coquille.tsx) pour que les deux apps parlent pareil. */
const ICONES_MENU: Record<string, LucideIcon> = {
  "arrivees-departs": ArrowLeftRight,
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
};

/** Ligne de menu standardisée : icône, libellé, chevron (ou badge « Bientôt »). */
function LigneMenu({
  icone: Icone,
  libelle,
  desactive,
  badge,
  onPress,
}: {
  icone: LucideIcon;
  libelle: string;
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
    >
      <Icone size={18} color={desactive ? couleurs.encreFaible : couleurs.encre} />
      <Text style={[styles.ligneTexte, desactive && styles.ligneTexteDesactive]}>{libelle}</Text>
      {badge}
      {!desactive && <ChevronRight size={16} color={couleurs.encreFaible} />}
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
  const sections = sectionsPlusPourRole(utilisateur.role, peutOperer(utilisateur), utilisateur.cuisineActivee === true);
  const [vue, setVue] = useState<VuePlus>(VUE_LISTE);
  const etatSync = useSyncEtat();
  const { demandePlus, consommerDemandePlus } = useNotifications();

  // Tap sur une notification (stock, arrivées, commande web…) : ouvre
  // directement la vue concernée — le détail du compte si le lien porte un id.
  useEffect(() => {
    if (!demandePlus) return;
    if (demandePlus.vue === "compte") {
      if (demandePlus.compteId) setVue({ id: "compte", compteId: demandePlus.compteId });
    } else {
      setVue({ id: demandePlus.vue });
    }
    consommerDemandePlus();
  }, [demandePlus, consommerDemandePlus]);

  if (vue.id === "parametres") {
    return (
      <EcranParametresMobile
        client={client}
        utilisateur={utilisateur}
        onChangerProfil={changerDeProfil}
        onProfilModifie={() => void rechargerProfil()}
        onSeDeconnecter={seDeconnecter}
        onRetour={() => setVue(VUE_LISTE)}
      />
    );
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
        onCompteOuvert={(compteId, options) => setVue({ id: "compte", compteId, venteRapide: options?.venteRapide })}
      />
    );
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
  if (vue.id === "arrivees-departs") {
    return <EcranReservations segmentInitial="aujourdhui" onRetour={() => setVue(VUE_LISTE)} />;
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
        <View style={styles.carteProfil}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>{initiales(utilisateur.nom)}</Text>
          </View>
          <Text style={styles.nom}>{utilisateur.nom}</Text>
          <Text style={styles.role}>{LIBELLE_ROLE[utilisateur.role]}</Text>
        </View>

        {/* Modules qui n'ont pas leur propre onglet en bas (Réception au-delà
            de Chambres, Cafétaria, Administration) — même contenu que la
            barre latérale desktop, voir navigation.ts. Sans ça, un compte
            CAFETARIA ne voit nulle part que son module existe. */}
        {sections.map((section) => (
          <View key={section.titre} style={styles.section}>
            <Text style={styles.titreSection}>{section.titre}</Text>
            {section.entrees.map((entree) => (
              <LigneMenu
                key={entree.id}
                icone={ICONES_MENU[entree.id] ?? Settings}
                libelle={entree.libelle}
                desactive={!entree.disponible}
                badge={
                  !entree.disponible ? (
                    <View style={styles.badgeBientot}>
                      <Text style={styles.badgeBientotTexte}>Bientôt</Text>
                    </View>
                  ) : undefined
                }
                onPress={() =>
                  setVue({
                    id: entree.id as
                      | "caisse"
                      | "comptes-ouverts"
                      | "retrait-commande"
                      | "cuisine"
                      | "menu"
                      | "stock"
                      | "inventaire"
                      | "utilisateurs"
                      | "site-hotel"
                      | "arrivees-departs"
                      | "planning"
                      | "journal-journee"
                      | "clients"
                      | "taux-de-change"
                      | "journal-recus"
                      | "rapports"
                      | "depenses",
                  })
                }
              />
            ))}
          </View>
        ))}

        {/* Réglages propres à cet appareil — section à part, après les
            modules métier, comme « Paramètres » tout en bas de la barre
            latérale desktop. */}
        <View style={styles.section}>
          <Text style={styles.titreSection}>Appareil</Text>
          <LigneMenu icone={Settings} libelle="Paramètres" onPress={() => setVue({ id: "parametres" })} />
          <LigneMenu icone={Printer} libelle="Imprimante" onPress={() => setVue({ id: "imprimante" })} />
          <LigneMenu
            icone={RefreshCw}
            libelle="Synchronisation"
            onPress={() => setVue({ id: "synchronisation" })}
            badge={
              etatSync.enAttente > 0 || etatSync.conflits > 0 ? (
                <View style={styles.badgeCompteur}>
                  <Text style={styles.badgeCompteurTexte}>{etatSync.enAttente + etatSync.conflits}</Text>
                </View>
              ) : undefined
            }
          />
        </View>

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
