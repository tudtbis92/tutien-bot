#!/usr/bin/env bash
# Manual deploy script — mirrors what GitHub Actions runs
# Usage: ./scripts/deploy.sh

set -e

# Source nvm — required if Node installed via nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22   # Pin Node version to match .nvmrc

echo "[deploy] Pulling latest code..."
git pull origin main

echo "[deploy] Installing dependencies..."
npm ci

echo "[deploy] Building..."
npm run build

echo "[deploy] Running migrations (direct PostgreSQL connection)..."
source /etc/tutien/.env
DATABASE_URL="$DATABASE_URL_DIRECT" npx drizzle-kit migrate

echo "[deploy] Restarting bot..."
pm2 restart tutien-bot

echo "[deploy] Verifying health..."
sleep 8
curl -f http://localhost:3000/health | grep '"status":"ok"' \
  || (echo "[deploy] Health check failed!" && exit 1)

echo "[deploy] Deploy complete."
