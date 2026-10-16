# Abonnement HotelSaver

Mis à jour le 17/10/2026. Ce document dit comment l'abonnement fonctionne, ce qu'il faut configurer pour que le paiement marche, et comment l'exploiter.

## En une minute
- Un hôtel qui s'inscrit a **14 jours d'essai gratuit**, toutes fonctions ouvertes.
- Ensuite il choisit une **formule** (Essentiel 29 $, Pro 59 $, Premium 99 $ par mois — prix à valider, voir `packages/regles/src/abonnement.ts`) et une **durée** (1, 3, 6 ou 12 mois ; 12 mois payés = 10 mois facturés) et **paie avec son téléphone** (M-Pesa, Airtel Money, Orange Money, Africell), **depuis l'application Windows** (Paramètres → Abonnement) ou **depuis le site** (page « Payer mon abonnement », `/payer`, utilisable dans le navigateur d'un téléphone ou d'un ordinateur), en dollars ou en francs. Dans l'application **mobile publiée sur le Play Store**, un bouton « Payer sur le site HotelSaver » ouvre cette page (voir « Magasins d'applications »).
- Un patron qui **ne veut pas d'essai** choisit « Payer mon abonnement maintenant » à l'inscription (site, Windows, mobile) : il arrive directement sur le paiement. **Aucun jour d'essai n'est perdu** : payer pendant l'essai prolonge à partir de la fin de l'essai (3 jours restants + 1 mois payé = 1 mois et 3 jours).
- Le téléphone du patron reçoit la demande de confirmation habituelle (code secret Mobile Money). Dès que le paiement est confirmé, l'abonnement est prolongé **automatiquement** et l'application continue sans redémarrage.
- **L'argent arrive dans le compte marchand ScanLinkPay de la plateforme** (celui dont vous donnez le numéro), pas sur les identifiants FlexPaie de ScanLinkPay.

## Ce qui se passe à l'échéance
| Moment | Ce que voit l'hôtel |
|---|---|
| 7 derniers jours | Bandeau orange « plus que N jours » partout (bureau + mobile), notification au patron |
| Échéance dépassée, 3 jours de grâce | Tout fonctionne, bandeau **rouge** « l'accès sera bientôt coupé » |
| Après la grâce | Accès coupé pour tous : écran « Votre abonnement a expiré ». Le **patron** peut payer sur cet écran ; les autres voient « Demandez au patron de renouveler ». Les données sont conservées ; ce qui était en attente d'envoi reste sur l'appareil. |
| Après paiement | Réouverture immédiate (pas d'attente du cron de minuit). |
| Suspendu **à la main** par le support, ou résilié | Accès coupé et **paiement en ligne refusé** : l'hôtel doit contacter le support (sinon un hôtel suspendu pour abus se rouvrirait en payant). |

Payer d'avance ne fait perdre aucun jour : la nouvelle période s'ajoute à la fin de l'actuelle. Payer en retard repart de la date du paiement.

## Comment l'argent arrive (flux technique)
HotelSaver n'a **aucune clé de paiement**. Il appelle seulement trois routes publiques de ScanLinkPay, avec le **numéro ScanLinkPay** de votre compte marchand :
1. `POST /payment-requests/quick-pay` (numéro + montant + devise) → crée une demande de paiement chez votre marchand.
2. `POST /payments` (jeton de la demande, téléphone du patron, réseau, `Idempotency-Key`) → ScanLinkPay déclenche, via son fournisseur (FlexPaie), la demande de confirmation sur le téléphone.
3. `GET /payments/status/:référence` → `SUCCESS` / `FAILED` / `PENDING`.

Garde-fous (code : `apps/api/src/abonnement/`) :
- Le **montant, la formule et la durée sont calculés par le serveur**, jamais fournis par l'application.
- L'hôtel n'est crédité **que** si ScanLinkPay confirme `SUCCESS` avec **exactement** le montant et la devise attendus ; sinon le paiement est marqué en échec et **n'est pas crédité** (alerte dans les journaux).
- **Un seul crédit par paiement**, même si l'application et la tâche planifiée vérifient en même temps (transition atomique en base).
- **Idempotence** : rejouer la même demande (coupure réseau, double clic) ne débite jamais deux fois ; un second paiement est refusé tant que le premier attend (5 min).
- Une tâche planifiée vérifie chaque minute les paiements en attente : si le patron ferme l'application avant d'avoir confirmé, ou confirme en retard (jusqu'à 24 h), l'abonnement s'active quand même.
- Le numéro de téléphone n'est jamais gardé en entier (« +243 82• ••• •18 »).
- Chaque crédit crée une ligne dans `PaiementLicence` (méthode MOBILE_MONEY, note avec la référence) : l'historique du support et le calcul d'échéance restent une seule source de vérité.

## À configurer (c'est ce qu'il vous reste à faire)
1. **Créer le compte marchand HotelSaver dans ScanLinkPay** : inscrivez-vous comme entreprise (organisation) avec au moins **une boutique active** (non suspendue). Notez le **numéro ScanLinkPay** de l'entreprise (format `SLP-…`).
2. Sur le service **API HotelSaver** (Render), ajoutez :
   | Variable | Valeur |
   |---|---|
   | `LINKPAY_API_URL` | l'adresse de l'API ScanLinkPay **avec** `/api/v1`, ex. `https://linkpay-api.onrender.com/api/v1` (https obligatoire) |
   | `LINKPAY_NUMERO_MARCHAND` | votre numéro, ex. `SLP-000123` |
   | `ABONNEMENT_TAUX_CDF` | (optionnel) taux de conversion des abonnements en francs, défaut 2800 |
3. **Appliquer la migration** `20261011100000_abonnement_en_ligne` (`pnpm --filter @hotel-chicago/database migrate:appliquer`, ou coller son SQL dans Supabase) — elle active aussi la RLS de la nouvelle table.
4. **Côté ScanLinkPay** : FlexPaie doit être actif en production (`PSP_PROVIDER=flexpaie`, voir `LinkPay/docs/RENDER_ENV.md`). Faire un **premier vrai paiement de test** (Essentiel 1 mois = 29 $, ou un montant en francs) avec un hôtel d'essai, vérifier : demande sur le téléphone → abonnement prolongé → argent visible dans le portefeuille du marchand ScanLinkPay.
5. **Récupérer l'argent** : il est dans le portefeuille de votre marchand ScanLinkPay ; vous le retirez comme n'importe quel marchand (retrait ScanLinkPay, traité à la main pour l'instant — voir `LinkPay/docs/REPRISE.md`).

Sans ces deux variables, le paiement en ligne est simplement indisponible (« Contactez le support ») et l'enregistrement manuel d'un paiement (virement, espèces) par le super-admin continue de fonctionner.

## Points d'attention
- **Frais** : ScanLinkPay prélève sa commission (modèle `MERCHANT_PAID` par défaut : le patron paie le prix affiché, la commission est retenue sur votre côté). Prévoyez-la dans vos prix.
- **Limite de débit** : la route publique `quick-pay` de ScanLinkPay est limitée à 10 appels par minute et par adresse IP ; tous les abonnements partent de l'IP du serveur HotelSaver. C'est largement suffisant au démarrage ; si le volume grandit, ajouter à ScanLinkPay une route réservée aux partenaires avec clé d'API.
- **Libellé chez ScanLinkPay** : la demande y apparaît comme « Paiement via numéro ScanLinkPay SLP-… » sans nom d'hôtel. Pour rapprocher, utilisez le suivi du super-admin (onglet « Paiements en ligne »), qui garde les deux références.
- **Magasins d'applications** : Google Play impose en général son propre système de facturation pour les achats numériques *dans* une application ; un paiement Mobile Money intégré peut être refusé à l'examen. Le choix retenu : **`PAIEMENT_DANS_APPLICATION = false`** sur mobile (`apps/mobile/src/configAbonnement.ts`). L'application mobile **ne vend rien elle-même** : elle montre l'état de l'abonnement, les alertes et l'historique, et propose « **Payer sur le site HotelSaver** » (ouvre la page `/payer` du site dans le navigateur du téléphone : connexion du patron, formule, durée, Mobile Money — même serveur, mêmes prix, mêmes frais annoncés), l'application Windows ou le WhatsApp du support. Si Google Play refuse aussi le lien, mettre `AFFICHER_LIEN_PAIEMENT_SITE = false` (il reste le texte, Windows et WhatsApp). Pour un APK distribué hors Play Store : `PAIEMENT_DANS_APPLICATION = true` remet le formulaire dans l'application. Microsoft Store autorise un système de paiement tiers pour les applications (non-jeux) : l'application Windows paie toujours dans l'application. **Rien d'autre n'est à changer** : une seule ligne, puis republier.
- **Page de paiement du site** (`/payer`) : le patron s'y connecte avec son e-mail et son mot de passe (jeton **gardé en mémoire seulement**, rien n'est écrit sur l'appareil ; fermer l'onglet déconnecte). Un employé est refusé (« seul le patron peut payer »). L'API doit autoriser l'adresse du site dans `CORS_ORIGIN` et connaître `SITE_WEB_URL` (elle donne aux applications l'adresse `…/payer`, champ `urlPaiementSite`). Pour que le bouton marche même si le serveur est ancien : compiler l'application mobile avec `EXPO_PUBLIC_SITE_URL=https://votre-site`.
- **Hors ligne** : l'application garde ses 14 jours de grâce hors ligne ; l'abonnement n'est contrôlé que par le serveur (le téléphone ne se bloque pas seul sur son horloge). Les bandeaux, eux, suivent l'horloge.
- **Plafond de chambres** : Essentiel 15, Pro 40, Premium illimité, appliqué à l'ajout d'une chambre pour un hôtel qui a payé une formule (un hôtel en essai n'a pas de plafond). Les autres différences de formules (cafétaria, site public, domaine) ne sont **pas** encore verrouillées : décision à prendre.

## Exploitation (super-admin)
- Onglet **Paiements en ligne** : tous les paiements (en attente, réussis, échoués) avec les références ScanLinkPay.
- Un client dit « j'ai été débité mais rien ne s'est activé » : **Revérifier** (interroge ScanLinkPay et crédite si le paiement a bien abouti) ; sinon chercher la référence dans ScanLinkPay.
- Suspendre un hôtel depuis la liste = suspension **manuelle** (il ne peut pas se rouvrir en payant) ; enregistrer un paiement à la main le réactive.

## Tests
- Règles pures : `packages/regles/src/abonnement.spec.ts`.
- Déroulé du paiement côté écran : `packages/miroir-local/src/suivi-paiement-abonnement.spec.ts`.
- Serveur + vraie base + faux ScanLinkPay : `apps/api/test/integration/abonnement.e2e-spec.ts` (24 cas : prix, idempotence, montant suspect, crédit unique en concurrence, grâce, blocage 402, réouverture immédiate, suspension manuelle, plafond de chambres).
- Navigateur (bureau) : `apps/api/test/integration/navigateur-abonnement.e2e-spec.ts`.
- Navigateur (site) : `apps/api/test/integration/navigateur-payer-site.e2e-spec.ts` — connexion, employé refusé, paiement pendant l'essai (jours conservés), paiement d'un hôtel bloqué (rouvert), choix « payer maintenant » à l'inscription. Prérequis : `cd apps/web && VITE_API_URL=http://127.0.0.1:39811 pnpm exec vite build --outDir dist-test`, puis `TEST_NAVIGATEUR=1`.
