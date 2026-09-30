import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { ICONES_SERVICE, LIBELLE_ICONE_SERVICE, MAX_PHOTOS_GALERIE, RESEAUX_SOCIAUX } from "@hotel-chicago/types";
import type { IconeService, ReseauSocial, ServiceHotel, SiteHotelEditable } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { SelecteurPhotos, nettoyerImages } from "../composants/SelecteurPhotos";

export interface EcranSiteHotelProps {
  client: ClientApi;
  onRetour: () => void;
}

const LIBELLE_RESEAU: Record<ReseauSocial, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
};

const SUGGESTIONS: IconeService[] = ["restaurant", "piscine", "wifi", "parking", "navette", "petit-dejeuner", "autre"];
const MAX_SERVICES = 12;
const REGEX_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

function Champ({
  libelle,
  valeur,
  surChangement,
  ...reste
}: { libelle: string; valeur: string; surChangement: (v: string) => void } & Omit<React.ComponentProps<typeof TextInput>, "value" | "onChangeText" | "style">) {
  return (
    <>
      <Text style={styles.label}>{libelle}</Text>
      <TextInput {...reste} style={[styles.champ, reste.multiline && styles.champMultiligne]} value={valeur} onChangeText={surChangement} placeholderTextColor={couleurs.encreFaible} />
    </>
  );
}

/** Le patron définit ici ce que ses clients voient sur le site public de
 * l'hôtel (présentation, photos, services, contact, horaires). En ligne
 * uniquement : c'est de la configuration, pas une donnée de travail hors ligne. */
