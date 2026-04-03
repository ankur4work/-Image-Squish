# VPS Deployment

This project is a Shopify Remix app, so deploying it on a VPS needs four things to line up:

1. A stable public HTTPS domain, for example `https://app.yourdomain.com`
2. Runtime environment variables in `.env`
3. A reachable PostgreSQL database
4. Shopify app URLs updated to the same public domain

## 1. Prepare the VPS

These steps assume an Ubuntu VPS.

Install Docker and the Compose plugin, then clone the repo:

```bash
git clone <your-repo-url>
cd image-commpress
cp .env.example .env
```

Fill in `.env` with your real values:

- `SHOPIFY_APP_URL`: your final HTTPS domain
- `SHOPIFY_API_KEY`: from Shopify Partners
- `SHOPIFY_API_SECRET`: from Shopify Partners
- `SCOPES`: must match the scopes in `shopify.app.toml`
- `DATABASE_URL`: your production Postgres connection string
- `APP_PORT`: local VPS port exposed by Docker, default `3005`

## 2. Update Shopify app URLs

Before production install flows will work, update [`shopify.app.toml`](./shopify.app.toml) to your VPS domain:

- `application_url`
- every URL in `redirect_urls`

Example:

```toml
application_url = "https://app.yourdomain.com"

[auth]
redirect_urls = [
  "https://app.yourdomain.com/auth/callback",
  "https://app.yourdomain.com/auth/shopify/callback",
  "https://app.yourdomain.com/api/auth/callback"
]
```

After that, run:

```bash
npm run deploy
```

That pushes the updated app config and webhook URLs to Shopify.

## 3. Start the app on the VPS

Build and start the container:

```bash
docker compose up -d --build
```

The container will:

- build the Remix app
- run `prisma generate`
- run `prisma migrate deploy`
- start the production server on port `3000` inside the container

By default the VPS will expose it on `APP_PORT`, which is `3005` unless you change it.

## 4. Put Nginx in front of it

Use Nginx or Caddy so Shopify reaches your app through HTTPS on port 443.

Example Nginx site:

```nginx
server {
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

Then issue TLS with Let's Encrypt for the same domain.

## 5. Production checklist

- DNS for `app.yourdomain.com` points to the VPS IP
- Nginx serves `https://app.yourdomain.com`
- `.env` uses that exact same domain in `SHOPIFY_APP_URL`
- [`shopify.app.toml`](./shopify.app.toml) uses that exact same domain
- Postgres is reachable from the VPS
- `npm run deploy` has been run after changing app URLs or scopes

## Notes

- Do not keep tunnel URLs like `trycloudflare.com` in production config.
- Do not commit `.env`.
- If your app fails after auth, the most common cause is a mismatch between `SHOPIFY_APP_URL`, `application_url`, and `redirect_urls`.
