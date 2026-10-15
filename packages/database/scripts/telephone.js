// Connexion par numéro (15/10/2026) — mêmes règles que
// apps/api/src/common/telephone/identifiant-connexion.ts et
// normaliserTelephoneRdc (@hotel-chicago/types), recopiées ici pour que les
// scripts CLI restent autonomes (ce paquet ne dépend pas de @hotel-chicago/types).

/** « 0970000000 », « +243 970 000 000 »… → « +243970000000 », ou null. */
function normaliserTelephoneRdc(saisie) {
  if (!saisie) return null;
  let chiffres = String(saisie).replace(/\D/g, "");
  if (chiffres.startsWith("00243")) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith("243") && chiffres.length === 12) chiffres = chiffres.slice(3);
  else if (chiffres.startsWith("0") && chiffres.length === 10) chiffres = chiffres.slice(1);
  return /^[89]\d{8}$/.test(chiffres) ? `+243${chiffres}` : null;
}

/** E-mail du compte Supabase : l'e-mail réel s'il existe, sinon l'identifiant interne. */
function emailDuCompte(telephone, email) {
  return email || `${telephone.replace(/\D/g, "")}@tel.hotelsaver.app`;
}

module.exports = { normaliserTelephoneRdc, emailDuCompte };
