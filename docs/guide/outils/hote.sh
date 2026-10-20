#!/bin/bash
# Démarre (ou arrête) l'hôte de démonstration du guide : un hôtel fictif « Hôtel Grand Lac » avec le vrai serveur et l'application bureau.
#   hote.sh demarrer <portBase> <baseDeDonnees>   ex. : hote.sh demarrer 40000 hotel_t   (API = 40001, auth = 40002, application = 40003)
#   hote.sh arreter  <portBase>
# Prérequis : Postgres local jetable (base « …_t »), `pnpm --filter @hotel-chicago/desktop build` fait. Chaque hôte REPART DE ZÉRO au démarrage
# (la base est vidée puis semée) : deux hôtes en parallèle doivent avoir deux bases différentes.
set -e
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="${GUIDE_TMP:-/tmp/guide-hotes}"
mkdir -p "$TMP"
action="$1"; port="$2"
if [ "$action" = "arreter" ]; then
  touch "$TMP/arret-$port"
  exit 0
fi
base="${3:?base de données requise}"
rm -f "$TMP/arret-$port"
cd "$RACINE/apps/api"
GUIDE_SERVEUR=1 GUIDE_PORT_BASE="$port" GUIDE_ARRET="$TMP/arret-$port" TEST_INTEGRATION=1 \
  DATABASE_URL="postgresql://postgres@localhost:54330/$base?host=/tmp" \
  nohup npx jest -c jest.config.js --runInBand --forceExit --testPathPattern guide-serveur > "$TMP/hote-$port.log" 2>&1 &
for i in $(seq 1 90); do
  if curl -s -o /dev/null "http://127.0.0.1:$((port + 3))/" && curl -s -o /dev/null "http://127.0.0.1:$((port + 1))/health" ; then echo "hôte prêt (application : http://127.0.0.1:$((port + 3))/)"; exit 0; fi
  sleep 2
done
echo "L'hôte n'a pas démarré, voir $TMP/hote-$port.log"; exit 1
