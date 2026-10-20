#!/bin/bash
# Démarre l'interface MOBILE du guide dans un navigateur : hôte de démonstration (vrai serveur + faux Supabase + hôtel « Hôtel Grand Lac »),
# compilation de apps/mobile pour le web si nécessaire, puis service sur le port <portBase>+4.
#   demarrer.sh <portBase> <baseDeDonnees>   ex. : demarrer.sh 40400 hotel_t5   (API = 40401, auth = 40402, bureau = 40403, MOBILE = 40404)
# Prérequis : Postgres local jetable (voir hote.sh) et `npm install` fait dans ce dossier. Variables : RECOMPILER=1 force la compilation,
# SANS_HOTE=1 ne démarre pas l'hôte (déjà lancé par ailleurs).
set -e
ICI="$(cd "$(dirname "$0")" && pwd)"
TMP="${GUIDE_TMP:-/tmp/guide-hotes}"
mkdir -p "$TMP"
port="${1:?port de base requis (ex. 40400)}"
base="${2:?base de données requise (ex. hotel_t5)}"
rm -f "$TMP/arret-mobile-$port"

[ -d "$ICI/node_modules/react-native-web" ] || (cd "$ICI" && npm install --no-audit --no-fund)

if [ -z "$SANS_HOTE" ]; then "$ICI/../hote.sh" demarrer "$port" "$base"; fi

# Compilation : seulement si le code du mobile (ou ce dossier) a changé depuis la dernière, ou si les adresses de l'hôte ne sont plus les mêmes.
SIGNATURE="$port:$(find "$ICI/../../../../apps/mobile/App.tsx" "$ICI/../../../../apps/mobile/src" "$ICI/../../../../packages"/*/src "$ICI/shims" "$ICI/build.mjs" "$ICI/index.html" "$ICI/entree.js" -type f -newer "$ICI/dist/app.js" 2>/dev/null | head -1)"
if [ -n "$RECOMPILER" ] || [ ! -f "$ICI/dist/app.js" ] || [ "$(grep -o '"EXPO_PUBLIC_API_URL": "[^"]*"' "$ICI/dist/env.json" 2>/dev/null)" != "\"EXPO_PUBLIC_API_URL\": \"http://127.0.0.1:$((port + 1))\"" ] || [ "$SIGNATURE" != "$port:" ]; then
  echo "compilation de l'application mobile pour le web…"
  (cd "$ICI" && GUIDE_PORT_BASE="$port" node build.mjs)
fi

nohup node "$ICI/serveur.mjs" "$((port + 4))" "$TMP/arret-mobile-$port" > "$TMP/mobile-$port.log" 2>&1 &
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://127.0.0.1:$((port + 4))/"; then echo "mobile prêt (http://127.0.0.1:$((port + 4))/)"; exit 0; fi
  sleep 0.5
done
echo "Le service mobile n'a pas démarré, voir $TMP/mobile-$port.log"; exit 1
