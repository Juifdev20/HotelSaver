import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "@hotel-chicago/types";
import { SuppressionHotelService } from "./suppression-hotel.service";
import { SuppressionHotelController } from "./suppression-hotel.controller";

function monter(comptes: { enCours?: number; aVenir?: number; remboursements?: number } = {}) {
  const prisma = {
    hotel: { findUnique: jest.fn(async () => ({ id: "h1", nom: "Hôtel Kivu Lodge", sousDomaine: "kivu", createdAt: new Date("2026-01-01") })) },
    reservation: {
      count: jest.fn(async ({ where }: any) => (where.statut === "EN_COURS" ? comptes.enCours ?? 0 : comptes.aVenir ?? 0)),
    },
    remboursement: { count: jest.fn(async () => comptes.remboursements ?? 0) },
  };
  const nettoyage = { supprimerHotel: jest.fn(async () => undefined) };
  return { service: new SuppressionHotelService(prisma as any, nettoyage as any), nettoyage };
}

describe("le patron supprime son compte et son hôtel", () => {
  it("réservé au PATRON : réception et cafétéria n'y ont pas accès", () => {
    expect(Reflect.getMetadata("roles", SuppressionHotelController)).toEqual([Role.PATRON]);
  });

  it("refusé tant qu'un client est là, qu'une réservation est à venir ou qu'un remboursement reste à faire", async () => {
    expect(await monter().service.obstacles("h1")).toEqual([]);
    expect(await monter({ enCours: 1 }).service.obstacles("h1")).toHaveLength(1);
    expect(await monter({ aVenir: 2, remboursements: 1 }).service.obstacles("h1")).toHaveLength(2);
    const bloque = monter({ aVenir: 1 });
    await expect(bloque.service.supprimer("h1", "Jean", { raison: "trop_cher", confirmationNom: "Hôtel Kivu Lodge" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(bloque.nettoyage.supprimerHotel).not.toHaveBeenCalled();
  });

  it("demande le nom de l'hôtel retapé (sans tenir compte des accents ni des majuscules)", async () => {
    const { service, nettoyage } = monter();
    await expect(service.supprimer("h1", "Jean", { raison: "autre", confirmationNom: "Autre hôtel" })).rejects.toBeInstanceOf(BadRequestException);
    expect(nettoyage.supprimerHotel).not.toHaveBeenCalled();
    await service.supprimer("h1", "Jean", { raison: "autre", confirmationNom: "  hotel kivu   LODGE " });
    expect(nettoyage.supprimerHotel).toHaveBeenCalled();
  });

  it("supprime tout par la suppression complète, avec la raison du départ gardée", async () => {
    const { service, nettoyage } = monter();
    await service.supprimer("h1", "Jean Patron", { raison: "trop_cher", commentaire: "  Trop cher pour nous  ", confirmationNom: "Hôtel Kivu Lodge" });
    expect(nettoyage.supprimerHotel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "h1" }),
      "Supprimé par le patron (Jean Patron) — Trop cher — « Trop cher pour nous »"
    );
  });
});
