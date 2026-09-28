import * as React from "react";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ClientApi, Utilisateur } from "@hotel-chicago/api-client";
import { Role } from "@hotel-chicago/types";
import { Plus, UserRound } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE } from "../navigation";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { useDonnee } from "../hooks/useDonnee";

export interface EcranUtilisateursProps {
  client: ClientApi;
  onRetour: () => void;
}

const ROLES: Role[] = [Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON];

interface FormulaireCreation {
  nom: string;
  email: string;
  motDePasse: string;
  role: Role;
}

const FORMULAIRE_VIDE: FormulaireCreation = { nom: "", email: "", motDePasse: "", role: Role.CAFETARIA };

/**
 * Création et gestion des comptes du personnel (Phase 15) — PATRON
 * uniquement (déjà filtré par `navigation.ts`/`EcranPlus.tsx`). Le mot de
 * passe est choisi ici par le patron et communiqué directement à l'employé
 * (pas de génération automatique, pas d'email de confirmation à attendre —
 * voir UtilisateursService.create, emailConfirme: true).
 */
export function EcranUtilisateurs({ client, onRetour }: EcranUtilisateursProps) {
  const { donnee: utilisateurs, erreur, enCours, recharger } = useDonnee(() => client.listerUtilisateurs(), client);

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [formulaire, setFormulaire] = useState<FormulaireCreation>(FORMULAIRE_VIDE);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  const [idsEnCours, setIdsEnCours] = useState<Set<string>>(new Set());

  function ouvrirCreation() {
    setFormulaire(FORMULAIRE_VIDE);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  async function creer() {
    if (!formulaire.nom.trim() || !formulaire.email.trim() || formulaire.motDePasse.length < 8) {
      setErreurFormulaire("Nom, email et mot de passe (8 caractères minimum) sont obligatoires.");
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.creerUtilisateur({
        nom: formulaire.nom.trim(),
        email: formulaire.email.trim(),
        motDePasse: formulaire.motDePasse,
        role: formulaire.role,
      });
      setModaleOuverte(false);
      recharger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function basculerActif(utilisateur: Utilisateur) {
    setIdsEnCours((s) => new Set(s).add(utilisateur.id));
    try {
      await client.changerStatutUtilisateur(utilisateur.id, !utilisateur.actif);
      recharger();
    } catch (e) {
      // Erreur affichée en haut de liste (ex. "vous ne pouvez pas désactiver votre propre compte").
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setIdsEnCours((s) => {
        const suivant = new Set(s);
        suivant.delete(utilisateur.id);
        return suivant;
      });
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Utilisateurs"
        sousTitre="Comptes du personnel de cet hôtel."
        onRetour={onRetour}
        action={
          <Pressable style={styles.boutonAjouter} onPress={ouvrirCreation} hitSlop={8}>
            <Plus size={20} color="#fff" />
          </Pressable>
        }
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {utilisateurs?.length === 0 && (
        <View style={styles.videConteneur}>
          <UserRound size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun compte enregistré.</Text>
        </View>
      )}

      <FlatList
        data={utilisateurs ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
        renderItem={({ item }) => (
          <View style={styles.carte}>
            <View style={styles.carteEntete}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nom}>{item.nom}</Text>
                <Text style={styles.email}>{item.email ?? "—"}</Text>
              </View>
              <View style={styles.badgeRole}>
                <Text style={styles.badgeRoleTexte}>{LIBELLE_ROLE[item.role]}</Text>
              </View>
            </View>
            <View style={styles.carteBas}>
              <Text style={item.actif ? styles.statutActif : styles.statutInactif}>
                {item.actif ? "Actif" : "Désactivé"}
              </Text>
              <Switch
                value={item.actif}
                onValueChange={() => basculerActif(item)}
                disabled={idsEnCours.has(item.id)}
              />
            </View>
          </View>
        )}
      />

      <FeuilleModale visible={modaleOuverte} onFermer={() => setModaleOuverte(false)} titre="Nouveau compte">
        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.nom}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, nom: v }))}
          placeholder="Ex. Jeanne Kabila"
          placeholderTextColor={couleurs.encreFaible}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.email}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, email: v }))}
          placeholder="jeanne@exemple.com"
          placeholderTextColor={couleurs.encreFaible}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.motDePasse}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, motDePasse: v }))}
          placeholder="8 caractères minimum"
          placeholderTextColor={couleurs.encreFaible}
          secureTextEntry
        />

        <Text style={styles.label}>Rôle</Text>
        <View style={styles.selecteurRole}>
          {ROLES.map((r) => (
            <Pressable
              key={r}
              style={[styles.optionRole, formulaire.role === r && styles.optionRoleActive]}
              onPress={() => setFormulaire((f) => ({ ...f, role: r }))}
            >
              <Text style={[styles.optionRoleTexte, formulaire.role === r && styles.optionRoleTexteActif]}>
                {LIBELLE_ROLE[r]}
              </Text>
            </Pressable>
          ))}
        </View>

        {erreurFormulaire && <Text style={styles.erreurFormulaire}>{erreurFormulaire}</Text>}

        <Pressable style={styles.bouton} onPress={creer} disabled={enEnvoi}>
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Créer le compte"}</Text>
        </Pressable>
      </FeuilleModale>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  boutonAjouter: {
    width: 36,
    height: 36,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  liste: { padding: espacements.s4, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  email: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  badgeRole: { backgroundColor: couleurs.bleuClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeRoleTexte: { fontSize: 11, fontWeight: "700", color: couleurs.bleu },
  carteBas: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statutActif: { fontSize: 13, fontWeight: "600", color: couleurs.succes },
  statutInactif: { fontSize: 13, fontWeight: "600", color: couleurs.danger },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1, marginTop: espacements.s2 },
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
  selecteurRole: { flexDirection: "row", gap: espacements.s2 },
  optionRole: {
    flex: 1,
    height: 40,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  optionRoleActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  optionRoleTexte: { fontSize: 12, fontWeight: "600", color: couleurs.encre },
  optionRoleTexteActif: { color: "#fff" },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13, marginTop: espacements.s2 },
  bouton: {
    height: 44,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s4,
  },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
