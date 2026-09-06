#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=/home/dev/opencode-max-bot
ENV_FILE=/etc/opencode-max-bot.env
REPO_URL=https://github.com/hdworker/opencode-max-bot.git

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nodejs npm

# OpenCode runs as dev, while the executable is installed system-wide.
if ! command -v opencode >/dev/null 2>&1; then
  npm install --global opencode-ai
fi

install -d -o dev -g dev "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  runuser -u dev -- env HOME=/home/dev git -C "$APP_DIR" fetch --depth 1 origin main
  runuser -u dev -- env HOME=/home/dev git -C "$APP_DIR" checkout --detach FETCH_HEAD
else
  rm -rf "$APP_DIR"
  runuser -u dev -- env HOME=/home/dev git clone --depth 1 --branch main "$REPO_URL" "$APP_DIR"
fi
chown -R dev:dev "$APP_DIR"

runuser -u dev -- env HOME=/home/dev npm --prefix "$APP_DIR" ci
runuser -u dev -- env HOME=/home/dev npm --prefix "$APP_DIR" run build
runuser -u dev -- env HOME=/home/dev npm --prefix "$APP_DIR" prune --omit=dev

chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"

OPENCODE_BIN="$(command -v opencode)"
NODE_BIN="$(command -v node)"

install -m 0644 /dev/stdin /etc/systemd/system/opencode.service <<UNIT
[Unit]
Description=OpenCode headless server for MAX bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dev
Group=dev
WorkingDirectory=/home/dev
Environment=HOME=/home/dev
ExecStart=$OPENCODE_BIN serve --hostname 127.0.0.1 --port 4096 --print-logs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

install -m 0644 /dev/stdin /etc/systemd/system/opencode-max-bot.service <<UNIT
[Unit]
Description=OpenCode MAX bot
Requires=opencode.service
After=opencode.service network-online.target

[Service]
Type=simple
User=dev
Group=dev
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/env OPENCODE_AUTO_RESTART_ENABLED=false $NODE_BIN $APP_DIR/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable opencode.service
systemctl restart opencode.service
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --max-time 10 --fail --silent http://127.0.0.1:4096/global/health >/dev/null; then
    break
  fi
  sleep 2
done
curl --max-time 10 --fail --silent http://127.0.0.1:4096/global/health
systemctl enable opencode-max-bot.service
systemctl restart opencode-max-bot.service
systemctl is-active --quiet opencode.service
systemctl is-active --quiet opencode-max-bot.service
systemctl --no-pager --full status opencode.service opencode-max-bot.service
