#!/usr/bin/env sh
# Enregistre (ou déplace) le webhook Telegram du journal.
# À lancer par Valentin, une fois le service déployé et le DNS actif :
#
#   cd /opt/locomotionlab/infra && set -a && . ./.env && set +a
#   ../services/live-journal/scripts/set-webhook.sh
#
# Lit : TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, API_DOMAIN (infra/.env).
# `drop_pending_updates=true` : on repart proprement (pas de replay des messages
# envoyés avant l'enregistrement). allowed_updates limité à ce que le service gère.

set -eu

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN manquant (infra/.env)}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET manquant (infra/.env)}"
: "${API_DOMAIN:?API_DOMAIN manquant (infra/.env)}"

WEBHOOK_URL="https://${API_DOMAIN}/journal/telegram/webhook"

echo "Enregistrement du webhook → ${WEBHOOK_URL}"
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=${WEBHOOK_URL}" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message","edited_message"]' \
  --data-urlencode "drop_pending_updates=true"
echo

echo "État du webhook :"
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
echo
