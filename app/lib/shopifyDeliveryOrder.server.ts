import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Shipment, ShippingAddress } from "./types";

type ShopifyOrder = {
  id: string;
  name: string;
  lineItems?: {
    nodes?: Array<{
      title: string;
      sku: string | null;
      variant: { id: string } | null;
    }>;
  };
};

type ShopifyVariant = {
  id: string;
  sku: string | null;
};

function numericId(gid: string, resource: string) {
  const match = gid.match(new RegExp(`^gid://shopify/${resource}/(\\d+)$`));
  if (!match) throw new Error(`Shopify returned an invalid ${resource} ID`);
  return match[1];
}

function shipmentTag(shipmentId: number) {
  return `bb_shipment_${shipmentId}`;
}

function userErrorMessage(errors: Array<{ message: string }> | undefined, fallback: string) {
  return errors?.map((error) => error.message).filter(Boolean).join("; ") || fallback;
}

function throwGraphqlErrors(json: unknown) {
  const errors = (json as { errors?: Array<{ message: string }> } | null)?.errors;
  if (errors?.length) {
    throw new Error(userErrorMessage(errors, "Shopify GraphQL request failed"));
  }
}

async function findGeneratedOrder(admin: AdminApiContext, shipmentId: number) {
  const response = await admin.graphql(
    `#graphql
      query ExistingSubscriptionDelivery($query: String!) {
        orders(first: 1, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
          }
        }
      }`,
    { variables: { query: `tag:${shipmentTag(shipmentId)}` } },
  );
  const json = await response.json();
  throwGraphqlErrors(json);
  return (json.data?.orders?.nodes?.[0] || null) as ShopifyOrder | null;
}

async function getOriginalOrder(admin: AdminApiContext, orderId: string) {
  if (!/^\d+$/.test(orderId)) throw new Error("Shipment has an invalid original Shopify order ID");
  const response = await admin.graphql(
    `#graphql
      query OriginalSubscriptionOrder($id: ID!) {
        order(id: $id) {
          id
          name
          lineItems(first: 50) {
            nodes {
              title
              sku
              variant { id }
            }
          }
        }
      }`,
    { variables: { id: `gid://shopify/Order/${orderId}` } },
  );
  const json = await response.json();
  throwGraphqlErrors(json);
  return (json.data?.order || null) as ShopifyOrder | null;
}

async function resolveVariantId(
  admin: AdminApiContext,
  shipment: Shipment,
  originalOrder: ShopifyOrder | null,
) {
  if (shipment.product_variant_id && /^\d+$/.test(shipment.product_variant_id)) {
    return `gid://shopify/ProductVariant/${shipment.product_variant_id}`;
  }

  const lineItems = originalOrder?.lineItems?.nodes || [];
  const originalLine = lineItems.find((item) => (
    (shipment.product_sku && item.sku === shipment.product_sku)
    || item.title === shipment.product_name
  ));
  if (originalLine?.variant?.id) return originalLine.variant.id;

  if (shipment.product_sku) {
    const response = await admin.graphql(
      `#graphql
        query SubscriptionVariantBySku($query: String!) {
          productVariants(first: 10, query: $query) {
            nodes { id sku }
          }
        }`,
      { variables: { query: `sku:${JSON.stringify(shipment.product_sku)}` } },
    );
    const json = await response.json();
    throwGraphqlErrors(json);
    const variants = (json.data?.productVariants?.nodes || []) as ShopifyVariant[];
    const exactVariant = variants.find((variant) => variant.sku === shipment.product_sku);
    if (exactVariant) return exactVariant.id;
  }

  throw new Error("The Shopify product variant could not be resolved. Add a unique SKU to this plan variant.");
}

function compactAddress(address: ShippingAddress | null, fallbackName: string, fallbackPhone: string | null) {
  if (!address?.address1) return undefined;
  const nameParts = fallbackName.trim().split(/\s+/);
  const firstName = address.first_name || nameParts.shift() || undefined;
  const lastName = address.last_name || nameParts.join(" ") || undefined;
  const value = {
    firstName,
    lastName,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    provinceCode: address.province_code,
    zip: address.zip,
    countryCode: address.country_code,
    phone: address.phone || fallbackPhone || undefined,
  };
  return Object.fromEntries(Object.entries(value).filter(([, item]) => Boolean(item)));
}

export async function createPrepaidDeliveryOrder(admin: AdminApiContext, shipment: Shipment) {
  const originalOrder = await getOriginalOrder(admin, shipment.order_id);

  // Shipment one is already a real Shopify checkout order, which SellerCraft
  // imports through its normal Shopify connector. Do not create a duplicate.
  if (shipment.shipment_number === 1) {
    if (!originalOrder) throw new Error("The original Shopify checkout order could not be found");
    return {
      orderId: numericId(originalOrder.id, "Order"),
      orderName: originalOrder.name,
      variantId: numericId(await resolveVariantId(admin, shipment, originalOrder), "ProductVariant"),
      created: false,
    };
  }

  const existingOrder = await findGeneratedOrder(admin, shipment.id);
  if (existingOrder) {
    return {
      orderId: numericId(existingOrder.id, "Order"),
      orderName: existingOrder.name,
      variantId: shipment.product_variant_id,
      created: false,
    };
  }

  const variantGid = await resolveVariantId(admin, shipment, originalOrder);
  const customerId = shipment.customer_id && /^\d+$/.test(shipment.customer_id)
    ? `gid://shopify/Customer/${shipment.customer_id}`
    : null;
  const order = {
    currency: "PHP",
    financialStatus: "PAID",
    email: shipment.customer_email || undefined,
    customer: customerId ? { toAssociate: { id: customerId } } : undefined,
    shippingAddress: compactAddress(shipment.shipping_address, shipment.customer_name, shipment.customer_phone),
    lineItems: [{
      variantId: variantGid,
      quantity: Math.max(1, Number(shipment.product_quantity) || 1),
      priceSet: { shopMoney: { amount: 0, currencyCode: "PHP" } },
    }],
    tags: [
      "bb_subscription_delivery",
      shipmentTag(shipment.id),
      `bb_original_order_${shipment.order_id}`,
    ],
    note: `Prepaid delivery ${shipment.shipment_number} of ${shipment.total_shipments}; original order ${shipment.order_id}. No additional customer charge.`,
  };

  const response = await admin.graphql(
    `#graphql
      mutation CreatePrepaidDeliveryOrder($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) {
          order { id name }
          userErrors { field message }
        }
      }`,
    { variables: { order } },
  );
  const json = await response.json();
  throwGraphqlErrors(json);
  const payload = json.data?.orderCreate;
  if (!payload?.order || payload.userErrors?.length) {
    throw new Error(userErrorMessage(payload?.userErrors, "Shopify rejected the prepaid delivery order"));
  }

  return {
    orderId: numericId(payload.order.id, "Order"),
    orderName: payload.order.name as string,
    variantId: numericId(variantGid, "ProductVariant"),
    created: true,
  };
}
