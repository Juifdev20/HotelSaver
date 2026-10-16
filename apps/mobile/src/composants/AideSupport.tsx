import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MessageCircle } from "lucide-react-native";
import { CONTACT_SUPPORT_PAR_DEFAUT, formaterTelephone, lienWhatsApp } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { ouvrirLienSur } from "../liens";

export interface ContactSupport {
  telephone: string;
  whatsapp: string;
}

// Le contact du support est le même pour tous les hôtels : une fois lu (écran Abonnement), on le garde pour les écrans « fonction non incluse ».
let contactMemorise: ContactSupport | null = null;
const abonnes = new Set<() => void>();

function contactValide(c: unknown): c is ContactSupport {
  const x = c as Partial<ContactSupport> | null;
  return !!x && typeof x.telephone === "string" && typeof x.whatsapp === "string" && x.whatsapp.replace(/\D/g, "").length >= 8;
}

/** Le contact à afficher : celui reçu du serveur s'il est complet, sinon le dernier connu, sinon la valeur de secours. Ne lève jamais. */
export function choisirContactSupport(recu?: unknown): ContactSupport {
  return contactValide(recu) ? recu : (contactMemorise ?? CONTACT_SUPPORT_PAR_DEFAUT);
}

/** Mémorise le contact reçu du serveur (`VueAbonnement.contactSupport`) ; une valeur incomplète est ignorée. */
export function memoriserContactSupport(contact: unknown): void {
  if (!contactValide(contact)) return;
  if (contactMemorise && contactMemorise.telephone === contact.telephone && contactMemorise.whatsapp === contact.whatsapp) return;
  contactMemorise = { telephone: contact.telephone, whatsapp: contact.whatsapp };
  for (const a of [...abonnes]) a();
}

/** Le contact du support : celui du serveur s'il a pu être lu, sinon la valeur de secours. Ne lève jamais. */
export function useContactSupport(): ContactSupport {
  const { client } = useSession();
  const [contact, setContact] = useState<ContactSupport>(contactMemorise ?? CONTACT_SUPPORT_PAR_DEFAUT);
  useEffect(() => {
    let actif = true;
    const maj = () => {
      if (actif && contactMemorise) setContact(contactMemorise);
    };
    abonnes.add(maj);
    if (contactMemorise) maj();
    else {
      client
        .abonnement()
        .then((v) => memoriserContactSupport(v.contactSupport))
        .catch(() => undefined);
    }
    return () => {
      actif = false;
      abonnes.delete(maj);
    };
  }, [client]);
  return contact;
}

export interface BlocAideProps {
  contact: ContactSupport;
  /** Phrase d'explication (courte, simple). */
  texte?: string;
}

/** « Besoin d'aide ? » : un gros bouton WhatsApp vers le support HotelSaver, et le numéro en clair (si WhatsApp ne s'ouvre pas). */
export function BlocAide({ contact, texte = "Écrivez au support HotelSaver sur WhatsApp. Nous vous répondons pour vous aider." }: BlocAideProps) {
  const { utilisateur } = useSession();
  const [probleme, setProbleme] = useState<string | null>(null);
  const numeroLisible = formaterTelephone(contact.whatsapp);

  async function ouvrirWhatsApp() {
    setProbleme(null);
    try {
      await ouvrirLienSur(lienWhatsApp(contact.whatsapp, `Bonjour, j'ai besoin d'aide pour HotelSaver (hôtel : ${utilisateur.hotelNom}).`));
    } catch {
      setProbleme(`WhatsApp ne s'est pas ouvert. Vous pouvez écrire ou appeler le ${numeroLisible}.`);
    }
  }

  return (
    <View style={styles.bloc} accessibilityRole="summary">
      <Text style={styles.titre} accessibilityRole="header">
        Besoin d'aide ?
      </Text>
      <Text style={styles.texte}>{texte}</Text>
      <Pressable
        style={styles.bouton}
        onPress={() => void ouvrirWhatsApp()}
        accessibilityRole="button"
        accessibilityLabel={`WhatsApp ${numeroLisible}. Écrire au support HotelSaver.`}
      >
        <MessageCircle size={18} color="#fff" />
        <Text style={styles.boutonTexte}>WhatsApp {numeroLisible}</Text>
      </Pressable>
      {probleme && (
        <Text style={styles.probleme} accessibilityRole="alert">
          {probleme}
        </Text>
      )}
    </View>
  );
}

/** BlocAide qui trouve tout seul le contact du support. */
export function BlocAideAuto(props: Omit<BlocAideProps, "contact">) {
  const contact = useContactSupport();
  return <BlocAide contact={contact} {...props} />;
}

const styles = StyleSheet.create({
  bloc: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
  },
  titre: { fontSize: 16, fontWeight: "700", color: couleurs.navy },
  texte: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  bouton: {
    flexDirection: "row",
    minHeight: 48,
    borderRadius: rayons.md,
    backgroundColor: couleurs.succes,
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
    paddingHorizontal: espacements.s4,
  },
  boutonTexte: { color: "#fff", fontSize: 15, fontWeight: "700" },
  probleme: { fontSize: 13, color: couleurs.danger, fontWeight: "600" },
});
