import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Banknote, CircleCheck, Clock, Minus, Plus, Table2 } from "lucide-react-native";
import { Devise, type Produit } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { FeuilleModale } from "../composants/FeuilleModale";
import { IconeProduit } from "./IconeProduit";

export interface LignePanier {
  produit: Produit;
  quantite: number;
}

export interface FeuillePanierProps {
  visible: boolean;
  lignes: LignePanier[];
  /** « 7,50 $ + 1 500 FC ». */
  totalLibelle: string;
  /** Total par devise, affiché sur deux lignes comme sur la maquette. */
  totaux: { usd: number; cdf: number };
  onChanger: (produit: Produit, delta: number) => void;
  onFermer: () => void;
  /** Le client paie et part : reçu « Comptoir ». */
  onEncaisser: () => void;
  /** Le client reste : on lui crée sa table. */
  onIlReste: () => void;
  enCours: boolean;
  erreur: string | null;
}

/** Le panier : deux boutons seulement, à la fin — Encaisser (le client part) ou Il reste (on lui crée sa table). Aucun choix « pour qui » avant. */
export function FeuillePanier({ visible, lignes, totaux, onChanger, onFermer, onEncaisser, onIlReste, enCours, erreur }: FeuillePanierProps) {
  const articles = lignes.reduce((n, l) => n + l.quantite, 0);
  return (
    <FeuilleModale
      visible={visible}
      onFermer={onFermer}
      titre={`Panier · ${articles} article${articles > 1 ? "s" : ""}`}
      enCours={enCours}
      pied={
        <View style={styles.pied}>
          {erreur && (
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreur}
            </Text>
          )}
          <View style={styles.boutons}>
            <Pressable style={[styles.boutonSecondaire, enCours && styles.inactif]} onPress={onIlReste} disabled={enCours || articles === 0} accessibilityRole="button" accessibilityLabel="Il reste, créer sa table">
              <Table2 size={20} color={couleurs.bleu} />
              <Text style={styles.boutonSecondaireTexte}>Il reste,{"\n"}créer sa table</Text>
            </Pressable>
            <Pressable style={[styles.boutonVert, (enCours || articles === 0) && styles.inactif]} onPress={onEncaisser} disabled={enCours || articles === 0} accessibilityRole="button" accessibilityState={{ busy: enCours }} accessibilityLabel="Encaisser">
              {enCours ? <ActivityIndicator color="#fff" /> : <Banknote size={21} color="#fff" />}
              <Text style={styles.boutonVertTexte}>Encaisser</Text>
            </Pressable>
          </View>
          <Text style={styles.aide}>Encaisser : le client paie et part. Reçu « Comptoir ».</Text>
        </View>
      }
    >
      <View>
        {lignes.map(({ produit, quantite }) => (
          <View key={produit.id} style={styles.ligne}>
            <IconeProduit produit={produit} taille={38} />
            <View style={styles.ligneTextes}>
              <Text style={styles.ligneNom} numberOfLines={1}>
                {produit.nom}
              </Text>
              <Text style={styles.ligneAide}>{formatMontant(Number(produit.prix), produit.devise)} l'unité</Text>
            </View>
            <View style={styles.compteur}>
              <Pressable onPress={() => onChanger(produit, -1)} hitSlop={6} style={styles.compteurBouton} accessibilityRole="button" accessibilityLabel={`Retirer un ${produit.nom}`}>
                <Minus size={15} color={couleurs.encre} strokeWidth={2.6} />
              </Pressable>
              <Text style={styles.compteurValeur}>{quantite}</Text>
              <Pressable onPress={() => onChanger(produit, 1)} hitSlop={6} style={styles.compteurBouton} accessibilityRole="button" accessibilityLabel={`Ajouter un ${produit.nom}`}>
                <Plus size={15} color={couleurs.encre} strokeWidth={2.6} />
              </Pressable>
            </View>
            <Text style={styles.ligneTotal}>{formatMontant(Number(produit.prix) * quantite, produit.devise)}</Text>
          </View>
        ))}
        <View style={styles.total}>
          <Text style={styles.totalLibelle}>Total</Text>
          <View style={{ alignItems: "flex-end" }}>
            {totaux.usd > 0 && <Text style={styles.totalMontant}>{formatMontant(totaux.usd, Devise.USD)}</Text>}
            {totaux.cdf > 0 && <Text style={styles.totalMontant}>{formatMontant(totaux.cdf, Devise.CDF)}</Text>}
          </View>
        </View>
      </View>
    </FeuilleModale>
  );
}

export interface FeuilleCreerTableProps {
  visible: boolean;
  /** Nom proposé (« Table 5 »). */
  nomInitial: string;
  articles: number;
  /** Total des articles choisis, pour le bouton « Encaisser … ». */
  totalLibelle: string;
  onFermer: () => void;
  onValider: (choix: { nom: string; payerMaintenant: boolean }) => void;
  enCours: boolean;
  erreur: string | null;
}

