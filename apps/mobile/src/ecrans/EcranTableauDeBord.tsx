import * as React from "react";
import { useEffect, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import type { ClientApi } from "@hotel-chicago/api-client";
import {
  Devise,
  Occupation,
  Produit,
  RecetteDuJour,
  Role,
  ProfilConnecte,
  VentesRecentes,
} from "@hotel-chicago/types";
import {
  Banknote,
  BedDouble,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  Coffee,
  ConciergeBell,
  CreditCard,
  Crown,
  Package,
  ReceiptText,
  UtensilsCrossed,
  Wallet,
} from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { Donut } from "../composants/Donut";
import { EnteteMobile } from "../composants/EnteteMobile";
import { AvatarUtilisateur } from "../composants/AvatarUtilisateur";
import { LIBELLE_ROLE } from "../navigation";
import { useNotifications } from "../notifications/ContexteNotifications";
import { useDonnee } from "../hooks/useDonnee";

export interface EcranTableauDeBordProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  onAllerAuxChambres: () => void;
}

function dateDuJour(date: Date): string {
  const texte = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function heureCourante(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

/** Horloge vivante (secondes comprises) isolée dans ce hook : seul le petit
 * sous-arbre qui l'utilise se re-rend chaque seconde, pas tout le tableau
 * de bord. */
function useHorlogeVivante(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const identifiant = setInterval(() => setMaintenant(new Date()), 1000);
    return () => clearInterval(identifiant);
  }, []);
  return maintenant;
}

function Carte({ icone, toneClaire, libelle, valeur, precision, pleineLargeur = false }: {
  icone: React.ReactNode;
  tone: string;
  toneClaire: string;
  libelle: string;
  valeur: string;
  precision?: string;
  /** « Dont chambres / cafétaria » : sur toute la largeur, comme la maquette. */
  pleineLargeur?: boolean;
}) {
  return (
    <View style={[styles.carte, pleineLargeur && styles.cartePleine]}>
      <View style={[styles.carteIcone, { backgroundColor: toneClaire }]}>{icone}</View>
      <Text style={styles.carteLibelle}>{libelle}</Text>
      <Text style={styles.carteValeur}>{valeur}</Text>
      {precision && <Text style={styles.cartePrecision}>{precision}</Text>}
    </View>
  );
}

const ICONE_ROLE: Record<Role, typeof Crown> = {
  [Role.PATRON]: Crown,
  [Role.RECEPTIONNISTE]: ConciergeBell,
  [Role.CAFETARIA]: UtensilsCrossed,
};

/** « Bonjour, {nom} » + puce du rôle + nom de l'hôtel connecté — jamais en
 * dur : tout vient du profil (`GET /auth/me`), pour chaque rôle et chaque hôtel. */
function CarteAccueil({ utilisateur }: { utilisateur: ProfilConnecte }) {
  const IconeRole = ICONE_ROLE[utilisateur.role];
  return (
    <View style={styles.carteAccueil}>
      <AvatarUtilisateur taille={44} />
      <View style={styles.accueilTextes}>
        <Text style={styles.bonjour} numberOfLines={1}>
          Bonjour, {utilisateur.nom}
        </Text>
        <View style={styles.puceRole}>
          <IconeRole size={13} color={couleurs.bleu} />
          <Text style={styles.puceRoleTexte}>{LIBELLE_ROLE[utilisateur.role]}</Text>
        </View>
      </View>
      <View style={styles.pastilleHotel}>
        <Building2 size={16} color={couleurs.encreAttenuee} />
        <Text style={styles.pastilleHotelTexte} numberOfLines={1}>
          {utilisateur.hotelNom}
        </Text>
      </View>
    </View>
  );
}

