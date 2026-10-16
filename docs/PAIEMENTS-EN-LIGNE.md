# Paiements en ligne : abonnements, acomptes de réservation, remboursements

Mis à jour le 15/10/2026. Complète `docs/ABONNEMENT.md`.

## Qui paie qui, sur quel compte
| Paiement | Qui paie | Qui reçoit | Comment |
|---|---|---|---|
| **Abonnement** HotelSaver | le patron de l'hôtel | **votre** compte marchand ScanLinkPay (numéro `LINKPAY_NUMERO_MARCHAND`) | dans l'application bureau/mobile (Paramètres → Abonnement), Mobile Money |
| **Acompte** de réservation | le client de l'hôtel | le compte marchand ScanLinkPay **de l'hôtel** (son propre numéro `SLP-…`) | sur le site public de l'hôtel, page « Ma réservation » : Mobile Money **ou carte Visa/Mastercard** |
| **Remboursement** d'acompte | l'hôtel | le client | depuis le compte ScanLinkPay de l'hôtel (Envoyer → numéro ScanLinkPay du client), ou Mobile Money / espèces |

Chaque hôtel a donc **son** compte marchand ScanLinkPay : il le crée dans ScanLinkPay (entreprise + au moins une boutique active), puis saisit son numéro dans HotelSaver (Paramètres → « Paiement en ligne des acomptes »). Le serveur vérifie le numéro auprès de ScanLinkPay et affiche le nom de l'entreprise pour que le patron s'assure que c'est la bonne. L'argent arrive dans le portefeuille ScanLinkPay de l'hôtel, qui le **retire vers son Mobile Money** quand il veut. Chaque hôtel et chaque client qui utilise ça découvre ScanLinkPay : le site invite le client à créer un compte (remboursement instantané, paiements partout).

## L'acompte
- Le **patron fixe un pourcentage** (0 à 100 %, 0 = pas de paiement en ligne). L'acompte = ce pourcentage × le séjour estimé (prix de la nuit × nuits). Exemple : chambre à 20 $, 4 nuits, 30 % → 24 $. Arrondi vers le haut au cent (dollars) ou au franc (francs), dans la devise de la chambre.
- Le client paie sur sa page « Ma réservation » (le lien reçu à la demande de réservation). Le serveur calcule le montant ; le client ne le saisit jamais.
- **Contrôles** : la chambre doit être libre pour ces dates au moment de payer ; un seul paiement en attente à la fois ; rejouer une demande (coupure) ne débite pas deux fois ; le crédit n'a lieu que si ScanLinkPay confirme le **bon montant** dans la **bonne devise**, une seule fois.
- À la confirmation : l'acompte est ajouté à la réservation **et la réservation est confirmée automatiquement**. Si la chambre a été prise entre-temps, la réservation est annulée et l'acompte part dans les remboursements (jamais gardé en silence). La réception et le patron sont prévenus.
- **Mobile Money** : le client choisit son opérateur et saisit son numéro ; il confirme avec son code secret sur son téléphone. **Carte** : il est redirigé vers la page de paiement sécurisée du fournisseur (nous ne voyons jamais le numéro de carte), puis revient sur sa page ; l'acompte est crédité dès que le fournisseur confirme, même si le client ne revient pas (vérification chaque minute).
- Le paiement en ligne n'existe que si : la formule de l'hôtel inclut **ACOMPTE_EN_LIGNE**, le patron a saisi son numéro ScanLinkPay et un pourcentage, et le serveur est relié à ScanLinkPay (`LINKPAY_API_URL`).

