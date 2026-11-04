# Deploying BulletsNdGuns

The game runs on [Railway](https://railway.com) as a single Docker container with a volume for the
SQLite database. This guide covers the first deploy, everyday redeploys, and the problems the first
deploy ran into, so nobody has to rediscover them.

- Live URL: https://game-production-3791.up.railway.app
- Railway project: `bulletsndguns`, environment `production`, service `game`
- Region: US East (Virginia), `us-east4-eqdc4a`: the Railway region closest to Colombia (about
  80 ms from Barranquilla).

## Why it looks like this

- **One replica, never more.** Rooms and matches live in the server's memory, and SQLite is a file
  on one disk. A second replica would split players across two servers that can't see each other's
  rooms. Scaling out would need shared room routing and another database; it isn't needed at this
  size.
- **A volume at `/data`.** Accounts and levels live in `/data/bng.sqlite`. Without the volume, every
  deploy would wipe them.
- **No sleeping.** Railway's "serverless" sleep would stop the server and drop every socket and room.
- **A deploy restarts the server.** Matches in progress end and players reconnect. A service with a
  volume can't run two deployments side by side, so there are a few seconds of downtime per deploy.
  Deploy when nobody is playing.

## What lives where

| File | Role |
| --- | --- |
| `Dockerfile` | Builds the client, installs only the server's production dependencies, runs the server. |
| `docker-entrypoint.sh` | Starts as root, hands `/data` to the `node` user, then runs the server as `node`. |
| `.railway/railway.ts` | Railway infrastructure as code: service, build, health check, volume, region, variables. |
| `.dockerignore` | Keeps `node_modules`, local env files, docs and tool folders out of the image. |

`.railway/railway.ts` is applied by hand (see below); Railway does not read it on deploy. It
replaces `railway.toml` / `railway.json`, which Railway stops reading after 2026-12-01.

## Environment variables

| Variable | Value | Set by |
| --- | --- | --- |
| `NODE_ENV` | `production` | Dockerfile |
| `DATABASE_PATH` | `/data/bng.sqlite` | Dockerfile |
| `PORT` | `3000` | `.railway/railway.ts` (Railway would otherwise inject `8080`) |
| `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` (resolves to the live URL) | `.railway/railway.ts` |
| `REAL_IP_HEADER` | `x-real-ip` (Railway's edge overwrites it with the player's address) | `.railway/railway.ts` |
| `BETTER_AUTH_SECRET` | 32 random bytes | CLI, once (never in a file) |

`BETTER_AUTH_SECRET` signs every session: anyone who has it can sign in as any player. It only
exists in Railway. Changing it signs everybody out; that is the fix if it ever leaks.

## Prerequisites

- Node 24 and the repository's dev dependencies (`npm install`; it includes the `railway` package
  that `.railway/railway.ts` imports).
- The Railway CLI, logged in: `npm install -g @railway/cli`, then `railway login`.
- Run Railway commands from **PowerShell** in the repository root. See "Problems we hit" for why
  `railway config` also needs the `$env:_` line below on Windows.

## First deploy (from nothing)

Run these in order from the repository root:

```powershell
# 1. Create the project and the service, and link this folder to them.
railway init --name bulletsndguns
railway add --service game
railway service link game

# 2. Store the session secret. It goes from the generator straight to Railway, never to the screen.
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" |
  railway variable set BETTER_AUTH_SECRET --stdin --skip-deploys

# 3. Apply .railway/railway.ts (build settings, health check, volume, region, variables).
$env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"
railway config plan     # review the changes
railway config apply --yes

# 4. Give the service a public URL, pointing at the port the server listens on.
railway domain --port 3000

# 5. Build and deploy the current folder.
railway up --ci
```

`railway up` uploads the working folder (respecting `.gitignore`), builds the Dockerfile on Railway,
and only switches traffic over once `GET /healthz` answers.

## Redeploying

Deploy from a clean, committed `master`, so what runs matches a commit:

```powershell
git status              # nothing uncommitted
npm test
railway up --ci
```

If `.railway/railway.ts` changed, run `railway config plan` and `railway config apply` first (with
the `$env:_` line).

## Checking a deploy

```powershell
railway deployment list         # latest should be SUCCESS
railway logs --deployment       # expect "BulletsNdGuns server listening on :3000"
curl.exe -s https://game-production-3791.up.railway.app/healthz   # {"status":"ok"}
```

