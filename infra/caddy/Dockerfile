# syntax=docker/dockerfile:1
#
# Caddy recompilé avec le plugin DNS Cloudflare (caddy-dns/cloudflare), nécessaire pour
# l'ACME en DNS-01 (émettre les certificats Let's Encrypt SANS port 80 et MÊME derrière le
# proxy Cloudflare). L'image officielle `caddy` n'embarque pas ce module → on le compile.
FROM caddy:2-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
