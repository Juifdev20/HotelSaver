# packages/sync-engine — Moteur de synchronisation hors ligne

**Non implémenté.** Espace réservé dans le workspace pour l'instant.

Sera construit en Phase 4 (voir section 10 du prompt d'origine,
`hotel-chicago-prompt-claude-code.md`) : SQLite local (cache + `sync_queue`),
détection de connectivité, envoi par lots vers `POST /sync/push`, récupération
via `GET /sync/pull`, résolution de conflits (serveur prioritaire sur les
modifications, jamais de fusion silencieuse), indicateurs visuels de
synchronisation.

Dépend des endpoints `SyncModule` de `apps/api`, qui n'existent pas encore en
Phase 1.
