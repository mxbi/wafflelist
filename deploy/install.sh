#!/usr/bin/env bash
#
# One-time (idempotent) VPS bootstrap for Wafflelist deploys.
#
# Run as root from a checkout of this repository:
#
#   sudo deploy/install.sh --production-origin https://wafflelist.example.com \
#                          --deploy-user deploy
#
# Safe to re-run: it never touches /srv/wafflelist/production/data, and it
# leaves an existing production.env alone unless --force-env is passed.

set -euo pipefail

ROOT_DIR=/srv/wafflelist
PROD_DIR="$ROOT_DIR/production"
PREVIEWS_DIR="$ROOT_DIR/previews"
INCOMING_DIR="$ROOT_DIR/incoming"
CONF_DIR=/etc/wafflelist
CADDY_SNIPPET_DIR=/etc/caddy/wafflelist-previews

PROD_USER=wafflelist
PREVIEW_USER=wafflelist-preview

PRODUCTION_PORT=3000
PRODUCTION_ORIGIN=''
DEPLOY_USER=deploy
DEPLOY_PUBKEY=''
FORCE_ENV=0

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root"

while [ $# -gt 0 ]; do
	case $1 in
	--production-origin) PRODUCTION_ORIGIN=${2:?}; shift 2 ;;
	--production-port) PRODUCTION_PORT=${2:?}; shift 2 ;;
	--deploy-user) DEPLOY_USER=${2:?}; shift 2 ;;
	--deploy-pubkey) DEPLOY_PUBKEY=${2:?}; shift 2 ;;
	--force-env) FORCE_ENV=1; shift ;;
	-h | --help)
		sed -n '2,13p' "$0"
		exit 0
		;;
	*) die "unknown argument: $1" ;;
	esac
done

[ -n "$PRODUCTION_ORIGIN" ] || die "--production-origin is required (e.g. https://wafflelist.example.com)"

repo_root=$(cd "$(dirname "$0")/.." && pwd)
[ -f "$repo_root/deploy/bin/wafflelist-ctl" ] || die "run this from a checkout of the repository"

NODE_BIN=${NODE_BIN:-$(command -v node 2>/dev/null || true)}
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || die "node is not installed (or set NODE_BIN=/path/to/node)"
NODE_BIN=$(readlink -f "$NODE_BIN")
node_major=$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')
expected_major=$(tr -d '[:space:]' <"$repo_root/.nvmrc" 2>/dev/null || echo '')
if [ -n "$expected_major" ] && [ "$node_major" != "$expected_major" ]; then
	printf 'warning: %s is Node %s but .nvmrc pins %s; native modules are built per ABI, so keep these in sync\n' \
		"$NODE_BIN" "$node_major" "$expected_major" >&2
fi

# ------------------------------------------------------------------- users

for user in "$PROD_USER" "$PREVIEW_USER"; do
	if id "$user" >/dev/null 2>&1; then
		log "user $user already exists"
	else
		log "creating system user $user"
		useradd --system --shell /usr/sbin/nologin --no-create-home "$user"
	fi
done

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
	log "creating deploy user $DEPLOY_USER"
	useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

# The deploy user must NOT be able to read the production database directly;
# it only gets sudo access to wafflelist-ctl.
if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx "$PROD_USER"; then
	die "$DEPLOY_USER is a member of the $PROD_USER group; remove it so the deploy account cannot read the database directly"
fi

# ------------------------------------------------------------- directories

log "creating directory layout under $ROOT_DIR"
mkdir -p "$PROD_DIR/releases" "$PROD_DIR/data" "$PROD_DIR/backups" \
	"$PREVIEWS_DIR" "$INCOMING_DIR" "$CONF_DIR/previews"

chown root:root "$ROOT_DIR"
chmod 755 "$ROOT_DIR"

# 0750 so the preview user cannot even traverse into production, and 0700 on
# data/ so only the production user can open the database. This is the primary
# guarantee; the systemd sandboxing is defence in depth.
chown -R "$PROD_USER:$PROD_USER" "$PROD_DIR"
chmod 750 "$PROD_DIR"
chmod 700 "$PROD_DIR/data" "$PROD_DIR/backups"
chmod 755 "$PROD_DIR/releases"

chown "$PREVIEW_USER:$PREVIEW_USER" "$PREVIEWS_DIR"
chmod 755 "$PREVIEWS_DIR"

# Tarballs land here over scp, so the deploy user owns it.
chown "$DEPLOY_USER:$DEPLOY_USER" "$INCOMING_DIR"
chmod 750 "$INCOMING_DIR"

chmod 755 "$CONF_DIR" "$CONF_DIR/previews"

# ------------------------------------------------------------------ config

if [ -f "$CONF_DIR/production.env" ] && [ "$FORCE_ENV" -eq 0 ]; then
	log "keeping existing $CONF_DIR/production.env (pass --force-env to overwrite)"
else
	log "writing $CONF_DIR/production.env"
	cat >"$CONF_DIR/production.env" <<ENV
# Production runtime environment for wafflelist.service.
# Edited by hand; deploys do not overwrite this file.
NODE_ENV=production
HOST=127.0.0.1
PORT=$PRODUCTION_PORT
ORIGIN=$PRODUCTION_ORIGIN
ENV
	chmod 644 "$CONF_DIR/production.env"
fi

# --------------------------------------------------------- scripts + units

log "installing wafflelist-ctl to /usr/local/bin"
install -m 0755 -o root -g root "$repo_root/deploy/bin/wafflelist-ctl" /usr/local/bin/wafflelist-ctl

