import { Module } from "@nestjs/common";
import { prisma } from "@hotel-chicago/database";

/** Jeton d'injection pour le PrismaClient partagé (packages/database). */
export const PRISMA = Symbol("PRISMA");

@Module({
  providers: [{ provide: PRISMA, useValue: prisma }],
  exports: [PRISMA],
})
export class PrismaModule {}
