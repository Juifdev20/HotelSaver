import * as React from "react";
import { useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ErreurApi, type ClientApi } from "@hotel-chicago/api-client";
import { construireEtiquette, genererEan13Interne } from "@hotel-chicago/receipts";
import { Devise, Produit, Role, TypeProduit, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Camera, Printer, UtensilsCrossed } from "lucide-react-native";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { FeuilleModale } from "../composants/FeuilleModale";
import { SelecteurPhotos, nettoyerImages } from "../composants/SelecteurPhotos";
import { useDonnee } from "../hooks/useDonnee";
import { ScannerCodeBarres } from "../composants/ScannerCodeBarres";
import { imprimerLignes } from "../impression/imprimante";
import { ApercuRecu } from "../composants/ApercuRecu";
import { lireMontant, lireQuantite, lireTauxChange } from "@hotel-chicago/regles";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";

export interface EcranMenuProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  onRetour: () => void;
}

interface FormulaireProduit {
  nom: string;
  categorie: string;
  prix: string;
  devise: Devise;
  typeProduit: TypeProduit;
  seuilAlerte: string;
  prixAchat: string;
  quantiteInitiale: string;
  portionsDisponibles: string;
  description: string;
  commandableEnLigne: boolean;
  actif: boolean;
  /** ARTICLE : code du fabricant (scanné) ou EAN-13 interne (généré). */
  codeBarres: string;
}

const FORMULAIRE_VIDE: FormulaireProduit = {
  nom: "",
  categorie: "",
  prix: "",
  devise: Devise.USD,
  typeProduit: TypeProduit.ARTICLE,
  seuilAlerte: "",
  prixAchat: "",
  quantiteInitiale: "",
  portionsDisponibles: "",
  description: "",
  commandableEnLigne: false,
  actif: true,
  codeBarres: "",
};

/** Placeholders adaptés au type : un formulaire « plat » ne doit pas suggérer
 * « Coca-Cola » (remonté par le patron : pas professionnel). */
function placeholdersPour(typeProduit: TypeProduit) {
  return typeProduit === TypeProduit.PLAT
    ? { nom: "Poulet braisé", categorie: "Plats" }
    : { nom: "Coca-Cola", categorie: "Boissons" };
}

/** Menu cafétaria — CAFETARIA en lecture seule, PATRON gère (créer/modifier/
 * supprimer), même matrice que ProduitsController côté API. */
