# B&B BEAU+ subscription frontend

This folder contains the Shopify embedded admin app and theme extension. Read
`README.md` before changing behavior or deployment settings.

## Platform guidance

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for
Shopify API and platform work. If it is unavailable, follow Shopify's official
documentation; do not add agent tooling as a project dependency.

## Project boundaries

- Keep Shopify credentials, access tokens, and `SUBSCRIPTION_API_KEY` on the
  server. Never expose them through loaders, browser JavaScript, logs, or Git.
- Browser routes must call the Express backend through `app/lib/backend.server.ts`.
  Do not call the backend directly from client-side components.
- Authenticate every embedded-admin loader and action before returning store
  data or performing a mutation.
- Keep the app compatible with the existing React Router, App Bridge, and
  Shopify Polaris web-component setup.
- Do not implement direct SellerCraft/Anchanto API calls without a confirmed API
  contract. Shopify orders are currently synchronized by SellerCraft's Shopify
  integration.
- SPX booking remains a separate fulfillment step. Do not treat a SellerCraft
  or Anchanto response as an SPX AWB.
- Direct SPX calls belong only in the Express backend. The frontend may trigger
  batch creation/result polling and display safe status fields, but must never
  receive SPX app or user secrets.
- In the current managed Ninja Van flow, `OMS_MODE=manual` means an operator may
  confirm packed only after Ninja Van confirms it and may mark the AWB shared
  only after actually sending the generated PDF to the warehouse.
- Google Drive and Sheets AWB synchronization belongs in the Express backend.
  The frontend may display its safe status and stable Drive link, but must not
  receive service-account credentials or assume a Sheet row means the AWB was
  printed.

## Subscription workflow

- The original paid Shopify checkout is delivery shipment 1 and is the order
  SellerCraft should synchronize to Anchanto WMS.
- Only future deliveries (shipment 2 and later) should create tagged, zero-value
  Shopify delivery orders. Preserve the deterministic shipment tag used for
  retry protection.
- Orders tagged `bb_subscription_delivery` are generated child deliveries and
  must not create new subscriptions.
- Shopify variant titles determine whether a product is a prepaid plan. Keep UI
  assumptions aligned with the backend's subscription-plan parser.

## Commands and verification

Use Node.js `>=20.19 <22` or `>=22.12`.

```powershell
npm install
npm run typecheck
npm run lint
npm run build
```

For local Shopify development, use `npm run dev`. Deploy Shopify app
configuration with:

```powershell
npm run deploy -- --config bb-subscription-dashboard
```

Run type checking and a production build after meaningful code changes. Do not
deploy or push unless the user asks.

## Editing rules

- Preserve unrelated user changes in a dirty worktree.
- Update `README.md` and `.env.example` when setup, scopes, environment
  variables, or operational behavior changes.
- Add defensive handling for missing API fields before rendering values; do not
  call string methods such as `replaceAll` on possibly undefined data.
- Never commit `.env`, Shopify tokens, client secrets, or customer information.
