import { BadRequestException, ConflictException } from "@nestjs/common";
import { normaliserTelephoneRdc } from "@hotel-chicago/types";

/**
 * Connexion par numéro de téléphone (15/10/2026, voir DECISIONS.md).
 *
 * Supabase Auth n'accepte un couple « téléphone + mot de passe » qu'avec son
 * fournisseur « Phone », qui exige un fournisseur SMS payant. On garde donc
 * le mode e-mail de Supabase : le compte porte l'e-mail RÉEL de la personne
 * s'il en a donné un, sinon un identifiant interne dérivé du numéro — jamais
 * montré à l'utilisateur, jamais destinataire d'un envoi (`email_confirm`
 * toujours vrai). Le relais de connexion retrouve cet e-mail à partir du
 * numéro saisi.
 */
export const DOMAINE_IDENTIFIANT_INTERNE = "tel.hotelsaver.app";

/** « +243970000000 » → « 243970000000@tel.hotelsaver.app ». */
export function identifiantInterne(telephone: string): string {
  return `${telephone.replace(/\D/g, "")}@${DOMAINE_IDENTIFIANT_INTERNE}`;
}

/** E-mail porté par le compte Supabase : l'e-mail réel s'il existe, sinon l'identifiant interne. */
export function emailDuCompte(telephone: string | null | undefined, email: string | null | undefined): string {
  if (email) return email;
  if (!telephone) throw new BadRequestException("Un numéro de téléphone ou une adresse e-mail est obligatoire.");
  return identifiantInterne(telephone);
}

/** Vrai si l'adresse est un identifiant interne (donc pas un vrai destinataire d'e-mail). */
export function estIdentifiantInterne(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${DOMAINE_IDENTIFIANT_INTERNE}`);
}

/** Normalise un numéro saisi (DTO) ou lève une 400 lisible. */
export function telephoneObligatoire(saisie: string | null | undefined): string {
  const telephone = normaliserTelephoneRdc(saisie);
  if (!telephone) {
    throw new BadRequestException("Numéro de téléphone invalide : 9 chiffres commençant par 8 ou 9 (ex. +243 970 000 000).");
  }
  return telephone;
}

/** 409 si le numéro est déjà l'identifiant d'un autre compte (Utilisateur ou
 * SuperAdmin) — vérifié AVANT de créer le compte Supabase, pour ne jamais
 * laisser de compte Auth orphelin. `saufUtilisateurId` : le compte modifié. */
export async function verifierTelephoneLibre(
  prisma: {
    utilisateur: { findUnique(args: { where: { telephone: string }; select: { id: true } }): Promise<{ id: string } | null> };
    superAdmin: { findUnique(args: { where: { telephone: string }; select: { id: true } }): Promise<{ id: string } | null> };
  },
  telephone: string,
  saufUtilisateurId?: string
): Promise<void> {
  const utilisateur = await prisma.utilisateur.findUnique({ where: { telephone }, select: { id: true } });
  const superAdmin = await prisma.superAdmin.findUnique({ where: { telephone }, select: { id: true } });
  if ((utilisateur && utilisateur.id !== saufUtilisateurId) || superAdmin) {
    throw new ConflictException("Ce numéro de téléphone est déjà utilisé par un autre compte.");
  }
}
