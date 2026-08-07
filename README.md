# B&B BEAU+ Subscription Admin

Shopify embedded React app for operating the prepaid B&B BEAU+ subscription program. It uses Shopify's React Router app framework for app installation, session-token authentication, App Bridge, and Polaris web components.

## Included

- Operations overview with due, upcoming, active, and delivered totals
- Shipment search by email, status, and date range
- SPX entry creation and manual shipment status changes
- Subscription search and cancellation
- Server-only proxy to the existing Express API
- Shopify product-page theme app block for selecting prepaid plans

## Architecture

```text
Shopify Admin -> authenticated React Router app -> Express subscription API -> Supabase
Shopify product page -> theme app block -> Shopify cart and checkout
```

The browser never receives `SUBSCRIPTION_API_KEY`. Each app loader/action authenticates the Shopify admin session before the app server calls Express with `X-Dashboard-Key`.

## Local setup

Requirements: Node.js 20.19+ or 22.12+ and a Shopify Partner app/development store. The npm scripts download Shopify CLI automatically when needed.

1. Copy `.env.example` to `.env` and fill in the Shopify credentials.
2. Set the same long random value in frontend `SUBSCRIPTION_API_KEY` and backend `DASHBOARD_API_KEY`.
3. Install and prepare the app:

```powershell
npm install
npm run setup
```

4. Link the local project to the Shopify app and start development:

```powershell
npm run config:link
npm run dev
```

5. In Shopify's theme editor, open the subscription product template, add the **Subscription plans** app block, and save.

## Environment

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_KEY` | Shopify app client ID |
| `SHOPIFY_API_SECRET` | Shopify app client secret |
| `SHOPIFY_APP_URL` | Public URL of this frontend service |
| `SCOPES` | Shopify scopes; currently `read_products` |
| `SUBSCRIPTION_API_URL` | Existing Express backend base URL |
| `SUBSCRIPTION_API_KEY` | Private shared key sent from this server to Express |

The backend must define `DASHBOARD_API_KEY` with the exact same value before its `/api` routes become available.

## Verification

```powershell
npm run typecheck
npm run build
```

Because the parent workspace includes an ampersand (`B&B`), project scripts invoke local Node entry points directly instead of relying on Windows npm command shims.

## Deployment

Deploy this folder as a Node web service. Run `npm run setup` during release, build with `npm run build`, and start with `npm run start`. Use persistent PostgreSQL-backed Shopify session storage before running multiple frontend instances; the included SQLite storage is suitable for local development and a single persistent instance.
