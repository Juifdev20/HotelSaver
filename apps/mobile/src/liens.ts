import { Linking } from "react-native";

/** Ouvre un lien reçu du serveur (PDF…) seulement s'il est en https : jamais un schéma `file:`, `intent:` ou autre venu d'une réponse inattendue. */
export async function ouvrirLienSur(url: unknown): Promise<void> {
  if (typeof url !== "string" || !(__DEV__ ? /^https?:\/\//i : /^https:\/\//i).test(url)) throw new Error("Lien non sécurisé : ouverture refusée.");
  await Linking.openURL(url);
}
