import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

type UserError = { field?: string[] | null; message: string };

function userErrorMessage(errors: UserError[] | undefined) {
  return errors?.map((error) => error.message).filter(Boolean).join("; ") || "Shopify rejected the fulfillment";
}

export async function createShopifyFulfillment(
  admin: AdminApiContext,
  numericOrderId: string,
  trackingNumber: string,
) {
  if (!/^\d+$/.test(numericOrderId)) throw new Error("Shipment has an invalid Shopify order ID");
  const orderId = `gid://shopify/Order/${numericOrderId}`;

  const orderResponse = await admin.graphql(
    `#graphql
      query FulfillmentOrdersForSpx($orderId: ID!) {
        order(id: $orderId) {
          id
          fulfillmentOrders(first: 50) {
            nodes {
              id
              status
            }
          }
        }
      }`,
    { variables: { orderId } },
  );
  const orderJson = await orderResponse.json();
  const fulfillmentOrders = orderJson.data?.order?.fulfillmentOrders?.nodes || [];
  const openOrders = fulfillmentOrders.filter((order: { status: string }) => order.status === "OPEN");

  if (!orderJson.data?.order) throw new Error("Shopify order was not found or is outside the app's order access window");
  if (!openOrders.length) throw new Error("Shopify has no open fulfillment order; it may already be fulfilled or on hold");

  const mutationResponse = await admin.graphql(
    `#graphql
      mutation CreateSpxFulfillment($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        fulfillment: {
          lineItemsByFulfillmentOrder: openOrders.map((order: { id: string }) => ({
            fulfillmentOrderId: order.id,
          })),
          notifyCustomer: true,
          trackingInfo: {
            company: "SPX Express",
            number: trackingNumber,
            url: "https://spx.ph/track",
          },
        },
      },
    },
  );
  const mutationJson = await mutationResponse.json();
  const payload = mutationJson.data?.fulfillmentCreate;
  if (!payload?.fulfillment || payload.userErrors?.length) {
    throw new Error(userErrorMessage(payload?.userErrors));
  }

  return payload.fulfillment as { id: string; status: string };
}