/** « Il reste » : une seule question de nom, puis payer les articles choisis maintenant ou à la fin. */
export function FeuilleCreerTable({ visible, nomInitial, articles, totalLibelle, onFermer, onValider, enCours, erreur }: FeuilleCreerTableProps) {
  const [nom, setNom] = useState(nomInitial);
  const [payerMaintenant, setPayerMaintenant] = useState(true);
  useEffect(() => {
    if (visible) {
      setNom(nomInitial);
      setPayerMaintenant(true);
    }
  }, [visible, nomInitial]);
  const nomValide = nom.trim().length > 0;
  return (
    <FeuilleModale
      visible={visible}
      onFermer={onFermer}
      titre="Créer sa table"
      enCours={enCours}
      pied={
        <View style={styles.pied}>
          {erreur && (
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreur}
            </Text>
          )}
          <Pressable
            style={[styles.boutonPlein, (!nomValide || enCours) && styles.inactif]}
            onPress={() => onValider({ nom: nom.trim(), payerMaintenant })}
            disabled={!nomValide || enCours}
            accessibilityRole="button"
            accessibilityState={{ busy: enCours, disabled: !nomValide || enCours }}
          >
            {enCours ? <ActivityIndicator color="#fff" /> : <CircleCheck size={21} color="#fff" />}
            <Text style={styles.boutonPleinTexte}>{payerMaintenant ? `Encaisser ${totalLibelle}` : "Créer la table"}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={{ gap: espacements.s2 }}>
        <Text style={styles.etiquette}>NOM DE LA TABLE OU DU CLIENT</Text>
        <TextInput
          style={styles.champ}
          value={nom}
          onChangeText={setNom}
          selectTextOnFocus
          autoFocus
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel="Nom de la table ou du client"
          placeholder="Ex. Table 4"
          placeholderTextColor={couleurs.encreFaible}
        />
        <Text style={[styles.etiquette, { marginTop: espacements.s3 }]}>LES {articles} ARTICLE{articles > 1 ? "S" : ""} CHOISI{articles > 1 ? "S" : ""} SONT…</Text>
        <Option titre="À payer maintenant" sous="Le reçu s'imprime, la table reste ouverte pour la suite" choisi={payerMaintenant} onPress={() => setPayerMaintenant(true)} Icone={Banknote} />
        <Option titre="À payer à la fin" sous="Ils sont mis sur la table, rien n'est payé" choisi={!payerMaintenant} onPress={() => setPayerMaintenant(false)} Icone={Clock} />
      </View>
    </FeuilleModale>
  );
}

function Option({ titre, sous, choisi, onPress, Icone }: { titre: string; sous: string; choisi: boolean; onPress: () => void; Icone: typeof Banknote }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, choisi && styles.optionChoisie]} accessibilityRole="radio" accessibilityState={{ selected: choisi }} accessibilityLabel={`${titre}. ${sous}`}>
      <View style={[styles.radio, choisi && { borderColor: couleurs.bleu }]}>{choisi && <View style={styles.radioPoint} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitre, choisi && { color: couleurs.bleu }]}>{titre}</Text>
        <Text style={styles.optionSous}>{sous}</Text>
      </View>
      <Icone size={22} color={choisi ? couleurs.bleu : couleurs.encreAttenuee} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pied: { gap: espacements.s2 },
  erreur: { color: couleurs.danger, fontSize: 13 },
  boutons: { flexDirection: "row", gap: espacements.s2 },
  boutonSecondaire: { flex: 1, minHeight: 56, borderRadius: rayons.md, borderWidth: 1.5, borderColor: couleurs.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 8 },
  boutonSecondaireTexte: { color: couleurs.bleu, fontWeight: "800", fontSize: 13.5, textAlign: "center", lineHeight: 17 },
  boutonVert: { flex: 1.25, minHeight: 56, borderRadius: rayons.md, backgroundColor: couleurs.succes, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  boutonVertTexte: { color: "#fff", fontWeight: "800", fontSize: 16 },
  boutonPlein: { minHeight: 56, borderRadius: rayons.md, backgroundColor: couleurs.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 12 },
  boutonPleinTexte: { color: "#fff", fontWeight: "800", fontSize: 16, flexShrink: 1, textAlign: "center" },
  inactif: { opacity: 0.5 },
  aide: { textAlign: "center", fontSize: 12, color: couleurs.encreAttenuee },
  ligne: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  ligneTextes: { flex: 1 },
  ligneNom: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  ligneAide: { fontSize: 12, color: couleurs.encreAttenuee },
  compteur: { flexDirection: "row", alignItems: "center", backgroundColor: couleurs.surface100, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 16, height: 34 },
  compteurBouton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  compteurValeur: { fontSize: 13.5, fontWeight: "800", minWidth: 14, textAlign: "center", color: couleurs.encre },
  ligneTotal: { width: 74, textAlign: "right", fontSize: 14, fontWeight: "800", color: couleurs.encre },
  total: { marginTop: espacements.s3, backgroundColor: couleurs.surface100, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.md, padding: espacements.s3, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLibelle: { fontSize: 14, fontWeight: "600", color: couleurs.encreAttenuee },
  totalMontant: { fontSize: 17, fontWeight: "800", color: couleurs.encre },
  etiquette: { fontSize: 12, fontWeight: "700", color: couleurs.encreAttenuee, letterSpacing: 0.5 },
  champ: { minHeight: 52, borderWidth: 2, borderColor: couleurs.bleu, borderRadius: rayons.md, paddingHorizontal: 14, fontSize: 17, fontWeight: "700", color: couleurs.encre, backgroundColor: couleurs.surface200 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 2, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, borderRadius: rayons.md, padding: 12 },
  optionChoisie: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: couleurs.encreAttenuee, alignItems: "center", justifyContent: "center" },
  radioPoint: { width: 11, height: 11, borderRadius: 6, backgroundColor: couleurs.bleu },
  optionTitre: { fontSize: 15, fontWeight: "800", color: couleurs.encre },
  optionSous: { fontSize: 12.5, color: couleurs.encreAttenuee, marginTop: 1 },
});
