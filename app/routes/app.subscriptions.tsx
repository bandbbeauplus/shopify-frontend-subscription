import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { backendRequest } from "../lib/backend.server";
import type { Subscription, SubscriptionStatus } from "../lib/types";
import { EmptyState, formatDate, formatMoney, StatusBadge } from "../components/AdminUi";
import styles from "../styles/admin.module.css";

const statuses: SubscriptionStatus[] = ["active", "paused", "cancelled", "completed"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  const status = incoming.searchParams.get("status");
  const email = incoming.searchParams.get("email");
  if (status) query.set("status", status);
  if (email) query.set("email", email);
  return { subscriptions: await backendRequest<Subscription[]>(`/api/subscriptions${query.size ? `?${query}` : ""}`) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id < 1) throw new Response("Invalid subscription ID", { status: 400 });
  await backendRequest(`/api/subscriptions/${id}/cancel`, { method: "PATCH" });
  return { ok: true, message: "Subscription cancelled and pending shipments stopped" };
};

function CancelButton({ subscription }: { subscription: Subscription }) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  useEffect(() => { if (fetcher.data?.message) shopify.toast.show(fetcher.data.message); }, [fetcher.data, shopify]);
  if (subscription.subscription_status !== "active") return <span>—</span>;
  return <fetcher.Form method="post" onSubmit={(event) => { if (!confirm("Cancel this plan and all pending shipments?")) event.preventDefault(); }}>
    <input name="id" type="hidden" value={subscription.id} />
    <button className={styles.buttonDanger} disabled={fetcher.state !== "idle"} type="submit">Cancel plan</button>
  </fetcher.Form>;
}

export default function SubscriptionsPage() {
  const { subscriptions } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  return <s-page heading="Subscriptions">
    <Form className={styles.toolbar} method="get">
      <label className={styles.field}>Customer email<input name="email" placeholder="Search email" type="search" /></label>
      <label className={styles.field}>Status<select defaultValue="" name="status"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      <button className={styles.button} disabled={navigation.state !== "idle"} type="submit">Apply filters</button>
    </Form>
    <p className={styles.summary}>{subscriptions.length} plan{subscriptions.length === 1 ? "" : "s"} found</p>
    <section className={styles.panel}>
      {subscriptions.length === 0 ? <EmptyState title="No subscriptions found">New prepaid plans will appear here after Shopify checkout.</EmptyState> : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Order</th><th>Customer</th><th>Plan</th><th>Paid</th><th>Coverage</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{subscriptions.map((subscription) => <tr key={subscription.id}>
          <td><strong>{subscription.order_name || subscription.order_id}</strong></td>
          <td><strong>{subscription.customer_email}</strong><small>{subscription.customer_phone || "No phone"}</small></td>
          <td><strong>{subscription.plan_months} months</strong><small>{subscription.product_name}</small></td>
          <td>{formatMoney(subscription.total_price_paid)}</td>
          <td>{formatDate(subscription.subscription_start_date)}<small>to {formatDate(subscription.subscription_end_date)}</small></td>
          <td><StatusBadge status={subscription.subscription_status} /></td>
          <td><CancelButton subscription={subscription} /></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </s-page>;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