## La commission ScanLinkPay (en dollars comme en francs)
ScanLinkPay prélève une commission selon **les règles de son administrateur, par devise** (une règle pour le USD, une pour le CDF), plus un coût du fournisseur de paiement estimé à 1,5 %. HotelSaver ne la calcule jamais lui-même : il **demande à ScanLinkPay** (`fees-preview`) et l'affiche **avant** de payer.
- **Abonnement** : par défaut le patron paie la commission **en plus** du prix (vous recevez le prix plein). Réglable par vous dans le super-admin (« Les frais ScanLinkPay des abonnements sont payés par le patron »).
- **Acompte** : le patron choisit, dans ses réglages, si le **client** paie la commission en plus de l'acompte (par défaut) ou si l'**hôtel** la supporte. Le coût du fournisseur (≈ 1,5 %) reste toujours à la charge du marchand (règle de ScanLinkPay).
- Le client voit toujours : « Acompte 24 $ + frais ScanLinkPay 0,48 $ = 24,48 $ à payer ». La commission n'est **jamais remboursée** (elle appartient à ScanLinkPay) : seul l'acompte l'est.

## Les remboursements
Quand une réservation avec un acompte payé en ligne est **annulée** (par le client depuis son lien, par la réception/le patron, ou parce que le client ne s'est pas présenté) ou que la chambre devient indisponible, un **remboursement « à faire »** apparaît dans l'écran **Remboursements** du patron (avec une pastille et une notification).
- **Le système ne rend jamais l'argent tout seul** : le patron décide, selon ses conditions d'annulation (affichées au client avant de payer) — rembourser tout, une partie, ou **conserver** l'acompte (ex. non-présentation). Il saisit comment il a remboursé et une référence ; chaque décision est tracée et ne se prend qu'une fois.
- **Où envoyer l'argent** : le client peut indiquer son **numéro ScanLinkPay** en payant ; le remboursement part alors sur son compte (Envoyer → numéro, instantané). Sinon, son téléphone (Mobile Money) ou espèces. Le destinataire est noté **au moment du paiement** : annuler depuis un lien ne permet jamais de rediriger l'argent ailleurs.
- Le client voit l'état sur sa page : remboursement en cours / effectué (montant, mode) / acompte conservé.
- Un acompte versé **en main propre** (saisi par la réception) ne s'annule toujours pas depuis le lien : la réception décide.
- **Pourquoi ce n'est pas encore automatique** : un virement sortant exige les identifiants du compte ScanLinkPay de l'hôtel. Pour l'automatiser il faudrait ajouter à ScanLinkPay une **clé d'API marchand limitée au remboursement** (plafonnée, vers le compte du payeur d'origine seulement). C'est possible ; c'est une décision de sécurité à prendre avec vous.

## Les formules et les fonctions verrouillées
Vous définissez dans le super-admin (onglet **Abonnements**) : le nom, le prix mensuel en USD, le plafond de chambres et les **fonctions** de chaque formule — `RECEPTION`, `CAFETERIA`, `SITE_PUBLIC`, `DOMAINE_PERSONNALISE`, `ACOMPTE_EN_LIGNE` — plus les réglages de la plateforme (taux FC/USD, 12 mois = N mois payés, essai, grâce, fonctions ouvertes pendant l'essai, contact support). Rien n'est dans le code.
- Une fonction non incluse est **fermée partout** : routes de l'API (403 `FONCTION_NON_INCLUSE`), synchronisation hors ligne (rien reçu, rien accepté), site public (404 comme un hôtel inconnu), ajout d'un domaine. Les applications masquent les écrans correspondants et expliquent comment passer à une formule supérieure.
- Pendant l'**essai** tout est ouvert (réglable). Un hôtel créé à la main avec des paiements mais **sans formule** n'est jamais restreint par surprise : attribuez-lui une formule (liste des hôtels).
- Changer un **prix** n'affecte pas une période déjà payée ; changer les **fonctions** ou le **plafond** s'applique tout de suite aux hôtels abonnés ; une formule utilisée se **désactive** (n'est plus vendue) au lieu de se supprimer.

## Comment un inconnu qui télécharge l'application s'abonne
Un hôtel qui découvre l'application n'a **pas** besoin de passer par le site pour s'inscrire : « Créer mon hôtel » existe dans les trois endroits (Windows, mobile, site). À l'inscription il choisit :
- **Essai gratuit** (par défaut) : 14 jours, toutes fonctions ouvertes ; il choisit sa formule plus tard (Paramètres → Abonnement).
- **Payer mon abonnement maintenant** : pour ceux qui veulent « ne plus se déranger ». L'application ouvre directement l'écran de paiement à la première connexion (une seule fois ; après confirmation de l'e-mail si besoin) ; sur le site, l'écran de succès donne le bouton « Payer mon abonnement ». **Les jours d'essai restants sont conservés** (ils s'ajoutent à la période payée).

Où payer, selon l'endroit :
| Où | Comment |
|---|---|
| Application Windows | Dans l'application (Paramètres → Abonnement), Mobile Money. |
| Site `…/payer` | Connexion du patron puis paiement Mobile Money, dans n'importe quel navigateur (aussi depuis un téléphone). |
| Application mobile (Play Store) | Bouton « Payer sur le site HotelSaver » (ouvre `…/payer`), ou WhatsApp du support. Réglage : `apps/mobile/src/configAbonnement.ts`. |

> Raison : Google Play impose en général sa propre facturation pour les achats numériques dans une application. Pour l'instant le formulaire reste dans l'application mobile (`PAIEMENT_DANS_APPLICATION = true`, décision du 17/10) ; on le retirera (`false`) si Google Play refuse ou taxe ; le paiement, lui, reste disponible partout via le site. Hors Play Store (APK direct) on peut remettre `true`. Voir `docs/ABONNEMENT.md`.

## Comment la réception et le patron savent qu'une réservation est déjà payée
Dès que ScanLinkPay confirme le paiement du client :
1. **Notification** « Acompte payé en ligne » (réception et patron), qui ouvre la réservation.
2. La réservation passe **Confirmée** toute seule et son **acompte** augmente du montant reçu (visible même hors ligne, partout).
3. Un repère vert **« Payé en ligne »** apparaît dans les listes (Réservations, Arrivées du jour sur Windows ; liste des réservations sur mobile). Dans la fiche de la réservation, un bloc dit combien, par quel moyen (M-Pesa, Airtel, carte…), quel jour, avec quelle **référence** (à donner au support en cas de question) et le numéro masqué du client.
4. Si la réservation est annulée, le repère devient **« à rembourser ? »**, puis **« remboursé »** ou **« conservé »** selon la décision du patron.
Le repère vient du serveur (`GET /acomptes-en-ligne`, réception et patron, réservations dont le départ date de moins de 45 jours ou à venir) : sans Internet il n'apparaît pas, mais le montant d'acompte reste affiché. Le client, lui, voit son paiement sur sa page « Ma réservation ». L'argent est déjà dans le compte ScanLinkPay de l'hôtel : rien à encaisser à l'arrivée pour cette part.

## Contact support
**+243 828 497 218** (téléphone et WhatsApp). Réglable dans le super-admin ; affiché dans l'écran Abonnement, l'écran « abonnement expiré », les panneaux « fonction non incluse » et sur le site.

## À configurer
1. **ScanLinkPay déployé avec la dernière version** (route `fees-preview`, options de `quick-pay`) — **avant** HotelSaver, sinon les paiements sont refusés avec le message « le service de paiement doit être mis à jour ».
2. Variables de l'API HotelSaver : `LINKPAY_API_URL`, `LINKPAY_NUMERO_MARCHAND` (abonnements), `LINKPAY_SITE_URL` (facultatif), `ACOMPTE_CARTE` (facultatif). Migrations : `20261015100000_formules_et_parametres`, `20261015120000_acompte_en_ligne_et_remboursements`.
3. Côté ScanLinkPay : paiement par **carte** ouvert en production (FlexPaie type 2, voir leur documentation) ; chaque hôtel crée son entreprise + boutique active.
4. Super-admin : vérifier les formules de départ (29 / 59 / 99 $, fonctions) et les réglages, puis les ajuster.
