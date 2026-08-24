# Deployment

Automated production deploys and per-PR preview environments for a single VPS
running systemd.

- **Push to `main`** → production is built, backed up, deployed, health-checked,
  and rolled back automatically if the new release does not come up.
- **Label a PR `preview`** → that PR gets its own URL at
  `https://pr-<number>.<preview-domain>`, backed by its own empty database.
- **Close the PR or remove the label** → the preview is destroyed.

Nothing here changes how the app is built or run. Production is still
`node build/index.js` under systemd, with `data/wafflelist.db` next to it.

## How production data is protected

The design goal is that a preview deploy cannot damage, or read, the real
database — even if the PR is actively malicious. Four independent layers:

| Layer | What it does |
|---|---|
| Separate directory trees | Previews live in `/srv/wafflelist/previews/pr-N`. The app derives its database path from `process.cwd()`, so each preview creates its *own* empty `data/wafflelist.db`. Production data is never copied or seeded into a preview. |
| Separate unix users | Production runs as `wafflelist`; previews run as `wafflelist-preview`. `/srv/wafflelist/production` is `0750` and `data/` is `0700`, so the preview user cannot traverse to, let alone open, the production database. This also covers `npm` lifecycle scripts, which run as the preview user. |
| systemd sandboxing | The preview unit sets `ProtectSystem=strict` with only its own directory writable, plus `InaccessiblePaths=/srv/wafflelist/production`. It also sets `IPAddressDeny=any` (loopback only), so preview code cannot phone home from the server. |
| Backups | Every production deploy takes a verified `PRAGMA integrity_check`ed snapshot *before* swapping releases, and a timer takes a daily one. A failed backup aborts the deploy. |

Production deploys are also guarded against shipping a broken release:

1. The new release is unpacked and its dependencies installed **without touching
   anything live**.
2. `verify_release` loads `better-sqlite3` under the exact node the service uses
   and writes a throwaway database in the real data directory. This catches
   native-module ABI mismatches and permission problems *before* the swap.
3. Only then is the database backed up and the `current` symlink swapped.
4. The restarted service must answer two probes (see below). If it does not, the
   symlink is repointed at the previous release and the service restarted, and
   the deploy exits non-zero.

### Why the health check hits `/api/sync`

`GET /` is not sufficient on its own. SvelteKit's node adapter imports route
chunks lazily and the app opens the database lazily, so `/` returns 200 even
when every API route and the database are broken.

`GET /api/sync` with a fresh timestamp and an unknown user id loads the route's
server chunk and runs a `SELECT` against the database before rejecting the
unsigned request. So **401 means routes load and the database answers**, while
500 means the release is broken. It writes nothing.

The deploy account itself is not in the `wafflelist` group and has passwordless
sudo for exactly one command, `/usr/local/bin/wafflelist-ctl`, which validates
every argument it is given.

> [!WARNING]
> **Always sign in to a preview with a throwaway seed phrase.**
>
> The layers above protect the *server*. They cannot protect your vault: preview
> code is unreviewed JavaScript running in your browser, so if you type your real
> seed phrase into a preview it can be exfiltrated, and that is enough to decrypt
> everything in production. Previews are on their own subdomain, so their
> IndexedDB is a separate origin and your real vault is never loaded into one
> unless you type the phrase in yourself. Generate a fresh vault per review.

## One-time setup

Prerequisites: Node.js (matching `.nvmrc`), Caddy, and git on the VPS.

> [!IMPORTANT]
> **One node binary, used everywhere.** `better-sqlite3` is a native module
> compiled per Node ABI, so installing dependencies under one node and running
> the service under another yields a release that starts fine and then fails on
> every database call. `install.sh` resolves node once, records it as `NODE_BIN`
> in `/etc/wafflelist/ctl.conf`, and writes a systemd drop-in so `ExecStart` uses
> that same binary. **Re-run `install.sh` after upgrading Node** so both sides
> move together.

### 1. Bootstrap the VPS

```sh
git clone https://github.com/mxbi/wafflelist /tmp/wafflelist-setup
cd /tmp/wafflelist-setup
sudo deploy/install.sh \
  --production-origin https://wafflelist.mxbi.net \
  --production-port 3000 \
  --deploy-user deploy \
  --deploy-pubkey "$(cat ~/deploy_key.pub)"
```

This is idempotent and never touches `/srv/wafflelist/production/data`. It
creates the users and directory layout, installs `wafflelist-ctl` and the
systemd units, writes the sudoers rule, and enables the backup and GC timers.

If you already run Wafflelist from somewhere else, move your existing database
into place before the first deploy:

```sh
sudo systemctl stop wafflelist
sudo install -o wafflelist -g wafflelist -m 600 \
  /path/to/old/wafflelist.db /srv/wafflelist/production/data/wafflelist.db
```

