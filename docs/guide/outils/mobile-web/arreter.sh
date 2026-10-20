#!/bin/bash
# Arrête le service mobile ET l'hôte de démonstration : arreter.sh <portBase>   (SANS_HOTE=1 : seulement le service mobile)
ICI="$(cd "$(dirname "$0")" && pwd)"
TMP="${GUIDE_TMP:-/tmp/guide-hotes}"
mkdir -p "$TMP"
port="${1:?port de base requis}"
touch "$TMP/arret-mobile-$port"
if [ -z "$SANS_HOTE" ]; then "$ICI/../hote.sh" arreter "$port"; fi
