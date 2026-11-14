#!/usr/bin/env bash
# Idempotent host setup, run as root over SSH by CI before every deploy.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# A fresh instance runs its own apt jobs (cloud-init, unattended-upgrades) for the first minutes.
# DPkg::Lock::Timeout only covers the dpkg lock, not the lists lock `apt-get update` takes, so wait
# for those jobs first and retry on lock contention.
wait_for_apt() {
  if command -v cloud-init >/dev/null; then
    timeout 900 cloud-init status --wait >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 90); do
    pgrep -x 'apt|apt-get|dpkg' >/dev/null || return 0
    echo "Waiting for other apt/dpkg processes to finish..."
    sleep 10
  done
  echo "apt is still busy after 15 minutes" >&2
  return 1
}

apt_get() {
  local attempt
  for attempt in 1 2 3 4 5; do
    apt-get -o DPkg::Lock::Timeout=600 "$@" && return 0
    echo "apt-get $1 failed (attempt $attempt/5); retrying in 20s" >&2
    sleep 20
    wait_for_apt
  done
  return 1
}

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! docker buildx version >/dev/null 2>&1; then
  wait_for_apt
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
