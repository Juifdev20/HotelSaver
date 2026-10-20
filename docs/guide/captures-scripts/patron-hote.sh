#!/bin/bash
# Hôte de démonstration « patron » : l'hôte du guide + un faux ScanLinkPay (abonnement, acomptes). Usage : patron-hote.sh demarrer|arreter
# Ports : 40000 (API 40001, application 40003), faux ScanLinkPay 40010. Base « hotel_t ».
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
if [ "$1" = "arreter" ]; then
  "$RACINE/docs/guide/outils/hote.sh" arreter 40000
  pkill -f "patron-faux-linkpay.cjs 40010" || true
  pkill -f "patron-serveur-web.cjs .* 40020" || true
  exit 0
fi
nohup node "$RACINE/docs/guide/captures-scripts/patron-faux-linkpay.cjs" 40010 > /tmp/guide-hotes/faux-linkpay.log 2>&1 &
export LINKPAY_API_URL="http://127.0.0.1:40010"
export LINKPAY_NUMERO_MARCHAND="SLP-TEST01"
"$RACINE/docs/guide/outils/hote.sh" demarrer 40000 hotel_t
