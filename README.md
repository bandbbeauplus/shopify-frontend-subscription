# B&B BEAU+ Subscription Admin

Shopify embedded React app for operating B&B BEAU+ ordinary-order fulfillment
and prepaid subscription deliveries. It uses Shopify's React Router app
framework for app installation, session-token authentication, App Bridge, and
Polaris web components.

## Current status

This is an internal MVP. The Shopify admin flow, strict prepaid-plan detection,
calendar-month schedule generation, SellerCraft/Anchanto preparation workflow,
SPX OpenAPI UAT booking, tracking, AWB generation, Excel reconciliation, and
the manual fulfillment dashboard are implemented. A complete standalone SPX
UAT order successfully reached the AWB PDF stage. SellerCraft/Anchanto order
and cancellation synchronization have also been tested.

Google Drive and Sheet synchronization is implemented but still needs the
client's Google service-account and destination configuration plus one live UAT
verification. SPX production pickup still requires live credentials,
confirmation of the Cabuyao warehouse address hierarchy, and API 1.1 timeslot
selection. Customer SMS is disabled because Shopify handles notifications.

The current setup is intended for one store. The backend uses a shared API key and does not yet scope records by Shopify shop.

## Included

- Operations overview with due, upcoming, active, and delivered totals
- Shipment search by email, status, and date range
- Bulk SPX Excel-template download for pending shipments due today
- SPX tracking confirmation after a mass-order Excel import
- Signed SPX API batch creation, tracking-result polling, and AWB retrieval
- Live SPX tracking status received through the signed backend webhook and
  displayed beside the tracking number
- Permanent SPX pickup, delivery, return, and handling proof links displayed
  only in the authenticated shipment dashboard
- Automatic SPX AWB archival in Google Drive and monitoring-row upsert in
  Google Sheets when the backend integration is configured
- UAT-only approved address substitution that excludes real customer addresses
- Optional Shopify fulfillment creation with SPX tracking
- Retryable **Fulfill in Shopify** action for tracked, ready-to-ship shipments
- Manual shipment status changes and SPX tracking links
- Separate ordinary-order and subscription-delivery queues with physical box
  count and calculated parcel weight
- Subscription search and cancellation
- Shipment 1 links the original Shopify checkout so SellerCraft does not receive
  a duplicate order
- Shipment 2 onward creates tagged, zero-value Shopify delivery orders for
  SellerCraft to import into Anchanto WMS
- Server-only proxy to the existing Express API
- Shopify product-page theme app block for selecting prepaid plans

## Architecture

```text
Shopify product page -> theme app block -> Shopify cart and checkout
Shopify order webhook -> Express subscription API -> PostgreSQL/Supabase
Shopify orders -> SellerCraft OMS -> Anchanto WMS -> packed confirmation
Packed parcel -> SPX booking/AWB -> warehouse printing and pickup preparation
SPX AWB -> private Google Drive copy -> Ninja Van monitoring Sheet
Shopify Admin -> authenticated React Router app -> Express subscription API
```

The browser never receives `SUBSCRIPTION_API_KEY`. Each app loader/action authenticates the Shopify admin session before the app server calls Express with `X-Dashboard-Key`.

## Local setup

Requirements: Node.js 20.19+ or 22.12+ and a Shopify Partner app/development store. The npm scripts download Shopify CLI automatically when needed.

1. Create a local `.env` using the variables in the Environment table below
   and fill in the Shopify credentials.
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
| `SCOPES` | Shopify scopes; use `read_products,read_orders,write_orders,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders` |
| `SUBSCRIPTION_API_URL` | Existing Express backend base URL |
| `SUBSCRIPTION_API_KEY` | Private shared key sent from this server to Express |

The backend must define `DASHBOARD_API_KEY` with the exact same value before its `/api` routes become available.

## Operational limitations

- The dashboard currently retrieves complete shipment and subscription lists; pagination and database-side summary queries are not implemented.
- Prepaid delivery-order retries search Shopify by a deterministic shipment tag before creating anything. Concurrent requests can still race, so avoid triggering the same release from multiple browser tabs.
- A tracking number confirms label/order creation and initially sets `ready_to_ship`. Only explicitly creating the Shopify fulfillment changes the internal status to `shipped`.
- Multi-month subscriptions are represented by one Shopify line item and several
  internal shipments. Shipment 1 uses the checkout order; later shipments use
  tagged, zero-value child orders. The dashboard only offers final Shopify
  fulfillment at the appropriate point in the schedule.
- The backend recognizes a plan only when `variant_title` starts with
  `1-Month Plan`, `3-Month Plan`, `6-Month Plan`, or `12-Month Plan` (hyphen,
  en dash, and em dash are accepted). Variants such as `7 Sachets`,
  `14 Sachets`, and `28 Sachets` are ordinary purchases and do not create plans.
- Ordinary products create one-time fulfillment rows and receive the same
  packed, SPX booking, AWB, and Google monitoring controls as prepaid
  deliveries.
- SKU values are required for reliable SellerCraft/Anchanto product mapping and
  child-order variant resolution, but plan detection does not depend on SKU.
- SellerCraft/Anchanto connection setup and test SKU mapping are handled with
  the Ninja Van team. Do not place a test order until they confirm the selected
  SKU is synchronized and mapped.
- The order webhook should be configured to receive only valid paid orders; payment-status validation is not yet enforced by the backend.
- Automated backend coverage includes SPX signing, UAT address isolation,
  asynchronous result mapping, workbook generation, plan detection, and OMS
  mapping; route-level integration tests are still needed.
- SPX downloads use the official Philippines mass-order `.xlsx` template. Confirm the configured parcel weight, dimensions, item type, and payment method before live use.
- Google AWB synchronization is performed only by the Express backend. The
  embedded app displays the stable Drive link and retry status but never
  receives Google service-account credentials.

## Verification

```powershell
npm run typecheck
npm run lint
npm run build
```

Because the parent workspace includes an ampersand (`B&B`), project scripts invoke local Node entry points directly instead of relying on Windows npm command shims.

## Deployment

Deploy this folder as a Node web service. Run `npm run setup` during release, build with `npm run build`, and start with `npm run start`. Use persistent PostgreSQL-backed Shopify session storage before running multiple frontend instances; the included SQLite storage is suitable for local development and a single persistent instance.

Deploy Shopify configuration and extensions with
`npm run deploy -- --config bb-subscription-dashboard`. The hosted Render
service must also contain the matching environment variables and latest Git
revision.

Before production deployment:

1. Obtain and configure SPX production credentials and the production base URL.
2. Confirm SPX's address hierarchy for the supplied Ninja Van Cabuyao warehouse
   and implement SPX API 1.1 pickup timeslot selection. Keep Excel export as a fallback.
3. Configure the client's Google service account, Drive folder, and monitoring
   Sheet, then verify one complete UAT upload from the dashboard.
4. Measure and configure final packed-parcel dimensions.
5. Use strong, separate secrets for Shopify and the dashboard-to-backend connection.
6. Decide whether the app is single-store or multi-store. Multi-store operation requires shop-aware data isolation in the backend.
7. Add pagination, status-transition validation, webhook payment handling, and automated tests.