export function EcranSiteHotel({ client, onRetour }: EcranSiteHotelProps) {
  const [site, setSite] = useState<SiteHotelEditable | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [imagesEnvoyees, setImagesEnvoyees] = useState<string[]>([]);

  useEffect(() => {
    client
      .obtenirSiteHotel()
      .then(setSite)
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  function maj<K extends keyof SiteHotelEditable>(cle: K, valeur: SiteHotelEditable[K]) {
    setSite((s) => (s ? { ...s, [cle]: valeur } : s));
    setMessage(null);
  }

  function majService(index: number, champs: Partial<ServiceHotel>) {
    setSite((s) => (s ? { ...s, services: s.services.map((x, i) => (i === index ? { ...x, ...champs } : x)) } : s));
    setMessage(null);
  }

  async function enregistrer() {
    if (!site) return;
    if (!site.nom.trim()) return setErreur("Le nom de l'hôtel est obligatoire.");
    if (site.services.some((s) => !s.titre.trim())) return setErreur("Chaque service doit avoir un titre.");
    for (const [libelle, h] of [["d'arrivée", site.horaireArrivee], ["de départ", site.horaireDepart]] as const) {
      if (h && !REGEX_HEURE.test(h)) return setErreur(`L'heure ${libelle} doit être au format HH:MM (ex. 14:00).`);
    }
    setEnCours(true);
    setErreur(null);
    try {
      const vide = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
      const reseaux = Object.fromEntries(
        RESEAUX_SOCIAUX.map((r) => [r, vide(site.reseaux[r] ?? null)]).filter(([, v]) => v)
      ) as SiteHotelEditable["reseaux"];
      const enregistre = await client.modifierSiteHotel({
        nom: site.nom.trim(),
        adresse: site.adresse ?? "",
        telephoneContact: site.telephoneContact ?? "",
        emailContact: site.emailContact ?? "",
        slogan: site.slogan ?? "",
        presentation: site.presentation ?? "",
        couvertureUrl: site.couvertureUrl,
        galerie: site.galerie,
        services: site.services.map((s) => ({ ...s, titre: s.titre.trim(), description: s.description?.trim() || undefined })),
        whatsapp: site.whatsapp ?? "",
        horaireArrivee: vide(site.horaireArrivee),
        horaireDepart: vide(site.horaireDepart),
        reception24h: site.reception24h,
        lienCarte: vide(site.lienCarte),
        reseaux,
      });
      const gardees = [...(enregistre.couvertureUrl ? [enregistre.couvertureUrl] : []), ...enregistre.galerie];
      void nettoyerImages(client, [], imagesEnvoyees, gardees);
      setSite(enregistre);
      setImagesEnvoyees([]);
      setMessage("Modifications enregistrées. Votre site est à jour.");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  const suiviEnvoi = (url: string) => setImagesEnvoyees((l) => [...l, url]);

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Site de l'hôtel"
        sousTitre={site ? `${site.sousDomaine}.hotelsaver.com` : "Ce que vos clients voient en ligne"}
        onRetour={onRetour}
      />
      {!site ? (
        <Text style={styles.info}>{erreur ?? "Chargement…"}</Text>
      ) : (
        <ConteneurFormulaire styleContenu={styles.contenu}>
          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Présentation</Text>
            <Champ libelle="Nom de l'hôtel" valeur={site.nom} surChangement={(v) => maj("nom", v)} maxLength={100} />
            <Champ libelle="Slogan" valeur={site.slogan ?? ""} surChangement={(v) => maj("slogan", v)} maxLength={120} placeholder="Ex. Votre escale de détente" />
            <Champ
              libelle="Texte de présentation"
              valeur={site.presentation ?? ""}
              surChangement={(v) => maj("presentation", v)}
              maxLength={2000}
              multiline
              placeholder="Décrivez votre hôtel : situation, ambiance, atouts…"
            />
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Photos</Text>
            <SelecteurPhotos
              client={client}
              usage="couverture"
              photos={site.couvertureUrl ? [site.couvertureUrl] : []}
              max={1}
              onChange={(p) => maj("couvertureUrl", p[0] ?? null)}
              onEnvoyee={suiviEnvoi}
              libelle="Photo de couverture"
            />
            <SelecteurPhotos
              client={client}
              usage="galerie"
              photos={site.galerie}
              max={MAX_PHOTOS_GALERIE}
              onChange={(p) => maj("galerie", p)}
              onEnvoyee={suiviEnvoi}
              libelle="Galerie"
            />
            <Text style={styles.aide}>Les photos sont automatiquement allégées. Celles des chambres se règlent dans « Chambres ».</Text>
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Services proposés</Text>
            {site.services.map((s, i) => (
              <View key={i} style={styles.service}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.icones}>
                  {ICONES_SERVICE.map((ic) => (
                    <Pressable key={ic} style={[styles.puce, s.icone === ic && styles.puceActive]} onPress={() => majService(i, { icone: ic })}>
                      <Text style={[styles.puceTexte, s.icone === ic && styles.puceTexteActif]}>{LIBELLE_ICONE_SERVICE[ic]}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.ligneService}>
                  <TextInput style={[styles.champ, { flex: 1 }]} value={s.titre} onChangeText={(v) => majService(i, { titre: v })} maxLength={60} placeholder="Titre (ex. Piscine)" placeholderTextColor={couleurs.encreFaible} />
                  <Pressable
                    style={styles.supprimer}
                    onPress={() => maj("services", site.services.filter((_, k) => k !== i))}
                    accessibilityRole="button"
                    accessibilityLabel="Supprimer ce service"
                  >
                    <Trash2 size={18} color={couleurs.danger} />
                  </Pressable>
                </View>
                <TextInput style={styles.champ} value={s.description ?? ""} onChangeText={(v) => majService(i, { description: v })} maxLength={200} placeholder="Description (facultative)" placeholderTextColor={couleurs.encreFaible} />
              </View>
            ))}
            {site.services.length < MAX_SERVICES && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.icones}>
                {SUGGESTIONS.map((ic) => (
                  <Pressable
                    key={ic}
                    style={styles.puceAjout}
                    onPress={() => maj("services", [...site.services, { icone: ic, titre: ic === "autre" ? "" : LIBELLE_ICONE_SERVICE[ic] }])}
                  >
                    <Plus size={12} color={couleurs.bleu} />
                    <Text style={styles.puceAjoutTexte}>{LIBELLE_ICONE_SERVICE[ic]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Contact et horaires</Text>
            <Champ libelle="Adresse" valeur={site.adresse ?? ""} surChangement={(v) => maj("adresse", v)} maxLength={200} />
            <Champ libelle="Téléphone" valeur={site.telephoneContact ?? ""} surChangement={(v) => maj("telephoneContact", v)} maxLength={40} keyboardType="phone-pad" placeholder="+243 …" />
            <Champ libelle="WhatsApp" valeur={site.whatsapp ?? ""} surChangement={(v) => maj("whatsapp", v)} maxLength={30} keyboardType="phone-pad" placeholder="+243 … (avec l'indicatif)" />
            <Champ libelle="E-mail de contact" valeur={site.emailContact ?? ""} surChangement={(v) => maj("emailContact", v)} maxLength={120} keyboardType="email-address" autoCapitalize="none" />
            <Champ libelle="Lien Google Maps (facultatif)" valeur={site.lienCarte ?? ""} surChangement={(v) => maj("lienCarte", v)} autoCapitalize="none" placeholder="https://maps.google.com/…" />
            <View style={styles.deuxColonnes}>
              <View style={{ flex: 1 }}>
                <Champ libelle="Arrivée dès" valeur={site.horaireArrivee ?? ""} surChangement={(v) => maj("horaireArrivee", v)} maxLength={5} placeholder="14:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Champ libelle="Départ avant" valeur={site.horaireDepart ?? ""} surChangement={(v) => maj("horaireDepart", v)} maxLength={5} placeholder="11:00" />
              </View>
            </View>
            <View style={styles.ligneSwitch}>
              <Text style={styles.switchTexte}>Réception ouverte 24 h/24</Text>
              <Switch value={site.reception24h} onValueChange={(v) => maj("reception24h", v)} trackColor={{ true: couleurs.bleu }} />
            </View>
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Réseaux sociaux</Text>
            {RESEAUX_SOCIAUX.map((r) => (
              <Champ
                key={r}
                libelle={LIBELLE_RESEAU[r]}
                valeur={site.reseaux[r] ?? ""}
                surChangement={(v) => maj("reseaux", { ...site.reseaux, [r]: v })}
                autoCapitalize="none"
                placeholder="https://…"
              />
            ))}
          </View>

          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          {message && <Text style={styles.succes}>{message}</Text>}
          <Pressable style={[styles.bouton, enCours && styles.boutonDesactive]} onPress={enregistrer} disabled={enCours}>
            <Text style={styles.boutonTexte}>{enCours ? "Enregistrement…" : "Enregistrer"}</Text>
          </Pressable>
        </ConteneurFormulaire>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  info: { padding: espacements.s4, color: couleurs.encreAttenuee },
  contenu: { padding: espacements.s4, gap: espacements.s3, paddingBottom: espacements.s7 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
  },
  titreCarte: { fontSize: 16, fontWeight: "700", color: couleurs.navy, marginBottom: espacements.s2 },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s2, marginBottom: espacements.s1 },
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
  champMultiligne: { height: 130, paddingTop: espacements.s3, textAlignVertical: "top" },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  service: { gap: espacements.s2, paddingVertical: espacements.s3, borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  ligneService: { flexDirection: "row", gap: espacements.s2, alignItems: "center" },
  supprimer: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: rayons.sm, backgroundColor: couleurs.dangerClair },
  icones: { gap: espacements.s2, paddingVertical: espacements.s1 },
  puce: { paddingHorizontal: 12, height: 34, borderRadius: rayons.pill, backgroundColor: couleurs.surface100, borderWidth: 1, borderColor: couleurs.bordure, justifyContent: "center" },
  puceActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  puceTexte: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  puceTexteActif: { color: "#fff" },
  puceAjout: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 36, borderRadius: rayons.pill, backgroundColor: couleurs.bleuClair },
  puceAjoutTexte: { fontSize: 12, fontWeight: "600", color: couleurs.bleu },
  deuxColonnes: { flexDirection: "row", gap: espacements.s3 },
  ligneSwitch: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: espacements.s3 },
  switchTexte: { fontSize: 15, color: couleurs.encre },
  erreur: { color: "#B42318", backgroundColor: couleurs.dangerClair, padding: espacements.s3, borderRadius: rayons.sm, fontSize: 13 },
  succes: { color: "#067647", backgroundColor: couleurs.succesClair, padding: espacements.s3, borderRadius: rayons.sm, fontSize: 13 },
  bouton: { height: 52, borderRadius: rayons.md, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonDesactive: { opacity: 0.6 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