# Pin the node binary for wafflelist-ctl. Installing dependencies under one node
# and running the service under another builds native modules for the wrong ABI,
# which produces a release that starts but fails on every database call.
log "pinning NODE_BIN=$NODE_BIN in $CONF_DIR/ctl.conf"
if [ -f "$CONF_DIR/ctl.conf" ]; then
	sed -i '/^NODE_BIN=/d' "$CONF_DIR/ctl.conf"
else
	printf '# Overrides for wafflelist-ctl. See deploy/README.md.\n' >"$CONF_DIR/ctl.conf"
fi
printf 'NODE_BIN=%s\n' "$NODE_BIN" >>"$CONF_DIR/ctl.conf"
chmod 644 "$CONF_DIR/ctl.conf"

log "installing systemd units"
for unit in "$repo_root"/deploy/systemd/*; do
	install -m 0644 -o root -g root "$unit" "/etc/systemd/system/$(basename "$unit")"
done
# The units ship with ExecStart=/usr/bin/node; point them at the node we
# actually resolved, so the service and the installer never diverge.
for unit in wafflelist.service wafflelist-preview@.service; do
	dropin="/etc/systemd/system/$unit.d"
	mkdir -p "$dropin"
	cat >"$dropin/10-node-path.conf" <<DROPIN
# Managed by deploy/install.sh - keeps ExecStart on the same node that
# wafflelist-ctl uses to install dependencies.
[Service]
ExecStart=
ExecStart=$NODE_BIN current/build/index.js
DROPIN
	chmod 644 "$dropin/10-node-path.conf"
done

systemctl daemon-reload

# ----------------------------------------------------------------- sudoers

log "granting $DEPLOY_USER passwordless sudo for wafflelist-ctl only"
sudoers=/etc/sudoers.d/wafflelist-deploy
# Staged outside /etc/sudoers.d so a partial file is never in sudo's search path.
sudoers_tmp=$(mktemp /tmp/wafflelist-sudoers-XXXXXX)
cat >"$sudoers_tmp" <<SUDO
# Managed by deploy/install.sh.
# The GitHub Actions deploy key can run exactly this one script as root. The
# script validates all of its arguments.
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/bin/wafflelist-ctl
SUDO
chmod 440 "$sudoers_tmp"
# Never install a sudoers file that does not parse - a broken one can lock the
# machine out of sudo entirely.
if visudo -cf "$sudoers_tmp" >/dev/null; then
	install -m 0440 -o root -g root "$sudoers_tmp" "$sudoers"
	rm -f "$sudoers_tmp"
else
	rm -f "$sudoers_tmp"
	die "generated sudoers file failed validation"
fi

# -------------------------------------------------------------------- ssh

if [ -n "$DEPLOY_PUBKEY" ]; then
	deploy_home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
	log "adding deploy public key to $deploy_home/.ssh/authorized_keys"
	mkdir -p "$deploy_home/.ssh"
	touch "$deploy_home/.ssh/authorized_keys"
	if ! grep -qF "$DEPLOY_PUBKEY" "$deploy_home/.ssh/authorized_keys"; then
		printf '%s\n' "$DEPLOY_PUBKEY" >>"$deploy_home/.ssh/authorized_keys"
	fi
	chmod 700 "$deploy_home/.ssh"
	chmod 600 "$deploy_home/.ssh/authorized_keys"
	chown -R "$DEPLOY_USER:$DEPLOY_USER" "$deploy_home/.ssh"
fi

# ------------------------------------------------------------------ caddy

log "preparing $CADDY_SNIPPET_DIR"
mkdir -p "$CADDY_SNIPPET_DIR"
chmod 755 "$CADDY_SNIPPET_DIR"
# Caddy errors on an import glob that matches nothing.
if ! ls "$CADDY_SNIPPET_DIR"/*.caddy >/dev/null 2>&1; then
	printf '# Placeholder so the import glob in the Caddyfile always matches.\n' \
		>"$CADDY_SNIPPET_DIR/00-placeholder.caddy"
fi

# ------------------------------------------------------------------ timers

log "enabling backup and preview-gc timers"
systemctl enable --now wafflelist-backup.timer
systemctl enable --now wafflelist-preview-gc.timer

log "enabling wafflelist.service (not started - no release deployed yet)"
systemctl enable wafflelist.service >/dev/null

cat <<NEXT

Bootstrap complete.

Remaining manual steps:

 1. Reverse proxy: merge deploy/caddy/Caddyfile.example into /etc/caddy/Caddyfile,
    pointing production at 127.0.0.1:$PRODUCTION_PORT, and keep the
    'import $CADDY_SNIPPET_DIR/*.caddy' line.

 2. DNS: add a wildcard record for previews, e.g.
      *.preview.your-domain  ->  this server's IP

 3. GitHub repository secrets:
      VPS_HOST              this server's hostname
      VPS_USER              $DEPLOY_USER
      VPS_SSH_KEY           private key whose public half is authorized for $DEPLOY_USER
      VPS_SSH_KNOWN_HOSTS   output of: ssh-keyscan -H <this host>
    GitHub repository variables:
      PREVIEW_DOMAIN        e.g. preview.your-domain
      PRODUCTION_URL        e.g. $PRODUCTION_ORIGIN
      VPS_SSH_PORT          only if sshd is not on 22

 4. Push to main to deploy production, or label a PR 'preview' for a preview.

Check state at any time with:  sudo wafflelist-ctl list
NEXT
