#!/bin/bash
# EC2 user data (Ubuntu 24.04). Installs Docker and fetches IntelliTwin. It does NOT start the app:
# you add your keys to /opt/intellitwin/.env first (see docs/deploy-aws-one-box.md).
set -euxo pipefail
BRANCH="${BRANCH:-platform-app}"
apt-get update -y
apt-get install -y docker.io docker-compose-v2 git curl
systemctl enable --now docker
usermod -aG docker ubuntu
git clone --branch "$BRANCH" https://github.com/thirumald/IntelliTwin.git /opt/intellitwin
cd /opt/intellitwin
cp .env.example .env
chown -R ubuntu:ubuntu /opt/intellitwin
echo "ready" > /opt/intellitwin/.bootstrap-done
