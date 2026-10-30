# CarBook Deployment Guide

Self-hosting runbook for a single-owner CarBook instance. Written against the reference deployment on Oracle Cloud Infrastructure, but nothing here is OCI-specific.

> **Read §1 before touching a live instance.** The production database holds real, irreplaceable vehicle history. Every step below assumes it has been backed up first.

---

## 1. Before you start

**Back up the database.** This is not a precaution, it is the first step:

```bash
sudo systemctl stop carbook.service
sudo cp /var/lib/carbook/car_maintenance.db ~/carbook-backup-$(date +%F).db
sudo systemctl start carbook.service
```

If the instance is running, also take an application-level export from **Settings → Backup** (`GET /api/backup`). A file copy and an app export fail in different ways, and having both costs nothing.

**What you need:**

| Item | Notes |
| :--- | :--- |
| A Linux host | Ubuntu 24.04 LTS is what the reference deployment runs. |
| Node.js ≥ 18.18 | Reference host runs v20+. |
| A hostname that resolves to the host | A real domain, or an `sslip.io` name for testing. |
| Ports 80 and 443 open | On *both* the cloud firewall and the OS firewall — see §7. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Only if you want Google sign-in. The app is fully usable without it. |
| A generated `JWT_SECRET` | `openssl rand -base64 32`. **Required in production.** |

---

## 2. Environment reference

Next.js reads `.env`, then `.env.production` when `NODE_ENV=production`, then real environment variables — which win. The reference deployment splits them: secrets in the systemd unit, everything else in `/var/www/carbook/.env`.

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | **Yes, in production** | — | Signs session and device tokens. `getJwtSecret()` **throws** under `NODE_ENV=production` if unset — and it throws at *request* time, so the app boots and renders fine, then every auth route answers `500`. Changing it invalidates all sessions. |
| `CARBOOK_DB_PATH` | Recommended | `./car_maintenance.db` | Absolute path to the SQLite file. Set it to somewhere outside the checkout so a redeploy cannot touch live data. |
| `APP_ORIGIN` | Behind a proxy | inferred | Canonical public origin. Without it the post-login redirect is built from `x-forwarded-host`, and trusting a client-supplied host header is how open redirects happen. |
| `GOOGLE_CLIENT_ID` | For sign-in | — | OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | For sign-in | — | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | For sign-in | inferred | Must match a registered Authorized redirect URI **byte for byte**, scheme and path included. |
| `SERVER_GEMINI_API_KEY` | No | — | Server-managed Google AI Studio key. `GEMINI_API_KEY` is accepted as an alias. |
| `SERVER_OPENROUTER_API_KEY` | No | — | Server-managed OpenRouter key. `OPENROUTER_API_KEY` is accepted as an alias. |
| `AI_TIMEOUT_MS` | No | `30000` | Per-request deadline for outgoing AI calls. |

With no AI key the app does not degrade to nothing: it falls back to the preseeded automotive database, the cross-user specs cache, and clearly-labelled heuristics.

`.env.example` in the repository root is the canonical annotated copy of this table.

---

## 3. Install

```bash
sudo mkdir -p /var/www/carbook /var/lib/carbook
sudo chown -R $USER:$USER /var/www/carbook /var/lib/carbook

git clone https://github.com/mkamel30/CarBook.git /var/www/carbook-src
cd /var/www/carbook-src
npm install
npm run build
```

Build on the host, or build elsewhere and ship `.next`, `public`, `package.json`, `next.config.js` and `node_modules`. `next start` does not need `src/` at runtime — which is what makes the partial-artifact deploy in §5 work.

Move any existing database into place rather than letting the app create a fresh one:

```bash
sudo mv /var/www/carbook/car_maintenance.db /var/lib/carbook/car_maintenance.db
```

---

## 4. systemd unit

`/etc/systemd/system/carbook.service`:

```ini
[Unit]
Description=CarBook vehicle logbook
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/var/www/carbook
ExecStart=/usr/bin/node /var/www/carbook/node_modules/next/dist/bin/next start -p 3070
Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=3070
Environment=CARBOOK_DB_PATH=/var/lib/carbook/car_maintenance.db
Environment=APP_ORIGIN=https://carbook.example.com
Environment=GOOGLE_REDIRECT_URI=https://carbook.example.com/api/auth/callback/google
EnvironmentFile=-/var/www/carbook/.env

[Install]
WantedBy=multi-user.target
```

The `-` in `EnvironmentFile=-` means "do not fail if this file is absent".

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now carbook.service
sudo systemctl status carbook.service --no-pager
```

The app listens on `127.0.0.1:3070` and is never exposed directly — nginx fronts it.

---

## 5. nginx

`/etc/nginx/sites-available/carbook`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name carbook.example.com;

    client_max_body_size 50M;

    # Hashed, immutable build assets — cache for a year.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3070;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Everything else — never cache, or a deploy will not reach the browser.
    location / {
        proxy_pass http://127.0.0.1:3070;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 300s;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/carbook /etc/nginx/sites-enabled/carbook
sudo nginx -t && sudo systemctl reload nginx
```

