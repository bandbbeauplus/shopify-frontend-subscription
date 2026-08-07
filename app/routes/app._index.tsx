import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { backendRequest } from "../lib/backend.server";
import type { Shipment, Subscription } from "../lib/types";
import {
  EmptyState,
  formatDate,
  Metric,
  StatusBadge,
} from "../components/AdminUi";
import styles from "../styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const [shipments, subscriptions] = await Promise.all([
    backendRequest<Shipment[]>("/api/shipments"),
    backendRequest<Subscription[]>("/api/subscriptions"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const due = shipments.filter(
    (item) => item.shipment_status === "pending" && item.scheduled_ship_date <= today,
  );
  const nextSevenDays = new Date();
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);
  const cutoff = nextSevenDays.toISOString().slice(0, 10);

  return {
    due: due.slice(0, 6),
    metrics: {
      due: due.length,
      upcoming: shipments.filter(
        (item) =>
          item.shipment_status === "pending" &&
          item.scheduled_ship_date > today &&
          item.scheduled_ship_date <= cutoff,
      ).length,
      active: subscriptions.filter((item) => item.subscription_status === "active").length,
      delivered: shipments.filter((item) => item.shipment_status === "delivered").length,
    },
  };
};

export default function Dashboard() {
  const { due, metrics } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Subscription operations">
      <s-button slot="primary-action" href="/app/shipments">
        Manage shipments
      </s-button>

      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>B&amp;B BEAU+ / DAILY DESK</span>
          <h2>Monthly care, shipped on time.</h2>
          <p>Today’s fulfillment queue and subscription health in one place.</p>
        </div>
        <div className={styles.heroDate}>
          <span>Today</span>
          <strong>{new Intl.DateTimeFormat("en-PH", { day: "2-digit" }).format(new Date())}</strong>
          <small>{new Intl.DateTimeFormat("en-PH", { month: "long" }).format(new Date())}</small>
        </div>
      </div>

      <div className={styles.metrics}>
        <Metric label="Due now" value={metrics.due} detail="Pending fulfillment" tone="warm" />
        <Metric label="Next 7 days" value={metrics.upcoming} detail="Plan the packing queue" />
        <Metric label="Active plans" value={metrics.active} detail="Prepaid subscribers" tone="green" />
        <Metric label="Delivered" value={metrics.delivered} detail="All-time shipments" />
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>ACTION QUEUE</span>
            <h2>Shipments due now</h2>
          </div>
          <Link className={styles.textLink} to="/app/shipments?status=pending">View all shipments</Link>
        </div>

        {due.length === 0 ? (
          <EmptyState title="The packing queue is clear">No pending shipments are overdue or scheduled for today.</EmptyState>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Customer</th><th>Delivery</th><th>Due date</th><th>Status</th></tr></thead>
              <tbody>
                {due.map((shipment) => (
                  <tr key={shipment.id}>
                    <td><strong>{shipment.customer_name}</strong><small>{shipment.customer_email}</small></td>
                    <td>{shipment.shipment_number} of {shipment.total_shipments}<small>{shipment.product_name}</small></td>
                    <td>{formatDate(shipment.scheduled_ship_date)}</td>
                    <td><StatusBadge status={shipment.shipment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