Then open the URL in two separate browsers (or one normal and one private window). Sign in with an
account in one, join as a guest in the other, create a room, and play a level. The latency badge
should read about 80 ms from Colombia.

These security checks should hold. Each command uses `curl.exe`, not PowerShell's `curl` alias:

```powershell
$u = "https://game-production-3791.up.railway.app"
curl.exe -sI $u/ | Select-String "content-security-policy|strict-transport|x-frame"   # all three present
curl.exe -s -o NUL -w "%{http_code}" -H "Origin: https://evil.example" "$u/socket.io/?EIO=4&transport=polling"   # 403
curl.exe -s -X POST -H "Origin: https://evil.example" -H "content-type: application/json" -d "{}" $u/api/levels   # {"error":"forbidden"}
```

## Rolling back

Open the service in the dashboard (`railway open`), pick an earlier successful deployment and choose
**Redeploy**. The volume is untouched, so accounts and levels stay. Data written by a newer version
must still be readable by the older one; check this if the database schema changed.

## Backups

The whole game state is `/data/bng.sqlite` on the volume. To copy it to your machine:

```powershell
railway volume files download /bng.sqlite ./bng-backup.sqlite
```

The copy holds every account's email and password hash: keep it out of the repository (`data/` and
`*.sqlite` files belong in git-ignored folders) and delete it when no longer needed.

## Problems we hit on the first deploy

1. **`dockerfile invalid: docker VOLUME at Line 26 is not supported, use Railway Volumes`.** Railway
   refuses Dockerfiles with a `VOLUME` instruction. Removed it; Railway's volume (or `docker run -v`)
   still mounts `/data`.
2. **`Error: unable to open database file` (`ERR_SQLITE_ERROR`, errcode 14), health check failed.**
   Railway mounts volumes owned by root, and the server runs as the unprivileged `node` user, so
   SQLite couldn't create its file. Railway's suggested fix, `RAILWAY_RUN_UID=0`, runs the whole
   server as root. Instead, `docker-entrypoint.sh` fixes the folder's owner as root, then uses
   `su-exec` to run the server as `node`. `.gitattributes` keeps the script's line endings LF: a
   Windows CRLF checkout would break its `#!` line inside the Linux container.
3. **The deploy succeeded, but the URL answered `502 Bad Gateway`.** Railway injects `PORT=8080`,
   which overrides the Dockerfile's `PORT=3000`, while the domain had been created for port 3000.
   `.railway/railway.ts` now sets `PORT=3000` explicitly.
4. **`railway config plan` failed with "requires Railway CLI 5.42.1 or newer" on CLI 5.71.0.** The
   `railway/iac` package checks the CLI version by running the executable named in the `_`
   environment variable, or `railway`. On Windows with the npm-installed CLI, `railway` is only a
   `.cmd` wrapper that Node can't start directly, so the check fails. Pointing `$env:_` at the real
   `railway.exe` (step 3 above) works around it.
5. **Railway warned that `railway.toml` is deprecated (works until 2026-12-01).** Replaced it with
   `.railway/railway.ts`, which also covers the volume, region and variables.

6. **Every player was rate-limited as the same address.** With `TRUST_PROXY=1`, sessions recorded
   `152.233.23.194`, a Railway edge server in Miami, instead of the player's IP. A temporary log of
   the request headers showed the chain: player, then the Miami edge (`152.233.23.193`/`.194`),
   then an internal proxy (`100.64.x.x`). `X-Forwarded-For` was `<player>, <edge>`, so one trusted
   hop picked the edge. `X-Real-IP` held the player's address, and forged `X-Forwarded-For` and
   `X-Real-IP` headers never reached the server: the edge overwrites both. The hop count may differ
   for players entering through another edge, so the server now reads `X-Real-IP`
   (`REAL_IP_HEADER=x-real-ip`) instead of counting hops.

## Checking player IPs

Sign in on the live site, then compare the `ipAddress` of the newest session with your public IP
(for example from `curl.exe https://api.ipify.org`):

```powershell
railway ssh -- node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/bng.sqlite',{readOnly:true}).prepare('select ipAddress from session order by createdAt desc limit 1').get())"
```

They should match. A `152.233.x.x` or `100.64.x.x` address means the server is reading a proxy's
address again. Railway's own request log (`railway logs --http --json`, field `srcIp`) shows what
the edge saw, for comparison.
