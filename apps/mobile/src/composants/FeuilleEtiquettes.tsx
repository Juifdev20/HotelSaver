import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ErreurApi, type ClientApi } from "@hotel-chicago/api-client";
import { construireEtiquette, genererEan13Interne } from "@hotel-chicago/receipts";
import type { Produit } from "@hotel-chicago/types";
import { ApercuRecu } from "./ApercuRecu";
import { FeuilleModale } from "./FeuilleModale";
import { imprimerLignes } from "../impression/imprimante";
import { messageErreur } from "../messagesErreur";
import { couleurs, espacements, rayons } from "../tokens";

export interface FeuilleEtiquettesProps {
  client: ClientApi;
  /** null = feuille fermée. */
  produit: Produit | null;
  /** Nombre proposé à l'ouverture (ex. la quantité qui vient d'entrer en stock). */
  exemplairesParDefaut?: number;
  /** Phrase de confirmation en tête (ex. « ✓ 24 × Primus entrés en stock. »). */
  entete?: string;
  onFermer: () => void;
  /** Un code vient d'être généré et associé : la liste appelante peut se recharger. */
  onProduitMisAJour?: (produit: Produit) => void;
}

/**
 * Étiquettes de prix (nom, prix, code-barres) à coller sur les articles — même aperçu et même impression que la feuille
 * « Imprimer l'étiquette » du Menu patron, ouverte ici depuis le Stock après une ENTRÉE (18/10/2026). Un article sans code
 * reçoit un EAN-13 interne via `associerCodeBarres` (seule écriture produit ouverte à la caisse ; demande le réseau).
 */
export function FeuilleEtiquettes({ client, produit, exemplairesParDefaut = 1, entete, onFermer, onProduitMisAJour }: FeuilleEtiquettesProps) {
  const [courant, setCourant] = useState<Produit | null>(produit);
  const [exemplaires, setExemplaires] = useState("1");
  const [message, setMessage] = useState<{ texte: string; reussi: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setCourant(produit);
    setExemplaires(String(Math.max(1, Math.round(exemplairesParDefaut) || 1)));
    setMessage(null);
  }, [produit, exemplairesParDefaut]);

  async function genererCode(essai = 0): Promise<void> {
    if (!courant) return;
    setEnCours(true);
    setMessage(null);
    try {
      const maj = await client.associerCodeBarres(courant.id, genererEan13Interne());
      setCourant(maj);
      onProduitMisAJour?.(maj);
    } catch (e) {
      // Code généré déjà pris (très rare) : un autre.
      if (e instanceof ErreurApi && e.statusCode === 409 && essai < 3) return genererCode(essai + 1);
      setMessage({ texte: messageErreur(e, "Le code n'a pas pu être créé : il faut une connexion. Réessayez."), reussi: false });
    } finally {
      setEnCours(false);
    }
  }

  async function imprimer() {
    if (!courant?.codeBarres) return;
    setEnCours(true);
    setMessage(null);
    try {
      const n = Math.max(1, Math.round(Number(exemplaires)) || 1);
      await imprimerLignes(construireEtiquette(courant, n));
      setMessage({
        texte: `${n} étiquette${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""} à l'imprimante. Vérifiez qu'elle${n > 1 ? "s sont" : " est"} bien sortie${n > 1 ? "s" : ""} ; sinon, réessayez.`,
        reussi: true,
      });
    } catch (e) {
      setMessage({ texte: `Impression impossible : ${messageErreur(e, "l'imprimante n'a pas répondu.")}`, reussi: false });
    } finally {
      setEnCours(false);
    }
  }

  const avecCode = Boolean(courant?.codeBarres);

  return (
    <FeuilleModale
      visible={produit !== null}
      onFermer={onFermer}
      titre="Étiquettes de prix"
      enCours={enCours}
      pied={
        courant ? (
          <>
            {message && (
              <Text style={message.reussi ? styles.confirmation : styles.erreur} accessibilityRole={message.reussi ? undefined : "alert"} accessibilityLiveRegion="polite">
                {message.texte}
              </Text>
            )}
            <View style={styles.boutons}>
              <Pressable style={styles.boutonSecondaire} onPress={onFermer} disabled={enCours} accessibilityRole="button">
                <Text style={styles.boutonSecondaireTexte}>Terminer</Text>
              </Pressable>
              <Pressable
                style={[styles.bouton, enCours && { opacity: 0.6 }]}
                onPress={() => void (avecCode ? imprimer() : genererCode())}
                disabled={enCours}
                accessibilityRole="button"
                accessibilityState={{ disabled: enCours, busy: enCours }}
              >
                <Text style={styles.boutonTexte}>{enCours ? "…" : avecCode ? "Imprimer les étiquettes" : "Générer un code"}</Text>
              </Pressable>
            </View>
          </>
        ) : undefined
      }
    >
      {courant && (
        <>
          {entete && <Text style={styles.confirmation}>{entete}</Text>}
          {avecCode ? (
            <>
              <Text style={styles.aide}>Collez-les sur les articles pour les scanner à la caisse.</Text>
              <ApercuRecu lignes={construireEtiquette(courant, 1)} />
              <Text style={styles.label}>Nombre d'étiquettes</Text>
              <TextInput
                style={styles.champ}
                value={exemplaires}
                onChangeText={setExemplaires}
                keyboardType="number-pad"
                accessibilityLabel="Nombre d'étiquettes"
              />
            </>
          ) : (
            <Text style={styles.aide}>
              « {courant.nom} » n'a pas encore de code-barres. S'il porte déjà un code fabricant, touchez « Terminer » ; sinon,
              générez un code pour imprimer ses étiquettes.
            </Text>
          )}
        </>
      )}
    </FeuilleModale>
  );
}

const styles = StyleSheet.create({
  confirmation: { fontSize: 14, color: couleurs.succes, fontWeight: "600" },
  erreur: { fontSize: 13, color: couleurs.danger },
  aide: { fontSize: 13, color: couleurs.encreAttenuee },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
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
  boutons: { flexDirection: "row", gap: espacements.s3 },
  boutonSecondaire: {
    flex: 1,
    minHeight: 48,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
  bouton: { flex: 1, minHeight: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
