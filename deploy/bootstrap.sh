#!/usr/bin/env bash
# Idempotent host setup, run as root over SSH by CI before every deploy.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt_get() { apt-get -o DPkg::Lock::Timeout=600 "$@"; }

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! docker buildx version >/dev/null 2>&1; then
  apt_get update -q
  apt_get install -yq ca-certificates curl ufw docker.io docker-compose-v2 docker-buildx
  systemctl enable --now docker
fi

if ! ufw status | grep -q "Status: active"; then
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
fi

install -d -m 0755 /opt/app/releases