export function EcranTableauDeBord({ client, utilisateur, onAllerAuxChambres }: EcranTableauDeBordProps) {
  const { ouvrirEcran } = useNotifications();
  const voitChambres = utilisateur.role !== Role.CAFETARIA;
  const voitStock = utilisateur.role !== Role.RECEPTIONNISTE;

  const recette = useDonnee<RecetteDuJour>(() => client.recetteDuJour(), "recette");
  const occupation = useDonnee<Occupation>(voitChambres ? () => client.occupation() : null, "occupation");
  const stockBas = useDonnee<Produit[]>(voitStock ? () => client.stockBas() : null, "stock");
  const activite = useDonnee<VentesRecentes>(() => client.ventesRecentes(), "activite");

  const r = recette.donnee;
  const o = occupation.donnee;
  const evenements = React.useMemo(() => {
    if (!activite.donnee) return [];
    const factures = activite.donnee.factures.map((f) => ({
      id: f.id,
      titre: "Paiement enregistré",
      description: `Chambre ${f.reservation.chambre.numero} · ${f.reservation.client.nom}`,
      cle: new Date(f.createdAt).getTime(),
    }));
    const ventes = activite.donnee.ventesCafeteria.map((v) => ({
      id: v.id,
      titre: "Vente cafétaria",
      description: `Reçu ${v.numeroRecu}`,
      cle: new Date(v.createdAt).getTime(),
    }));
    return [...factures, ...ventes].sort((a, b) => b.cle - a.cle).slice(0, 5);
  }, [activite.donnee]);

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <ScrollView
        contentContainerStyle={styles.contenu}
        refreshControl={
          <RefreshControl
            refreshing={recette.enCours}
            onRefresh={() => {
              recette.recharger();
              occupation.recharger();
              stockBas.recharger();
              activite.recharger();
            }}
          />
        }
      >
        <CarteAccueil utilisateur={utilisateur} />
        <ImageBackgroundHero utilisateur={utilisateur} />

        {recette.erreur && <Text style={styles.erreur}>{recette.erreur}</Text>}
        <View style={styles.grilleKpi}>
          <Carte
            icone={<Wallet size={18} color={couleurs.bleu} />}
            tone={couleurs.bleu}
            toneClaire={couleurs.bleuClair}
            libelle="En dollars"
            valeur={r ? formatMontant(r.total.montantUSD, Devise.USD) : "…"}
            precision="Chambres et cafétaria"
          />
          <Carte
            icone={<Banknote size={18} color={couleurs.succes} />}
            tone={couleurs.succes}
            toneClaire={couleurs.succesClair}
            libelle="En francs"
            valeur={r ? formatMontant(r.total.montantCDF, Devise.CDF) : "…"}
            precision="Chambres et cafétaria"
          />
          {r?.chambres && (
            <Carte
              icone={<BedDouble size={18} color={couleurs.bleu} />}
              tone={couleurs.bleu}
              toneClaire={couleurs.bleuClair}
              libelle="Dont chambres"
              valeur={formatMontant(r.chambres.montantUSD, Devise.USD)}
              precision={formatMontant(r.chambres.montantCDF, Devise.CDF)}
              pleineLargeur
            />
          )}
          {r?.cafeteria && (
            <Carte
              icone={<Coffee size={18} color={couleurs.violet} />}
              tone={couleurs.violet}
              toneClaire={couleurs.violetClair}
              libelle="Dont cafétaria"
              valeur={formatMontant(r.cafeteria.montantUSD, Devise.USD)}
              precision={formatMontant(r.cafeteria.montantCDF, Devise.CDF)}
              pleineLargeur
            />
          )}
        </View>

        {voitChambres && (
          <View style={styles.bloc}>
            <Text style={styles.blocTitre}>Taux d'occupation</Text>
            {occupation.erreur && <Text style={styles.erreur}>{occupation.erreur}</Text>}
            <View style={styles.ligneOccupation}>
              <Donut
                segments={[
                  { valeur: o?.occupees ?? 0, couleur: couleurs.danger },
                  { valeur: o?.libres ?? 0, couleur: couleurs.succes },
                  { valeur: o?.reservees ?? 0, couleur: couleurs.alerte },
                  { valeur: o?.enNettoyage ?? 0, couleur: couleurs.violet },
                ]}
                enfant={<Text style={styles.donutTexte}>{o ? `${o.tauxOccupationPourcent}%` : "…"}</Text>}
              />
              <View style={styles.legende}>
                {[
                  { libelle: "Occupées", valeur: o?.occupees, couleur: couleurs.danger },
                  { libelle: "Libres", valeur: o?.libres, couleur: couleurs.succes },
                  { libelle: "Réservées", valeur: o?.reservees, couleur: couleurs.alerte },
                ].map((ligne) => (
                  <Pressable key={ligne.libelle} style={styles.ligneLegende} onPress={onAllerAuxChambres}>
                    <View style={[styles.pastille, { backgroundColor: ligne.couleur }]} />
                    <Text style={styles.legendeTexte}>{ligne.libelle}</Text>
                    <Text style={styles.legendeValeur}>{ligne.valeur ?? "…"}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {voitStock && (
          <View style={styles.bloc}>
            <View style={styles.blocEntete}>
              <View style={styles.blocEnteteTitre}>
                <Package size={20} color={couleurs.navy} />
                <Text style={styles.blocTitre}>Stock bas</Text>
              </View>
              <Pressable
                style={styles.voirTout}
                onPress={() => ouvrirEcran({ ecran: "stock" })}
                hitSlop={8}
                accessibilityLabel="Voir tout le stock"
              >
                <Text style={styles.voirToutTexte}>Voir tout</Text>
                <ChevronRight size={16} color={couleurs.bleu} />
              </Pressable>
            </View>
            {stockBas.erreur && <Text style={styles.erreur}>{stockBas.erreur}</Text>}
            {stockBas.donnee?.length === 0 && (
              <View style={styles.videConteneur}>
                <Package size={26} color={couleurs.encreFaible} />
                <Text style={styles.videTexte}>Aucun produit sous son seuil d'alerte.</Text>
              </View>
            )}
            {stockBas.donnee && stockBas.donnee.length > 0 && (
              <View>
                {stockBas.donnee.slice(0, 3).map((p) => (
                  <View key={p.id} style={styles.ligneListe}>
                    <Text style={styles.ligneListeNom}>{p.nom}</Text>
                    <Text style={styles.ligneListeValeur}>{Number(p.stockActuel)} restant</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.bloc}>
          <Text style={styles.blocTitre}>Activité récente</Text>
          {activite.erreur && <Text style={styles.erreur}>{activite.erreur}</Text>}
          {activite.donnee && evenements.length === 0 && (
            <View style={styles.videConteneur}>
              <ReceiptText size={26} color={couleurs.encreFaible} />
              <Text style={styles.videTexte}>Aucune activité aujourd'hui.</Text>
            </View>
          )}
          {evenements.map((ev) => (
            <View key={ev.id} style={styles.ligneActivite}>
              <View style={styles.activiteIcone}>
                <CreditCard size={15} color={couleurs.succes} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ligneListeNom}>{ev.titre}</Text>
                <Text style={styles.activiteDescription}>{ev.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Photo temporaire (voir DECISIONS.md, même fichier que le desktop) en
 * attendant une vraie photo de l'hôtel fournie par le client. */
function ImageBackgroundHero({ utilisateur }: { utilisateur: ProfilConnecte }) {
  const maintenant = useHorlogeVivante();
  return (
    <View style={styles.hero}>
      {/* Deux bugs Android empilés, trouvés en isolant chacun sur l'appareil
       * réel (l'un masquait l'autre) :
       * 1. Un <Image> absolument positionné devient invisible dès qu'un
       *    ancêtre a `overflow: hidden` (même un conteneur dédié, isolé du
       *    texte) — pas juste des coins carrés, l'image entière disparaît.
       *    Pas d'overflow:hidden ici : les coins arrondis viennent du
       *    borderRadius posé directement sur l'Image et la surcouche.
       * 2. Avec StyleSheet.absoluteFill (top/right/bottom/left: 0),
       *    resizeMode="cover" n'était pas respecté : l'image se dessinait à
       *    sa taille intrinsèque et débordait sur les cartes en dessous.
       *    Un width/height "100%" explicite (heroImage) force le bon calcul. */}
      <Image
        source={require("../../assets/hero-chambre.jpg")}
        style={[styles.heroImage, styles.heroRadius]}
        resizeMode="cover"
      />
      {/* Dégradé bleu nuit de gauche à droite (demande du 15/10/2026) : opaque
       * sous le texte, il s'efface vers les deux tiers pour laisser la photo
       * nette à droite. Les coins sont arrondis par `rx` (pas d'overflow:hidden,
       * voir plus haut). */}
      <Svg style={styles.heroSurcouche} width="100%" height="100%">
        <Defs>
          <LinearGradient id="degradeHero" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#0B1A38" stopOpacity="0.96" />
            <Stop offset="0.4" stopColor="#0B1A38" stopOpacity="0.8" />
            <Stop offset="0.72" stopColor="#0B1A38" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={rayons.lg} ry={rayons.lg} fill="url(#degradeHero)" />
      </Svg>
      {/* Le padding vit ici plutôt que sur `hero` : pour un enfant en
       * position absolute, width/height "100%" se calcule par rapport à la
       * boîte de padding du parent, pas à ses bords réels — avec le padding
       * sur `hero`, l'image et la surcouche se retrouvaient rétrécies d'un
       * `espacements.s4` de chaque côté au lieu de couvrir toute la carte. */}
      <View style={styles.heroTexteZone}>
        <View style={styles.heroContenu}>
          <Text style={styles.heroSalutation}>Bienvenue</Text>
          <Text style={styles.heroTitre} numberOfLines={1} adjustsFontSizeToFit>
            {utilisateur.hotelNom}
          </Text>
          <Text style={styles.heroSousTitre} numberOfLines={1}>
            {utilisateur.hotelSlogan ?? "Gestion simple. Séjour exceptionnel."}
          </Text>
        </View>
        <View style={styles.heroHorloge}>
          <View style={styles.heroHorlogeLigne}>
            <Calendar size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.heroHorlogeTexte}>{dateDuJour(maintenant)}</Text>
          </View>
          <View style={styles.heroHorlogeLigne}>
            <Clock size={20} color="#fff" />
            <Text style={styles.heroHeureTexte}>{heureCourante(maintenant)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s4 },
  erreur: { color: couleurs.danger, fontSize: 13 },

  // 150 comme le minimum du hero desktop : à 130, l'horloge agrandie
  // n'avait plus la place et débordait de la carte.
  hero: {
    height: 165,
    borderRadius: rayons.lg,
  },
  heroImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  heroRadius: { borderRadius: rayons.lg },
  // `justifyContent: "space-between"` collait l'horloge tout en bas de la
  // carte (trop bas une fois l'heure agrandie) — un simple `gap` la
  // rapproche du bloc de titre à la place.
  heroTexteZone: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-start",
    gap: espacements.s2,
    padding: espacements.s4,
  },
  heroSurcouche: { ...StyleSheet.absoluteFill },
  heroContenu: { gap: 2 },
  heroSalutation: { color: "#fff", fontSize: 14 },
  heroTitre: { color: "#fff", fontSize: 26, fontWeight: "800" },
  heroSousTitre: { color: "rgba(255,255,255,0.9)", fontSize: 13 },
  heroHorloge: { alignSelf: "flex-start", gap: 2 },
  heroHorlogeLigne: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroHorlogeTexte: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
  // « Agrandir la taille de l'heure, tellement grande en bold » (demande du
  // 25/09/2026) — même esprit que `.hero__heure` sur desktop (22px/700),
  // avec les secondes en plus pour que l'agrandissement se justifie (une
  // horloge figée à cette taille aurait l'air cassée).
  heroHeureTexte: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },

  grilleKpi: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s3 },
  carte: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
    gap: 2,
  },
  cartePleine: { flexBasis: "100%" },
  carteIcone: { width: 36, height: 36, borderRadius: rayons.md, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  carteLibelle: { fontSize: 11, fontWeight: "700", color: couleurs.encreAttenuee, textTransform: "uppercase", letterSpacing: 0.3 },
  carteValeur: { fontSize: 22, fontWeight: "800", color: couleurs.navy },
  cartePrecision: { fontSize: 12, color: couleurs.encreAttenuee },

  carteAccueil: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
  },
  accueilTextes: { flex: 1, gap: 4 },
  bonjour: { fontSize: 16, fontWeight: "800", color: couleurs.navy },
  puceRole: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: espacements.s2,
    paddingVertical: 3,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
  },
  puceRoleTexte: { fontSize: 12, fontWeight: "600", color: couleurs.bleu },
  pastilleHotel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "45%",
    paddingHorizontal: espacements.s3,
    paddingVertical: espacements.s2,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  pastilleHotelTexte: { fontSize: 13, fontWeight: "600", color: couleurs.navy, flexShrink: 1 },

  blocEntete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blocEnteteTitre: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  voirTout: { flexDirection: "row", alignItems: "center", gap: 2 },
  voirToutTexte: { fontSize: 13, fontWeight: "600", color: couleurs.bleu },

  bloc: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s3,
  },
  blocTitre: { fontSize: 16, fontWeight: "800", color: couleurs.navy },
  ligneOccupation: { flexDirection: "row", alignItems: "center", gap: espacements.s4 },
  donutTexte: { fontWeight: "700", fontSize: 16, color: couleurs.encre },
  legende: { flex: 1, gap: espacements.s1 },
  ligneLegende: { flexDirection: "row", alignItems: "center", gap: espacements.s2, paddingVertical: 4 },
  pastille: { width: 8, height: 8, borderRadius: rayons.pill },
  legendeTexte: { flex: 1, fontSize: 13, color: couleurs.encre },
  legendeValeur: { fontSize: 13, fontWeight: "700", color: couleurs.encre },

  videConteneur: { alignItems: "center", gap: espacements.s2, paddingVertical: espacements.s3 },
  videTexte: { fontSize: 13, color: couleurs.encreAttenuee, textAlign: "center" },
  ligneListe: { flexDirection: "row", justifyContent: "space-between", paddingVertical: espacements.s2, borderTopWidth: 1, borderTopColor: couleurs.bordure },
  ligneListeNom: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  ligneListeValeur: { fontSize: 13, color: couleurs.encreAttenuee },

  ligneActivite: { flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingVertical: espacements.s2, borderTopWidth: 1, borderTopColor: couleurs.bordure },
  activiteIcone: { width: 30, height: 30, borderRadius: rayons.pill, backgroundColor: couleurs.succesClair, alignItems: "center", justifyContent: "center" },
  activiteDescription: { fontSize: 12, color: couleurs.encreAttenuee },
});
