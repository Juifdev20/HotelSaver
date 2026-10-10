import { MoteurSync, SEUIL_ECHEC_DEFINITIF } from "@hotel-chicago/sync-engine";
import { ENTITES_PULL, type EntitePull } from "@hotel-chicago/api-client";
import { genererCodePoste } from "@hotel-chicago/regles";
import { ClientHorsLigne } from "./client-hors-ligne";
import type { UtilisateurLocal } from "./contexte";
import { MagasinDocuments, type Persistance } from "./magasin";
import { StockageDocuments } from "./stockage-documents";
import { Vues } from "./vues";

export interface OptionsMiroir {
  persistance: Persistance;
  baseUrl: string | string[];
  getAccessToken: () => string | null | Promise<string | null>;
  /** L'utilisateur connecté (profil mémorisé) ; peut changer sans rouvrir le miroir (rafraîchissement du profil). */
  utilisateur: () => UtilisateurLocal;
  /** Types tirés du serveur (défaut : tous). */
  entites?: readonly EntitePull[];
  maintenant?: () => Date;
}

/** Tout ce dont une application a besoin pour travailler hors ligne, assemblé. */
export interface Miroir {
  client: ClientHorsLigne;
  moteur: MoteurSync;
  stockage: StockageDocuments;
  magasin: MagasinDocuments;
  /** Vrai dès que cet hôtel a été synchronisé une première fois sur cet appareil. */
  amorce(): boolean;
  /** Numéro de cet appareil (reçus provisoires). */
  codePoste(): string;
  /** Actions encore à envoyer sous le compte connecté. */
  actionsEnAttente(): Promise<number>;
  /** Abandonne une action refusée par le serveur : annule ses effets locaux et celles qui en dépendent. */
  /** Vrai tant que le serveur n'a pas enregistré cette ligne créée ici. */
  estCreationEnAttente(id: string): boolean;
  /** Actions non envoyées sur ce poste, tous comptes confondus. */
  actionsEnAttenteTotal(): number;
  abandonnerAction(id: string): Promise<number>;
  fermer(): void;
}

export async function ouvrirMiroir(options: OptionsMiroir): Promise<Miroir> {
  const magasin = new MagasinDocuments(options.persistance);
  await magasin.ouvrir();
  const stockage = new StockageDocuments(magasin, SEUIL_ECHEC_DEFINITIF, () => options.utilisateur().userId);
  const vues = new Vues(stockage);
  const maintenant = options.maintenant ?? (() => new Date());

  let codePoste = stockage.lireMeta<string>("codePoste");
  if (!codePoste) {
    codePoste = genererCodePoste();
    await stockage.ecrireMeta("codePoste", codePoste);
  }

  // eslint-disable-next-line prefer-const
  let moteur: MoteurSync;
  const client = new ClientHorsLigne(options.baseUrl, options.getAccessToken, {
    stockage,
    vues,
    utilisateur: options.utilisateur,
    declencher: () => void moteur?.notifierEcritureLocale(),
    codePoste: () => codePoste!,
    maintenant,
    amorce: () => stockage.lireMeta<boolean>("amorce") === true,
  });
  moteur = new MoteurSync(client, stockage, [...(options.entites ?? ENTITES_PULL)]);

  // La première synchronisation complète rend le miroir lisible ; ensuite on garde profil, taux et menu à jour pour la coupure suivante.
  let dernierRechauffement = 0;
  moteur.onChangement((etat) => {
    if (!etat.derniereSyncReussieLe) return;
    if (stockage.lireMeta<boolean>("amorce") !== true) void stockage.ecrireMeta("amorce", true);
    if (etat.enLigne && maintenant().getTime() - dernierRechauffement > 5 * 60_000) {
      dernierRechauffement = maintenant().getTime();
      void client.rechauffer();
    }
  });

  return {
    client,
    moteur,
    stockage,
    magasin,
    amorce: () => stockage.lireMeta<boolean>("amorce") === true,
    codePoste: () => codePoste!,
    actionsEnAttente: async () => (await stockage.listerFileAttente()).length,
    estCreationEnAttente: (id) => stockage.creationEnAttente(id),
    actionsEnAttenteTotal: () => stockage.compterToutesLesActions(),
    abandonnerAction: async (id) => (await stockage.abandonnerOperation(id)).length,
    fermer: () => {
      moteur.arreter();
      magasin.fermer();
    },
  };
}
