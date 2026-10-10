import { Alert } from "react-native";

export interface OptionsConfirmation {
  titre: string;
  /** Dit précisément quoi / qui / combien (« Confirmer 120,00 $ en espèces ? »). */
  message: string;
  /** Libellé du bouton d'action : un verbe précis (« Supprimer », « Facturer »), jamais « OK ». */
  libelleConfirmer: string;
  /** Action irréversible : bouton affiché en rouge sur les téléphones qui le permettent. */
  destructif?: boolean;
  /** Libellé du bouton qui renonce (« Annuler » par défaut) ; à préciser quand l'action elle-même s'appelle « Annuler… ». */
  libelleRefuser?: string;
  onConfirmer: () => void | Promise<void>;
}

/** Demande confirmation avant une action irréversible ou monétaire. Toucher à côté ou « Retour » = annuler. */
export function confirmerAction({ titre, message, libelleConfirmer, destructif = false, libelleRefuser = "Annuler", onConfirmer }: OptionsConfirmation): void {
  Alert.alert(
    titre,
    message,
    [
      { text: libelleRefuser, style: "cancel" },
      {
        text: libelleConfirmer,
        style: destructif ? "destructive" : "default",
        onPress: () => {
          // L'appelant gère ses propres erreurs ; on évite seulement un rejet non rattrapé.
          void Promise.resolve(onConfirmer()).catch(() => undefined);
        },
      },
    ],
    { cancelable: true }
  );
}