export function EcranMenu({ client, utilisateur, onRetour }: EcranMenuProps) {
  const peutModifier = utilisateur.role === Role.PATRON;
  const { donnee: produits, erreur, enCours, recharger } = useDonnee(() => client.listerProduits(), client);

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [produitEnEdition, setProduitEnEdition] = useState<Produit | null>(null);
  // Code-barres (08/10/2026) : scan du code fabricant, génération, étiquette.
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const [codeGenere, setCodeGenere] = useState(false);
  const [exemplaires, setExemplaires] = useState("1");
  const [messageEtiquette, setMessageEtiquette] = useState<string | null>(null);
  // Étape « Étiquettes » : juste après l'enregistrement d'un article avec
  // code-barres, ou depuis le bouton « Étiquette » de la liste (réimpression).
  const [etiquette, setEtiquette] = useState<{ produit: Produit; enregistre: boolean } | null>(null);
  const [enImpression, setEnImpression] = useState(false);
  // « Enregistrer » imprime aussi les étiquettes d'un code nouveau (un seul
  // geste pour le patron) : null = nombre automatique, sinon saisi à la main.
  const [nbEtiquettesSaisi, setNbEtiquettesSaisi] = useState<string | null>(null);
  const [messageListe, setMessageListe] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<FormulaireProduit>(FORMULAIRE_VIDE);
  // Valeurs à l'ouverture de la feuille : sert à savoir si l'on a modifié quelque chose (toucher le fond ne doit pas tout effacer).
  const formulaireInitial = useRef<{ formulaire: FormulaireProduit; photos: string[] }>({ formulaire: FORMULAIRE_VIDE, photos: [] });
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  // Photo du plat (0 ou 1 — max 1) : mêmes gardes-fous que Chambres —
  // `envoyees` pour nettoyer celles abandonnées, `avant` pour ne pas effacer
  // la photo existante si l'édition est annulée.
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosAvant, setPhotosAvant] = useState<string[]>([]);
  const [photosEnvoyees, setPhotosEnvoyees] = useState<string[]>([]);

  function ouvrirCreation() {
    formulaireInitial.current = { formulaire: FORMULAIRE_VIDE, photos: [] };
    setProduitEnEdition(null);
    setFormulaire(FORMULAIRE_VIDE);
    setCodeGenere(false);
    setMessageEtiquette(null);
    setNbEtiquettesSaisi(null);
    setPhotos([]);
    setPhotosAvant([]);
    setPhotosEnvoyees([]);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  function ouvrirEdition(produit: Produit) {
    setProduitEnEdition(produit);
    const initial: FormulaireProduit = {
      nom: produit.nom,
      categorie: produit.categorie,
      prix: produit.prix,
      devise: produit.devise,
      typeProduit: produit.typeProduit === TypeProduit.PLAT ? TypeProduit.PLAT : TypeProduit.ARTICLE,
      seuilAlerte: produit.seuilAlerte,
      prixAchat: produit.prixAchat ?? "",
      quantiteInitiale: "",
      portionsDisponibles: produit.portionsDisponibles != null ? String(produit.portionsDisponibles) : "",
      description: produit.description ?? "",
      commandableEnLigne: produit.commandableEnLigne === true,
      actif: produit.actif,
      codeBarres: produit.codeBarres ?? "",
    };
    formulaireInitial.current = { formulaire: initial, photos: produit.photo ? [produit.photo] : [] };
    setFormulaire(initial);
    setCodeGenere(false);
    setMessageEtiquette(null);
    setNbEtiquettesSaisi(null);
    setPhotos(produit.photo ? [produit.photo] : []);
    setPhotosAvant(produit.photo ? [produit.photo] : []);
    setPhotosEnvoyees([]);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  const formulaireModifie =
    JSON.stringify(formulaire) !== JSON.stringify(formulaireInitial.current.formulaire) ||
    JSON.stringify(photos) !== JSON.stringify(formulaireInitial.current.photos);

  /** Fermer sans enregistrer : les images envoyées pendant l'édition ne
   * doivent pas rester orphelines dans le stockage (même pattern que
   * EcranChambres). */
  function fermerModale() {
    void nettoyerImages(client, [], photosEnvoyees, photosAvant);
    setModaleOuverte(false);
  }

  /** EAN-13 interne (préfixe 2) : unique côté serveur ; en cas de collision
   * (409), `enregistrer` en génère un autre et réessaie. */
  function genererCode() {
    setFormulaire((f) => ({ ...f, codeBarres: genererEan13Interne() }));
    setCodeGenere(true);
  }

  /** Étiquette (nom, prix, code-barres) sur l'imprimante configurée — seulement
   * pour un code déjà enregistré, sinon l'étiquette ne serait reconnue nulle part. */
  async function imprimerEtiquette(produit: Produit | null = produitEnEdition) {
    if (!produit?.codeBarres) return;
    setMessageEtiquette(null);
    setEnImpression(true);
    try {
      const n = Math.max(1, Math.round(Number(exemplaires)) || 1);
      await imprimerLignes(construireEtiquette(produit, n));
      setMessageEtiquette(`${n} étiquette${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""} à l'imprimante.`);
    } catch (e) {
      setMessageEtiquette(`Impression impossible : ${messageErreur(e, "l'imprimante n'a pas répondu.")}`);
    } finally {
      setEnImpression(false);
    }
  }

  /** Ouvre l'étape « Étiquettes » ; `exemplairesParDefaut` = une étiquette par
   * article mis en stock à la création. */
  function ouvrirEtiquettes(produit: Produit, enregistre: boolean, exemplairesParDefaut = 1) {
    setExemplaires(String(Math.max(1, exemplairesParDefaut)));
    setMessageEtiquette(null);
    setEtiquette({ produit, enregistre });
  }

  // Code nouveau (création, ou code ajouté/changé) d'un article : ses
  // étiquettes partent à l'imprimante dès l'enregistrement. Une retouche du
  // prix ou du nom (même code) n'imprime rien.
  const codeSaisi = formulaire.codeBarres.replace(/\s+/g, "");
  const codeNouveau =
    formulaire.typeProduit !== TypeProduit.PLAT && codeSaisi !== "" && codeSaisi !== (produitEnEdition?.codeBarres ?? "");
  // Par défaut : une étiquette par article en stock (quantité initiale à la
  // création, stock actuel sinon), au moins 1, sans limite.
  const nbEtiquettesAuto = Math.max(
    1,
    Math.round(Number(produitEnEdition ? produitEnEdition.stockActuel : formulaire.quantiteInitiale) || 1)
  );
  const nbEtiquettesDefaut = codeNouveau ? nbEtiquettesAuto : 0;
  const nbEtiquettes =
    formulaire.typeProduit !== TypeProduit.PLAT && codeSaisi !== ""
      ? Math.max(0, Math.round(Number(nbEtiquettesSaisi ?? nbEtiquettesDefaut)) || 0)
      : 0;

  async function enregistrer(essai = 0): Promise<void> {
    if (!formulaire.nom.trim() || !formulaire.categorie.trim()) {
      setErreurFormulaire("Le nom et la catégorie sont obligatoires.");
      return;
    }
    const prixLu = lireMontant(formulaire.prix, formulaire.devise, { max: 100_000_000 });
    if (!prixLu.ok) {
      setErreurFormulaire(`Prix : ${prixLu.message}`);
      return;
    }
    const prixNombre = prixLu.valeur;
    const prixAchatLu = formulaire.prixAchat.trim() ? lireMontant(formulaire.prixAchat, formulaire.devise, { max: 100_000_000 }) : null;
    if (prixAchatLu && !prixAchatLu.ok) {
      setErreurFormulaire(`Prix d'achat : ${prixAchatLu.message}`);
      return;
    }
    const seuilLu = formulaire.seuilAlerte.trim() ? lireQuantite(formulaire.seuilAlerte, { autoriserZero: true, max: 1_000_000 }) : null;
    if (seuilLu && !seuilLu.ok) {
      setErreurFormulaire(`Seuil d'alerte : ${seuilLu.message}`);
      return;
    }
    const quantiteInitialeLu = formulaire.quantiteInitiale.trim() ? lireQuantite(formulaire.quantiteInitiale, { autoriserZero: true, max: 1_000_000 }) : null;
    if (quantiteInitialeLu && !quantiteInitialeLu.ok) {
      setErreurFormulaire(`Quantité initiale : ${quantiteInitialeLu.message}`);
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      const estPlat = formulaire.typeProduit === TypeProduit.PLAT;
      // Les champs de l'autre type ne sont pas envoyés (un plat n'a ni seuil ni
      // prix d'achat, un article n'a ni description ni publication au site).
      const seuilAlerte = estPlat ? undefined : seuilLu && seuilLu.ok ? seuilLu.valeur : undefined;
      const prixAchat = estPlat ? undefined : prixAchatLu && prixAchatLu.ok ? prixAchatLu.valeur : undefined;
      const description = estPlat ? formulaire.description.trim() || undefined : undefined;
      const commandableEnLigne = estPlat ? formulaire.commandableEnLigne : false;
      // Vide = illimité (on cuisine à la commande) ; null explicite en
      // modification pour repasser un plat en illimité.
      const portions = formulaire.portionsDisponibles.trim();
      const portionsDisponibles = estPlat ? (portions ? Number(portions) : null) : undefined;
      const code = formulaire.codeBarres.replace(/\s+/g, "");
      let enregistre: Produit;
      if (produitEnEdition) {
        enregistre = await client.modifierProduit(produitEnEdition.id, {
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          typeProduit: formulaire.typeProduit,
          photo: estPlat ? (photos[0] ?? null) : undefined,
          seuilAlerte,
          prixAchat,
          description,
          commandableEnLigne,
          portionsDisponibles,
          actif: formulaire.actif,
          codeBarres: estPlat ? undefined : code || null,
        });
      } else {
        enregistre = await client.creerProduit({
          nom: formulaire.nom.trim(),
          categorie: formulaire.categorie.trim(),
          prix: prixNombre,
          devise: formulaire.devise,
          typeProduit: formulaire.typeProduit,
          photo: estPlat ? photos[0] : undefined,
          seuilAlerte,
          prixAchat,
          stockActuel: !estPlat && quantiteInitialeLu && quantiteInitialeLu.ok ? quantiteInitialeLu.valeur : undefined,
          description,
          commandableEnLigne,
          portionsDisponibles: estPlat && portions ? Number(portions) : undefined,
          codeBarres: !estPlat && code ? code : undefined,
        });
      }
      // Enregistré : on ne garde dans le stockage que la photo conservée.
      void nettoyerImages(client, photosAvant, photosEnvoyees, photos);
      setModaleOuverte(false);
      recharger();
      // Un seul geste : les étiquettes du code nouveau partent directement.
      // Si l'impression échoue, le produit reste enregistré et l'écran
      // « Étiquettes » s'ouvre pour réessayer sans rien ressaisir.
      const n = nbEtiquettes;
      if (!estPlat && enregistre.codeBarres && n > 0) {
        setMessageListe(`Impression de ${n} étiquette${n > 1 ? "s" : ""} pour « ${enregistre.nom} »…`);
        try {
          await imprimerLignes(construireEtiquette(enregistre, n));
          setMessageListe(`✓ « ${enregistre.nom} » enregistré — ${n} étiquette${n > 1 ? "s" : ""} imprimée${n > 1 ? "s" : ""}.`);
        } catch (erreurImpression) {
          setMessageListe(null);
          ouvrirEtiquettes(enregistre, true, n);
          setMessageEtiquette(
            `Produit enregistré, mais l'impression a échoué : ${messageErreur(erreurImpression, "l'imprimante n'a pas répondu")}`
          );
        }
      } else {
        setMessageListe(`✓ « ${enregistre.nom} » enregistré.`);
      }
    } catch (e) {
      // Code généré déjà pris (très rare) : un autre, et on réessaie.
      if (e instanceof ErreurApi && e.statusCode === 409 && codeGenere && essai < 3) {
        const nouveau = genererEan13Interne();
        formulaire.codeBarres = nouveau;
        setFormulaire((f) => ({ ...f, codeBarres: nouveau }));
        return enregistrer(essai + 1);
      }
      setErreurFormulaire(messageErreur(e, "Le produit n'a pas pu être enregistré. Réessayez."));
    } finally {
      setEnEnvoi(false);
    }
  }

  /** Supprimer un produit est définitif : on nomme le produit (retour U3). */
  function demanderSuppression() {
    if (!produitEnEdition) return;
    confirmerAction({
      titre: `Supprimer « ${produitEnEdition.nom} » ?`,
      message: `${produitEnEdition.categorie} · ${formatMontant(produitEnEdition.prix, produitEnEdition.devise)}.\nLe produit disparaît du menu et de la caisse. Les ventes déjà faites restent dans les reçus.`,
      libelleConfirmer: "Supprimer le produit",
      libelleRefuser: "Garder",
      destructif: true,
      onConfirmer: supprimer,
    });
  }

  async function supprimer() {
    if (!produitEnEdition || enEnvoi) return;
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.supprimerProduit(produitEnEdition.id);
      // Produit supprimé : sa photo n'est plus référencée nulle part.
      void nettoyerImages(client, photosAvant, photosEnvoyees, []);
      setModaleOuverte(false);
      recharger();
    } catch (e) {
      setErreurFormulaire(messageErreur(e, "Le produit n'a pas pu être supprimé. Réessayez."));
    } finally {
      setEnEnvoi(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Menu"
        sousTitre={peutModifier ? "Gérez les produits en vente." : "Seul le Patron peut modifier le menu."}
        onRetour={onRetour}
      />

      {erreur && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}
      {messageListe && (
        <Pressable style={styles.messageListe} onPress={() => setMessageListe(null)} accessibilityRole="button" accessibilityLabel={`${messageListe}. Toucher pour fermer le message`}>
          <Text style={styles.messageListeTexte}>{messageListe}</Text>
        </Pressable>
      )}

      {produits?.length === 0 && (
        <View style={styles.videConteneur}>
          <UtensilsCrossed size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun produit enregistré.</Text>
        </View>
      )}

      <FlatList
        data={produits ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.carte}
            onPress={() => peutModifier && ouvrirEdition(item)}
            disabled={!peutModifier}
            accessibilityRole={peutModifier ? "button" : undefined}
            accessibilityHint={peutModifier ? "Modifier ce produit" : undefined}
          >
            <View style={styles.carteEntete}>
              <Text style={styles.nom}>{item.nom}</Text>
              <View style={{ flexDirection: "row", gap: espacements.s1 }}>
                {item.typeProduit === TypeProduit.PLAT && (
                  <View style={styles.badgePlat}>
                    <Text style={styles.badgePlatTexte}>Plat</Text>
                  </View>
                )}
                {item.commandableEnLigne && (
                  <View style={styles.badgeSite}>
                    <Text style={styles.badgeSiteTexte}>Site</Text>
                  </View>
                )}
                {!item.actif && (
                  <View style={styles.badgeInactif}>
                    <Text style={styles.badgeInactifTexte}>Inactif</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.categorie}>{item.categorie}</Text>
            <View style={styles.carteBas}>
              <Text style={styles.prix}>{formatMontant(item.prix, item.devise)}</Text>
              <Text style={styles.stock}>
                {item.typeProduit === TypeProduit.PLAT
                  ? item.portionsDisponibles == null
                    ? "Préparé à la commande"
                    : item.portionsDisponibles > 0
                      ? `Portions : ${item.portionsDisponibles}`
                      : "Épuisé"
                  : `Stock : ${item.stockActuel}`}
              </Text>
            </View>
            {item.typeProduit !== TypeProduit.PLAT && item.codeBarres && (
              <View style={styles.carteCode}>
                <Text style={styles.codeTexte}>▌▍▌ {item.codeBarres}</Text>
                <Pressable
                  style={styles.boutonEtiquette}
                  onPress={() => ouvrirEtiquettes(item, false)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Imprimer l'étiquette de ${item.nom}`}
                >
                  <Printer size={14} color={couleurs.bleu} />
                  <Text style={styles.boutonCodeTexte}>Étiquette</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        )}
      />

      <FeuilleModale
        visible={etiquette !== null}
        onFermer={() => setEtiquette(null)}
        titre={etiquette?.enregistre ? "Produit enregistré" : "Imprimer l'étiquette"}
        enCours={enImpression}
      >
        {etiquette && (
          <>
            {etiquette.enregistre && (
              <Text style={styles.confirmation}>
                ✓ « {etiquette.produit.nom} » est enregistré. Imprimez ses étiquettes et collez-les sur les articles pour les scanner à la caisse.
              </Text>
            )}
            <ApercuRecu lignes={construireEtiquette(etiquette.produit, 1)} />
            <Text style={styles.label}>Nombre d'étiquettes</Text>
            <TextInput
              style={styles.champ}
              value={exemplaires}
              onChangeText={setExemplaires}
              keyboardType="number-pad"
              accessibilityLabel="Nombre d'étiquettes"
            />
            {messageEtiquette && (
              <Text style={styles.aideSwitch} accessibilityRole="alert">
                {messageEtiquette}
              </Text>
            )}
            <View style={styles.boutonsModale}>
              <Pressable style={styles.boutonSecondaireEtiquette} onPress={() => setEtiquette(null)} accessibilityRole="button">
                <Text style={styles.boutonCodeTexte}>Terminer</Text>
              </Pressable>
              <Pressable
                style={[styles.bouton, enImpression && { opacity: 0.6 }]}
                onPress={() => void imprimerEtiquette(etiquette.produit)}
                disabled={enImpression}
                accessibilityRole="button"
                accessibilityState={{ disabled: enImpression, busy: enImpression }}
              >
                <Text style={styles.boutonTexte}>{enImpression ? "Impression…" : "Imprimer les étiquettes"}</Text>
              </Pressable>
            </View>
          </>
        )}
      </FeuilleModale>

      <FeuilleModale
        visible={modaleOuverte}
        onFermer={fermerModale}
        titre={produitEnEdition ? "Modifier le produit" : "Nouveau produit"}
        modifie={formulaireModifie}
        enCours={enEnvoi}
      >
        <Text style={styles.label}>Type de produit</Text>
        <View style={styles.selecteurType} accessibilityRole="radiogroup" accessibilityLabel="Type de produit">
          {([
            { valeur: TypeProduit.ARTICLE, titre: "Article comptoir", aide: "Stocké : bière, sucre…" },
            { valeur: TypeProduit.PLAT, titre: "Plat préparé", aide: "Cuisiné : publiable sur le site" },
          ] as const).map((t) => (
            <Pressable
              key={t.valeur}
              style={[styles.optionType, formulaire.typeProduit === t.valeur && styles.optionTypeActive]}
              onPress={() => setFormulaire((f) => ({ ...f, typeProduit: t.valeur }))}
              accessibilityRole="radio"
              accessibilityState={{ checked: formulaire.typeProduit === t.valeur }}
              accessibilityLabel={`${t.titre}. ${t.aide}`}
            >
              <Text style={[styles.optionTypeTitre, formulaire.typeProduit === t.valeur && styles.optionTypeTitreActif]}>
                {t.titre}
              </Text>
              <Text style={styles.optionTypeAide}>{t.aide}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.nom}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, nom: v }))}
          placeholder={placeholdersPour(formulaire.typeProduit).nom}
          placeholderTextColor={couleurs.encreFaible}
          accessibilityLabel="Nom du produit"
        />

        <Text style={styles.label}>Catégorie</Text>
        <TextInput
          style={styles.champ}
          value={formulaire.categorie}
          onChangeText={(v) => setFormulaire((f) => ({ ...f, categorie: v }))}
          placeholder={placeholdersPour(formulaire.typeProduit).categorie}
          placeholderTextColor={couleurs.encreFaible}
          accessibilityLabel="Catégorie"
        />

        <View style={styles.ligneChamps}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Prix</Text>
            <TextInput
              style={styles.champ}
              value={formulaire.prix}
              onChangeText={(v) => setFormulaire((f) => ({ ...f, prix: v }))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Prix"
            />
          </View>
          <View style={styles.selecteurDevise} accessibilityRole="radiogroup" accessibilityLabel="Devise du prix">
            {[Devise.USD, Devise.CDF].map((d) => (
              <Pressable
                key={d}
                style={[styles.optionDevise, formulaire.devise === d && styles.optionDeviseActive]}
                onPress={() => setFormulaire((f) => ({ ...f, devise: d }))}
                accessibilityRole="radio"
                accessibilityState={{ checked: formulaire.devise === d }}
                accessibilityLabel={d === Devise.USD ? "Dollars (USD)" : "Francs congolais (CDF)"}
              >
                <Text style={[styles.optionDeviseTexte, formulaire.devise === d && styles.optionDeviseTexteActif]}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {formulaire.typeProduit === TypeProduit.ARTICLE && (
          <>
            {!produitEnEdition && (
              <>
                <Text style={styles.label}>Quantité initiale en stock (optionnel)</Text>
                <TextInput
                  style={styles.champ}
                  value={formulaire.quantiteInitiale}
                  onChangeText={(v) => setFormulaire((f) => ({ ...f, quantiteInitiale: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0 — ensuite via l'écran Stock"
                  placeholderTextColor={couleurs.encreFaible}
                  accessibilityLabel="Quantité initiale en stock (optionnel)"
                />
              </>
            )}

            <Text style={styles.label}>Seuil d'alerte (optionnel)</Text>
            <TextInput
              style={styles.champ}
              value={formulaire.seuilAlerte}
              onChangeText={(v) => setFormulaire((f) => ({ ...f, seuilAlerte: v }))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Seuil d'alerte (optionnel)"
            />

            <Text style={styles.label}>Prix d'achat (optionnel)</Text>
            <TextInput
              style={styles.champ}
              value={formulaire.prixAchat}
              onChangeText={(v) => setFormulaire((f) => ({ ...f, prixAchat: v }))}
              keyboardType="decimal-pad"
              placeholder="0.00 — pour calcul de marge"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Prix d'achat (optionnel)"
            />

            <Text style={styles.label}>Code-barres (optionnel)</Text>
            <View style={styles.ligneChamps}>
              <TextInput
                style={[styles.champ, { flex: 1 }]}
                value={formulaire.codeBarres}
                onChangeText={(v) => {
                  setCodeGenere(false);
                  setFormulaire((f) => ({ ...f, codeBarres: v }));
                }}
                keyboardType="number-pad"
                placeholder="Scanner ou générer"
                placeholderTextColor={couleurs.encreFaible}
                accessibilityLabel="Code-barres (optionnel)"
              />
              <Pressable style={styles.boutonCode} onPress={() => setScannerOuvert(true)} accessibilityRole="button" accessibilityLabel="Scanner le code du fabricant">
                <Camera size={18} color={couleurs.bleu} />
              </Pressable>
              <Pressable style={styles.boutonCode} onPress={genererCode} accessibilityRole="button" accessibilityLabel="Générer un code-barres">
                <Text style={styles.boutonCodeTexte}>Générer</Text>
              </Pressable>
            </View>
            <Text style={styles.aideSwitch}>
              Code du fabricant sur l'emballage, sinon « Générer » puis imprimez l'étiquette. Le code ne contient pas le prix.
            </Text>

            <Text style={styles.label}>Nombre d'étiquettes code-barres à imprimer</Text>
            <TextInput
              style={[styles.champ, { width: 90 }]}
              value={nbEtiquettesSaisi ?? String(nbEtiquettesDefaut)}
              onChangeText={setNbEtiquettesSaisi}
              keyboardType="number-pad"
              accessibilityLabel="Nombre d'étiquettes code-barres à imprimer"
            />
            <Text style={styles.aideSwitch}>
              {codeSaisi === ""
                ? "Générez ou scannez d'abord un code : les étiquettes s'impriment à l'enregistrement."
                : "Imprimées automatiquement en appuyant sur Enregistrer. 0 = aucune."}
            </Text>
            {messageEtiquette && (
              <Text style={styles.aideSwitch} accessibilityRole="alert">
                {messageEtiquette}
              </Text>
            )}

            <ScannerCodeBarres
              visible={scannerOuvert}
              mode="unique"
              onCode={(code) => {
                setCodeGenere(false);
                setFormulaire((f) => ({ ...f, codeBarres: code }));
              }}
              onFermer={() => setScannerOuvert(false)}
            />
          </>
        )}

        {formulaire.typeProduit === TypeProduit.PLAT && (
          <>
            <SelecteurPhotos
              client={client}
              usage="produit"
              photos={photos}
              max={1}
              onChange={setPhotos}
              onEnvoyee={(url) => setPhotosEnvoyees((l) => [...l, url])}
              libelle="Photo du plat (optionnel, visible sur le site)"
            />

            <Text style={styles.label}>Portions disponibles (optionnel)</Text>
            <TextInput
              style={styles.champ}
              value={formulaire.portionsDisponibles}
              onChangeText={(v) => setFormulaire((f) => ({ ...f, portionsDisponibles: v }))}
              keyboardType="number-pad"
              placeholder="Vide = illimité (cuisine à la commande)"
              placeholderTextColor={couleurs.encreFaible}
              accessibilityLabel="Portions disponibles (optionnel)"
            />

            <Text style={styles.label}>Description sur le site (optionnel)</Text>
            <TextInput
              style={[styles.champ, styles.champMulti]}
              value={formulaire.description}
              onChangeText={(v) => setFormulaire((f) => ({ ...f, description: v }))}
              placeholder="Ex. Poulet braisé, frites et salade"
              placeholderTextColor={couleurs.encreFaible}
              multiline
              accessibilityLabel="Description sur le site (optionnel)"
            />

            <View style={styles.ligneSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Visible et commandable sur le site</Text>
                <Text style={styles.aideSwitch}>
                  Le plat apparaît dans « Cuisine » du site web de l'hôtel (si la commande en ligne est activée dans Paramètres).
                </Text>
              </View>
              <Switch
                value={formulaire.commandableEnLigne}
                onValueChange={(v) => setFormulaire((f) => ({ ...f, commandableEnLigne: v }))}
                accessibilityLabel="Visible et commandable sur le site"
              />
            </View>
          </>
        )}

        {produitEnEdition && (
          <View style={styles.ligneSwitch}>
            <Text style={styles.label}>Actif à la vente</Text>
            <Switch value={formulaire.actif} onValueChange={(v) => setFormulaire((f) => ({ ...f, actif: v }))} accessibilityLabel="Actif à la vente" />
          </View>
        )}

        {erreurFormulaire && (
          <Text style={styles.erreurFormulaire} accessibilityRole="alert">
            {erreurFormulaire}
          </Text>
        )}

        <View style={styles.boutonsModale}>
          {produitEnEdition && (
            <Pressable
              style={styles.boutonDanger}
              onPress={demanderSuppression}
              disabled={enEnvoi}
              accessibilityRole="button"
              accessibilityState={{ disabled: enEnvoi }}
            >
              <Text style={styles.boutonDangerTexte}>Supprimer</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.bouton}
            onPress={() => void enregistrer()}
            disabled={enEnvoi}
            accessibilityRole="button"
            accessibilityState={{ disabled: enEnvoi, busy: enEnvoi }}
          >
            <Text style={styles.boutonTexte}>
              {enEnvoi
                ? "…"
                : nbEtiquettes > 0
                  ? `Enregistrer et imprimer ${nbEtiquettes} étiquette${nbEtiquettes > 1 ? "s" : ""}`
                  : "Enregistrer"}
            </Text>
          </Pressable>
        </View>
      </FeuilleModale>

      {/* FAB bas-droite — modification réservée au PATRON (comme avant). */}
      {peutModifier && <BoutonAjouterFlottant onPress={ouvrirCreation} accessibilityLabel="Nouveau produit" />}
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
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  badgeInactif: { backgroundColor: couleurs.dangerClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeInactifTexte: { fontSize: 10, fontWeight: "700", color: couleurs.danger },
  badgeSite: { backgroundColor: couleurs.bleuClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeSiteTexte: { fontSize: 10, fontWeight: "700", color: couleurs.bleu },
  badgePlat: { backgroundColor: "#E8F5E9", borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgePlatTexte: { fontSize: 10, fontWeight: "700", color: "#2E7D32" },
  categorie: { fontSize: 13, color: couleurs.encreAttenuee },
  carteBas: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  prix: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  stock: { fontSize: 13, color: couleurs.encreAttenuee },

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
  ligneChamps: { flexDirection: "row", gap: espacements.s3, alignItems: "flex-end" },
  boutonCode: {
    minHeight: 44,
    paddingHorizontal: espacements.s3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.bleuClair,
  },
  boutonCodeTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  carteCode: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: espacements.s1 },
  codeTexte: { fontSize: 12, color: couleurs.encreAttenuee, letterSpacing: 1 },
  boutonEtiquette: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: espacements.s2,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bleu,
    backgroundColor: couleurs.bleuClair,
  },
  confirmation: { fontSize: 14, color: couleurs.succes, fontWeight: "600" },
  messageListe: {
    marginHorizontal: espacements.s4,
    marginBottom: espacements.s2,
    padding: espacements.s3,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.succesClair,
  },
  messageListeTexte: { fontSize: 14, color: couleurs.encre, fontWeight: "600" },
  boutonSecondaireEtiquette: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  selecteurDevise: { flexDirection: "row", borderRadius: rayons.sm, overflow: "hidden", borderWidth: 1, borderColor: couleurs.bordure },
  optionDevise: { paddingHorizontal: espacements.s3, minHeight: 44, alignItems: "center", justifyContent: "center" },
  optionDeviseActive: { backgroundColor: couleurs.bleu },
  optionDeviseTexte: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  optionDeviseTexteActif: { color: "#fff" },
  champMulti: { minHeight: 72, paddingTop: espacements.s3, textAlignVertical: "top" },
  selecteurType: { flexDirection: "row", gap: espacements.s2, marginBottom: espacements.s2 },
  optionType: {
    flex: 1,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    padding: espacements.s3,
    gap: 2,
    backgroundColor: couleurs.surface100,
  },
  optionTypeActive: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  optionTypeTitre: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  optionTypeTitreActif: { color: couleurs.bleu },
  optionTypeAide: { fontSize: 12, color: couleurs.encreFaible },
  aideSwitch: { fontSize: 12, color: couleurs.encreFaible },
  ligneSwitch: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  erreurFormulaire: { color: couleurs.danger, fontSize: 13 },
  boutonsModale: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s2 },
  boutonDanger: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDangerTexte: { color: couleurs.danger, fontWeight: "700", fontSize: 14 },
  bouton: { flex: 1, minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
