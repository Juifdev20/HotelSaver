import { Injectable, InternalServerErrorException } from "@nestjs/common";

export interface DomaineRenderResultat {
  id: string;
  name: string;
  verifie: boolean;
}

/**
 * Wrapper minimal autour de l'API publique Render — Custom Domains
 * (https://api-docs.render.com/reference/create-custom-domain), pour
 * attacher/retirer/vérifier le domaine personnalisé d'un hôtel (Phase 13,
 * onboarding manuel par le Super-Admin uniquement — voir DECISIONS.md).
 *
 * Nécessite `RENDER_API_KEY` (jeton API du compte/workspace Render) et
 * `RENDER_WEB_SERVICE_ID` (l'id du Web Service Render qui héberge
 * `apps/web`, ex. `srv-xxxxx`) — voir apps/api/.env.example. Sans
 * déploiement Render réel, ces variables sont absentes : toute tentative
 * échoue avec un message clair (même patron que SupabaseAdminService)
 * plutôt qu'un appel silencieusement no-op.
 *
 * Render ne fournit pas d'endpoint "vérifier maintenant" : il vérifie
 * lui-même la propagation DNS en arrière-plan. `statutDomaine` se contente
 * de relire l'état déjà calculé par Render (`verificationStatus`) — c'est
 * ce que le Super-Admin déclenche manuellement avec le bouton "Vérifier"
 * (aucun cron automatique dans cette phase, voir DECISIONS.md).
 */
@Injectable()
export class RenderDomainsService {
  private readonly baseUrl = "https://api.render.com/v1";

  private configuration(): { apiKey: string; serviceId: string } {
    const apiKey = process.env.RENDER_API_KEY;
    const serviceId = process.env.RENDER_WEB_SERVICE_ID;
    if (!apiKey || !serviceId) {
      throw new InternalServerErrorException(
        "RENDER_API_KEY/RENDER_WEB_SERVICE_ID non configurés — gestion des domaines personnalisés indisponible tant que apps/web n'est pas déployé sur Render."
      );
    }
    return { apiKey, serviceId };
  }

  private async requete(methode: string, chemin: string): Promise<any> {
    const { apiKey, serviceId } = this.configuration();
    const reponse = await fetch(`${this.baseUrl}/services/${serviceId}/custom-domains${chemin}`, {
      method: methode,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    });
    // Un DELETE sur un domaine déjà absent côté Render (ex. retiré depuis le
    // dashboard entre-temps) n'est pas une erreur : idempotent, comme partout
    // ailleurs dans ce projet pour ce genre d'opération.
    if (methode === "DELETE" && reponse.status === 404) return null;
    const corps: any = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      throw new InternalServerErrorException(`Render a refusé (${reponse.status}) : ${corps?.message ?? JSON.stringify(corps)}`);
    }
    return corps;
  }

  /**
   * Ajoute le domaine sur le Web Service Render. Un domaine "apex" (ex.
   * `hotelchicago.com`) fait renvoyer par Render un tableau contenant aussi
   * son entrée `www.` associée (redirection automatique) — on ne garde que
   * l'entrée qui correspond exactement au nom demandé.
   */
  async ajouterDomaine(nomDomaine: string): Promise<DomaineRenderResultat> {
    const { apiKey, serviceId } = this.configuration();
    const reponse = await fetch(`${this.baseUrl}/services/${serviceId}/custom-domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ name: nomDomaine }),
    });
    const corps: any = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      throw new InternalServerErrorException(
        `Render a refusé l'ajout du domaine "${nomDomaine}" (${reponse.status}) : ${corps?.message ?? JSON.stringify(corps)}`
      );
    }
    const liste: any[] = Array.isArray(corps) ? corps : [corps];
    const principal = liste.find((d) => d.name === nomDomaine) ?? liste[0];
    return { id: principal.id, name: principal.name, verifie: principal.verificationStatus === "verified" };
  }

  async supprimerDomaine(idDomaineRender: string): Promise<void> {
    await this.requete("DELETE", `/${idDomaineRender}`);
  }

  /** `null` si le domaine n'existe plus côté Render — l'appelant décide quoi en faire. */
  async statutDomaine(idDomaineRender: string): Promise<DomaineRenderResultat | null> {
    const corps = await this.requete("GET", "");
    const trouve = Array.isArray(corps) ? corps.find((d: any) => d.id === idDomaineRender) : null;
    if (!trouve) return null;
    return { id: trouve.id, name: trouve.name, verifie: trouve.verificationStatus === "verified" };
  }
}