Two headers matter more than they look:

- **`X-Forwarded-Proto`** — without it the app cannot tell it is behind TLS, and the production session cookie is `secure`, so it is never sent and every request looks anonymous.
- **`X-Forwarded-Host`** — without it the inferred redirect URI points at `127.0.0.1:3070`. Setting `APP_ORIGIN` and `GOOGLE_REDIRECT_URI` explicitly removes the inference entirely, which is the better fix.

---

## 6. HTTPS

The production session cookie is `secure`. Without TLS, sign-in cannot work at all — this is not a nice-to-have.

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d carbook.example.com --non-interactive --agree-tos \
  -m you@example.com --redirect
```

`--redirect` rewrites the vhost to add a 443 server block and a permanent 80 → 443 redirect. Certbot renews via its own systemd timer; confirm with `sudo certbot renew --dry-run`.

An `sslip.io` name (`carbook.203.0.113.7.sslip.io`) is a real DNS name pointing at your IP, and Let's Encrypt issues for it — useful before you have a domain. It is not a substitute for one in the long run: the name embeds the IP, so changing the host changes the URL, the certificate, and every registered redirect URI.

---

## 7. Two firewalls, not one

This is the single most common reason a fresh OCI instance appears dead.

Oracle computes have **two** independent packet filters, and both must allow the port:

1. **OCI Security List / NSG** — in the console, under *Networking → Virtual Cloud Networks → Security Lists*. Add an ingress rule for TCP 80 and TCP 443 from `0.0.0.0/0`.
2. **OS firewall inside the image** — Oracle's Ubuntu images ship with `iptables` rules that drop everything except SSH. Adding the OCI rule alone changes nothing.

```bash
sudo iptables -L INPUT -n --line-numbers | head -20

sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

sudo netfilter-persistent save
```

The rule position matters — it has to land before the blanket `REJECT`. Check the line numbers first and adjust.

Do **not** open 3070. The app should be reachable only through nginx.

---

## 8. Google OAuth setup

In the Google Cloud Console, on the OAuth 2.0 client:

- **Authorized JavaScript origins:** `https://carbook.example.com`
- **Authorized redirect URI:** `https://carbook.example.com/api/auth/callback/google`

Then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` on the host and restart the service.

**A trap worth naming.** The redirect URI Google compares against is the one the app *sends*, not the one you think it sends. If `GOOGLE_REDIRECT_URI` is unset the app infers it from request headers, and a mismatch produces `redirect_uri_mismatch` with no obvious cause. Set it explicitly.

With placeholder credentials left in place Google answers `401 invalid_client`. Everything else in CarBook works without signing in — the app does not require an account.

---

## 9. Verifying a deployment

Run these in order; each one isolates a different layer.

```bash
# 1. Process is up
sudo systemctl is-active carbook.service

# 2. App answers locally (bypasses nginx and both firewalls)
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3070/

# 3. nginx proxies correctly
curl -sS -o /dev/null -w '%{http_code}\n' https://carbook.example.com/

# 4. TLS certificate is valid and not expiring
echo | openssl s_client -servername carbook.example.com -connect carbook.example.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# 5. Auth layer actually works — this is the one that catches a missing JWT_SECRET
curl -sS https://carbook.example.com/api/auth/me
#    expect: {"authenticated":false,"user":null}
#    a 500 here means JWT_SECRET is not reaching the process