### 2. Reverse proxy

Merge `deploy/caddy/Caddyfile.example` into `/etc/caddy/Caddyfile`. The
important part is the import line, which picks up the per-PR files that
`wafflelist-ctl` generates:

```
import /etc/caddy/wafflelist-previews/*.caddy
```

Each preview gets its own certificate over HTTP-01, so no wildcard certificate
or DNS plugin is needed.

### 3. DNS

Add a wildcard record so preview hostnames resolve:

```
*.preview.wafflelist.mxbi.net   A   <your VPS IP>
```

### 4. GitHub configuration

Create a deploy keypair (`ssh-keygen -t ed25519 -f deploy_key -N ''`), authorize
the public half for the deploy user, then set:

**Secrets** (Settings → Secrets and variables → Actions):

| Name | Value |
|---|---|
| `VPS_HOST` | VPS hostname |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | contents of the private `deploy_key` |
| `VPS_SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H <host>` |

**Variables:**

| Name | Value |
|---|---|
| `PREVIEW_DOMAIN` | `preview.wafflelist.mxbi.net` |
| `PRODUCTION_URL` | `https://wafflelist.mxbi.net` |
| `VPS_SSH_PORT` | only if sshd is not on 22 |

Create a `preview` label in the repository, and optionally two GitHub
Environments named `production` and `preview` — adding required reviewers to
`preview` means a preview cannot deploy until you approve the run.

## Day-to-day

```sh
sudo wafflelist-ctl list              # what is deployed, and on which ports
sudo wafflelist-ctl backup            # snapshot the production database now
sudo wafflelist-ctl teardown-preview --pr 12
sudo wafflelist-ctl gc                # drop previews older than 14 days
journalctl -u wafflelist -f
journalctl -u wafflelist-preview@12 -f
```

Manual redeploy or rollback: run the **Deploy production** workflow with a
specific SHA (`workflow_dispatch`), or on the VPS repoint the symlink:

```sh
ls /srv/wafflelist/production/releases          # timestamped release dirs
sudo ln -sfn releases/<name> /srv/wafflelist/production/current.new
sudo mv -T /srv/wafflelist/production/current.new /srv/wafflelist/production/current
sudo systemctl restart wafflelist
```

Restore a backup:

```sh
sudo systemctl stop wafflelist
sudo -u wafflelist gunzip -c /srv/wafflelist/production/backups/wafflelist-<ts>.db.gz \
  > /srv/wafflelist/production/data/wafflelist.db
sudo systemctl start wafflelist
```

## How the CI security model works

`deploy-preview.yml` runs unreviewed PR code, so it is split into two jobs:

- **`build`** checks out the PR head and runs its build. It references **no
  secrets**, so there is nothing for that code to steal. It also sets
  `persist-credentials: false` so the `GITHUB_TOKEN` is not left on disk.
- **`deploy`** holds the SSH secrets but runs no PR code — it only ships the
  artifact `build` produced.

Previews are gated on the `preview` label, so only someone with write access can
cause PR code to run on the VPS. Label a PR only after reading its diff.

`.github/scripts/check-preview-isolation.py` enforces all of the above and runs
in CI, so this cannot silently regress.

## Tuning

Override any default in `/etc/wafflelist/ctl.conf` (sourced by `wafflelist-ctl`):

```sh
NODE_BIN=/usr/bin/node      # node used to install, verify, back up and serve
PREVIEW_PORT_BASE=31000     # preview PR N listens on 31000+N
KEEP_RELEASES=5             # releases kept per environment
KEEP_BACKUPS=14             # database snapshots retained
PREVIEW_MAX_AGE_DAYS=14     # gc threshold for abandoned previews
HEALTH_TIMEOUT=60           # seconds to wait for a release to come up
```

## Known limitations

- **Previews are not isolated from each other.** They all run as
  `wafflelist-preview`, so one preview could read another's throwaway database.
  Production is unaffected. Give each preview its own user if this matters.
- **Preview installs run `npm ci` on the VPS**, which executes dependency
  lifecycle scripts from the PR's lockfile. This runs as the unprivileged
  preview user, but it is why previews are label-gated.
- **Production restarts briefly** during a deploy (a second or two); there is no
  connection draining.
- **Upgrading Node on the VPS requires re-running `install.sh`** (or editing
  `NODE_BIN`) so the installer and the service agree on the binary. A mismatch is
  caught by the health check and rolled back, but it wastes a deploy.
- Preview ports are `PREVIEW_PORT_BASE + PR number`, so PR numbers above 1999
  need `PREVIEW_PORT_BASE`/`PREVIEW_PR_MAX` raised.
