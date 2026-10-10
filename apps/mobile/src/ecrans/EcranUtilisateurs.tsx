import * as React from "react";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ClientApi, DonneesModificationUtilisateur, Utilisateur } from "@hotel-chicago/api-client";
import { Role } from "@hotel-chicago/types";
import { UserRound } from "lucide-react-native";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
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

interface FormulaireEdition {
  nom: string;
  email: string;
  motDePasse: string;
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
  // Compte en cours d'édition (Phase 16 : rotation des identifiants quand
  // un employé part — le compte de rôle est unique, on le modifie).
  const [edition, setEdition] = useState<Utilisateur | null>(null);
  const [formEdition, setFormEdition] = useState<FormulaireEdition>({ nom: "", email: "", motDePasse: "" });
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  /** Rôles déjà dotés d'un compte — un seul compte par rôle par hôtel
   * (règle API, UtilisateursService.create). */
  const rolesPris = new Set((utilisateurs ?? []).map((u) => u.role));

  function ouvrirCreation() {
    setFormulaire(FORMULAIRE_VIDE);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  function ouvrirEdition(utilisateur: Utilisateur) {
    setEdition(utilisateur);
    setFormEdition({ nom: utilisateur.nom, email: utilisateur.email ?? "", motDePasse: "" });
    setErreurEdition(null);
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

  async function enregistrerEdition() {
    if (!edition) return;
    const nom = formEdition.nom.trim();
    const email = formEdition.email.trim();
    const motDePasse = formEdition.motDePasse;
    if (!nom || !email) {
      setErreurEdition("Le nom et l'email sont obligatoires.");
      return;
    }
    if (motDePasse && motDePasse.length < 8) {
      setErreurEdition("Le mot de passe doit contenir au moins 8 caractères (ou laisser vide pour ne pas le changer).");
      return;
    }
    const donnees: DonneesModificationUtilisateur = {};
    if (nom !== edition.nom) donnees.nom = nom;
    if (email !== (edition.email ?? "")) donnees.email = email;
    if (motDePasse) donnees.motDePasse = motDePasse;
    if (!donnees.nom && !donnees.email && !donnees.motDePasse) {
      setEdition(null);
      return;
    }
    setEnEnvoi(true);
    setErreurEdition(null);
    try {
      await client.modifierUtilisateur(edition.id, donnees);
      setEdition(null);
      recharger();
    } catch (e) {
      setErreurEdition(e instanceof Error ? e.message : "Erreur inconnue.");
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: espacements.s3 }}>
                <Pressable onPress={() => ouvrirEdition(item)} hitSlop={8} accessibilityLabel={`Modifier ${item.nom}`}>
                  <Text style={styles.lienModifier}>Modifier</Text>
                </Pressable>
                <Switch
                  value={item.actif}
                  onValueChange={() => basculerActif(item)}
                  disabled={idsEnCours.has(item.id)}
                />
              </View>
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
          {ROLES.map((r) => {
            const pris = rolesPris.has(r);
            return (
              <Pressable
                key={r}
                style={[styles.optionRole, formulaire.role === r && styles.optionRoleActive, pris && styles.optionRoleDesactive]}
                disabled={pris}
                onPress={() => setFormulaire((f) => ({ ...f, role: r }))}
              >
                <Text style={[styles.optionRoleTexte, formulaire.role === r && styles.optionRoleTexteActif, pris && styles.optionRoleTexteDesactive]}>
                  {LIBELLE_ROLE[r]}
                  {pris ? " · déjà créé" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {ROLES.every((r) => rolesPris.has(r)) && (
          <Text style={styles.aide}>
            Un seul compte par rôle est autorisé. Modifiez un compte existant pour le transmettre à un nouvel
            employé.
          </Text>
        )}

        {erreurFormulaire && <Text style={styles.erreurFormulaire}>{erreurFormulaire}</Text>}

        <Pressable style={styles.bouton} onPress={creer} disabled={enEnvoi}>
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Créer le compte"}</Text>
        </Pressable>
      </FeuilleModale>

      <FeuilleModale
        visible={edition !== null}
        onFermer={() => setEdition(null)}
        titre={edition ? `Modifier — ${LIBELLE_ROLE[edition.role]}` : "Modifier"}
      >
        <Text style={styles.aide}>
          Changez le nom, l'email ou le mot de passe pour transmettre le compte à un nouvel employé.
        </Text>

        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.champ}
          value={formEdition.nom}
          onChangeText={(v) => setFormEdition((f) => ({ ...f, nom: v }))}
          placeholderTextColor={couleurs.encreFaible}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.champ}
          value={formEdition.email}
          onChangeText={(v) => setFormEdition((f) => ({ ...f, email: v }))}
          placeholderTextColor={couleurs.encreFaible}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Nouveau mot de passe</Text>
        <TextInput
          style={styles.champ}
          value={formEdition.motDePasse}
          onChangeText={(v) => setFormEdition((f) => ({ ...f, motDePasse: v }))}
          placeholder="Laisser vide pour ne pas le changer"
          placeholderTextColor={couleurs.encreFaible}
          secureTextEntry
        />

        {erreurEdition && <Text style={styles.erreurFormulaire}>{erreurEdition}</Text>}

        <Pressable style={styles.bouton} onPress={enregistrerEdition} disabled={enEnvoi}>
          <Text style={styles.boutonTexte}>{enEnvoi ? "…" : "Enregistrer"}</Text>
        </Pressable>
      </FeuilleModale>

      {/* FAB bas-droite — standard Android, sous le pouce. */}
      <BoutonAjouterFlottant onPress={ouvrirCreation} accessibilityLabel="Nouveau compte" />
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
  lienModifier: { fontSize: 13, fontWeight: "600", color: couleurs.bleu },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: espacements.s2, lineHeight: 17 },
  optionRoleDesactive: { opacity: 0.45 },
  optionRoleTexteDesactive: { color: couleurs.encreFaible },

  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1, marginTop: espacements.s2 },
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
  selecteurRole: { flexDirection: "row", gap: espacements.s2 },
  optionRole: {
    flex: 1,
    minHeight: 44,
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
    minHeight: 44,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s4,
  },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