# 6. The database is the one you meant
sqlite3 "$CARBOOK_DB_PATH" 'SELECT COUNT(*) FROM vehicles;'
```

Step 5 is the one people skip and regret. A missing `JWT_SECRET` does not stop the service, does not show in the logs at boot, and does not break any page — it breaks sign-in, silently, once someone tries it.

Then, in a browser: sign in, add a vehicle, log a fill, confirm the schedule badges evaluate, download a backup, and restore it into a merge to confirm the round trip.

---

## 10. Backups

Three layers, because they protect against different things.

**Application export** — Settings → Backup, or `GET /api/backup`. Produces a versioned JSON document of the account's vehicles, schedules, maintenance logs and fuel logs. Restores default to `merge`, which re-adds missing records and never overwrites existing ones, so restoring over live data is safe by default. It does **not** include `app_settings` — fuel prices, theme, language and any user AI key are not in the file. Treat it as a data-portability format, not as a backup of the instance.

**File copy** — the database is a single file:

```bash
sudo sqlite3 /var/lib/carbook/car_maintenance.db ".backup '/var/backups/carbook/carbook-$(date +%F).db'"
```

Use the `.backup` command, not `cp`, on a live database — `cp` of a file being written can produce a torn copy.

**Off-host** — a backup on the same machine is not a backup. `scp` it somewhere else, or point a restic/borg repository at it.

A `cron` entry for the file copy, plus a weekly off-host push, is enough for a single-owner instance. Continuous replication (Litestream against object storage) is the upgrade path if the history becomes something you cannot afford to lose a day of.

---

## 11. Redeploying

```bash
cd /var/www/carbook-src
git pull
npm install
npm run build
```

Then ship `.next`, `public`, `package.json` and `next.config.js` to `/var/www/carbook`, remove the old build first, and restart:

```bash
rm -rf /var/www/carbook/.next
# copy the new artifacts
sudo systemctl restart carbook.service
```

`rm -rf .next` before extracting is not optional tidiness — a stale route cache serves old handlers under new URLs, and the symptom is a fix that "did not take".

Migrations run automatically at startup and are additive, so an existing database needs no manual step. Because of that, the artifact bundle must never contain a `car_maintenance.db`: shipping one overwrites live history. `CARBOOK_DB_PATH` pointing outside the checkout makes the mistake impossible rather than merely unlikely.

---

## 12. Reference deployment status

The instance this guide was written against:

| | |
| :--- | :--- |
| Host | Oracle Cloud Infrastructure, instance `MK_CS` |
| Region | `me-jeddah-1` |
| Image | `Canonical-Ubuntu-24.04-Minimal-2026.07.17-0`, launched 2026-08-24 |
| Path | `/var/www/carbook` |
| Public name | `carbook.141.147.136.170.sslip.io` |
| Reverse proxy | nginx → `127.0.0.1:3070` |

**What is confirmed working there:** the app serves over plain HTTP, the systemd unit and nginx vhost are in place, and the database holds real data. Both the `http://` and `https://` callback URIs are registered on the Google OAuth client, so the `redirect_uri_mismatch` is resolved.

**What is not done:**

- **HTTPS has not been verified as issued.** The certbot step is written and untested on this host. Until it succeeds, Google sign-in cannot work, because the production session cookie is `secure`.
- **Twenty commits are not deployed.** The fixes that make sign-in land on the right origin, bind refresh tokens to their device, and enforce ownership on every route exist in the repository and are tested, but the build running on the host predates them. The visible symptom is that the OAuth callback still redirects the browser to `localhost:3070`.
- **The database still lives inside the checkout** at `/var/www/carbook/car_maintenance.db`. It survives the current redeploy script, but it should move to `/var/lib/carbook` and `CARBOOK_DB_PATH` should be set.
- **There is no scheduled backup.** No cron entry, no off-host copy, on a database that cannot be reconstructed.
- **The account email is unreconciled.** The deploy tooling hardcodes `mkamel30@gmail.com` for the legacy-vehicle claim; the account that actually signs in is `m.kamel.smart@gmail.com`. The claim query matches zero rows until those agree, and only the owner can say which is correct.
- **Vehicles created before the account system have `user_id IS NULL`** and are therefore invisible. The claim step is what assigns them, and it has never run successfully.

The two PowerShell deploy scripts (`deploy-carbook-vps.ps1`, `fix-vps-deploy.ps1`) live outside the repository and are deliberately untracked — they embed host IPs, key paths and an email address. Treat them as operator tooling, not as part of the product.

**Access note:** the authorized SSH private key is on a different machine. From a workstation that does not hold it, every deployment step is blocked at `Permission denied (publickey)`. Oracle's Ubuntu images reject ed25519 keys from Cloud Shell because it runs in FIPS mode — generate RSA with `ssh-keygen -t rsa -b 4096` if you need a new key from there.


---

## 13. Roadmap

Ordered by what unblocks what.

1. **HTTPS on the host.** Blocks Google sign-in, blocks the device client, blocks the `secure` cookie. Everything below waits on it.
2. **Move the database out of the checkout** and set `CARBOOK_DB_PATH`. Small, safe, and it removes the worst possible redeploy failure.
3. **Scheduled backups.** A `cron` entry plus an off-host destination.
4. **Reconcile the account email**, then run the legacy-vehicle claim so pre-auth rows become visible to their owner.
5. **OAuth → device handoff.** `PUT /api/auth/device` needs a real account bearer token, and nothing currently delivers one to a phone after browser sign-in. The missing piece is a one-time-code redirect: browser completes sign-in, mints a short-lived code, the device redeems it.
6. **Flip the Capacitor shell** from `server.url` to a bundled `webDir`. Until then the phone loads the remote site and the offline data layer never runs on a device.
7. **Reuse the web UI inside the mobile shell**, or accept two UIs. The device data layer is done; the screens are not.
8. **Vehicle edit and delete in the web UI.** `/api/vehicles` exposes `GET` and `POST` only.
9. **Remove the unused `better-sqlite3` dependency.** Declared, never imported.
10. **Add a `LICENSE` file.** Both READMEs state MIT; the file itself is absent.
