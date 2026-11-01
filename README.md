# Aon Wiki.js

Aon now runs on Wiki.js, an open-source wiki engine, with PostgreSQL for persistent data. GitHub Pages is a static host and cannot run Wiki.js, login, registration, or a live database. When the domain is moved to the Cloudflare Tunnel, visitors will reach the Wiki.js server running on this PC instead of the Pages copy.

Wiki.js uses Markdown, not NamuWiki's proprietary engine or Namumark syntax. This setup provides a real open-source wiki engine with member accounts and collaborative pages, but it is not an exact NamuWiki clone.

## Requirements

- Windows 10/11 with virtualization enabled
- Docker Desktop for Windows, installed and running
- Internet access to download the Wiki.js and PostgreSQL images

Docker was not installed on the development PC when this configuration was prepared. Install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/), launch it, and wait until its engine is running.

## Run locally

1. Double-click `run.bat`.
2. The first run creates `.env.wiki` with a random PostgreSQL password. `.env.wiki` is ignored by Git; do not share or commit it.
3. Docker downloads Wiki.js and PostgreSQL, then opens `http://localhost:3030`.
4. Complete Wiki.js's initial setup wizard and create the administrator account.

Subsequent starts use the existing PostgreSQL Docker volume. To inspect logs, open PowerShell in this folder and run:

```powershell
docker compose --env-file .env.wiki logs -f
```

Stop the containers with:

```powershell
docker compose --env-file .env.wiki down
```

This keeps the database volume. Do not run `docker compose down -v` unless you intend to delete the wiki database.

## Allow member registration and page creation

After creating the first administrator:

1. In Wiki.js administration, enable the **Local** authentication strategy and self-registration.
2. Set newly registered accounts to the regular `Users` group; do not assign administrator privileges.
3. In group permissions, allow `Users` to read, create, and edit pages. Keep administration and user-management permissions restricted to `Administrators`.
4. Keep guest read access enabled if visitors should view pages without signing in.

Once self-registration and page permissions are enabled, anyone can create an account and contribute wiki pages. Review registration and page-permission settings before sharing the public URL.

## HTTPS and public access with Cloudflare Tunnel

The Wiki.js container is not exposed directly to the Internet. The Cloudflare Tunnel container makes an outbound connection and forwards HTTPS requests to Wiki.js. The tunnel service has no host port open.

1. Create a Cloudflare account and add a tunnel in **Zero Trust → Networks → Tunnels**. Choose the Docker connector and copy its tunnel token.
2. Put the token in `.env.wiki` as `CLOUDFLARE_TUNNEL_TOKEN=...`. Keep this secret private.
3. In the tunnel's public-hostname settings, route `aon69446.p-e.kr` to `http://wiki:3000`. If Cloudflare DNS prompts for a record, use the tunnel-generated CNAME target.
4. Double-click `run-tunnel.bat`.
5. Complete domain/DNS verification in Cloudflare. Then set Wiki.js's public site URL to `https://aon69446.p-e.kr` and test sign-in, registration, and page creation over HTTPS.

### DNS requirement and current HTTPS status

The last check found that `aon69446.p-e.kr` still resolves to GitHub Pages A records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`), and HTTPS fails with a certificate hostname mismatch. HTTPS is **not fixed yet**.

Cloudflare Tunnel's custom hostname must be in a DNS zone managed by the same Cloudflare account as the tunnel. This domain is a subdomain of `p-e.kr`, currently served by `dnsze.com`; changing an A/CNAME record at the current DNS provider alone may not be sufficient for Cloudflare to issue and serve HTTPS. Check whether the domain control panel allows delegating `aon69446.p-e.kr` to Cloudflare's assigned nameservers. If it does not, ask the domain provider how to delegate the subdomain, or use a domain you can add to Cloudflare. Do not remove the working Pages DNS records until the Cloudflare hostname and certificate are ready; otherwise the public site may go offline.

GitHub Pages cannot keep serving the same hostname after its DNS is moved to the PC tunnel. The local Docker setup can be tested at `http://localhost:3030` before any DNS change.

## Database backups

Wiki.js stores its data in the Docker volume `wikijs-database`. Create and store PostgreSQL backups separately from this repository. For example, with the containers running:

```powershell
docker compose --env-file .env.wiki exec -T database pg_dump -U wikijs wikijs > wiki-backup.sql
```

The previous custom Node.js/SQLite editor remains in the source tree as legacy code, but `run.bat` now launches Wiki.js. GitHub Pages files and prior SQLite data are not automatically imported into Wiki.js.
