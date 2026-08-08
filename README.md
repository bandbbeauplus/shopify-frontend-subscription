# B&B BEAU+ Subscription Admin

Shopify embedded React app for operating the prepaid B&B BEAU+ subscription program. It uses Shopify's React Router app framework for app installation, session-token authentication, App Bridge, and Polaris web components.

## Current status

This is an internal MVP. The Shopify admin flow, order webhook pipeline, database schedule generation, and manual fulfillment dashboard are implemented. SPX shipment creation and SMS delivery still depend on placeholder integrations and must be verified before production use.

The current setup is intended for one store. The backend uses a shared API key and does not yet scope records by Shopify shop.

## Included

- Operations overview with due, upcoming, active, and delivered totals
- Shipment search by email, status, and date range
- Bulk SPX CSV download for pending shipments due today
- SPX entry creation attempt and manual shipment status changes
- Subscription search and cancellation
- Server-only proxy to the existing Express API
- Shopify product-page theme app block for selecting prepaid plans

## Architecture

```text
Shopify Admin -> authenticated React Router app -> Express subscription API -> PostgreSQL/Supabase
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

## Operational limitations

- The dashboard currently retrieves complete shipment and subscription lists; pagination and database-side summary queries are not implemented.
- Shipment creation is not fully idempotent under concurrent requests. Avoid double-clicking fulfillment actions until a database lock or idempotency key is added.
- Manual status changes do not automatically update every related shipment field, such as `actual_ship_date` or `spx_entry_created`.
- The backend currently recognizes plans by parsing variant titles. Keep plan titles in the expected `1`, `3`, `6`, or `12` month format until variant metadata or IDs are used instead.
- The order webhook should be configured to receive only valid paid orders; payment-status validation is not yet enforced by the backend.
- Automated tests are not currently included.
- The SPX CSV download is a neutral draft format and must be matched to SPX's current upload template before live use.

## Verification

```powershell
npm run typecheck
npm run build
```

Because the parent workspace includes an ampersand (`B&B`), project scripts invoke local Node entry points directly instead of relying on Windows npm command shims.

## Deployment

Deploy this folder as a Node web service. Run `npm run setup` during release, build with `npm run build`, and start with `npm run start`. Use persistent PostgreSQL-backed Shopify session storage before running multiple frontend instances; the included SQLite storage is suitable for local development and a single persistent instance.

Before production deployment:

1. Confirm the real SPX API contract, authentication, request fields, tracking response, retry behavior, and idempotency support. The current backend SPX call is only a placeholder.
2. Confirm SMS provider credentials and delivery behavior.
3. Use strong, separate secrets for Shopify and the dashboard-to-backend connection.
4. Decide whether the app is single-store or multi-store. Multi-store operation requires shop-aware data isolation in the backend.
5. Add pagination, status-transition validation, webhook payment validation, and automated tests.
