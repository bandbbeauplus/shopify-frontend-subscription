import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { backendRequest } from "../lib/backend.server";
import type { Shipment, ShipmentStatus } from "../lib/types";
import { EmptyState, formatDate, StatusBadge } from "../components/AdminUi";
import styles from "../styles/admin.module.css";

const statuses: ShipmentStatus[] = ["pending", "ready_to_ship", "shipped", "delivered", "failed", "cancelled"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ["status", "from", "to", "customer_email"]) {
    const value = incoming.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return { shipments: await backendRequest<Shipment[]>(`/api/shipments${suffix}`) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const intent = String(form.get("intent") || "");
  if (!Number.isInteger(id) || id < 1) throw new Response("Invalid shipment ID", { status: 400 });

  if (intent === "create_spx") {
    const result = await backendRequest<{ tracking_number: string }>(`/api/shipments/${id}/create-spx`, { method: "POST" });
    return { ok: true, message: `SPX entry created: ${result.tracking_number}` };
  }
  if (intent === "update_status") {
    const status = String(form.get("status"));
    if (!statuses.includes(status as ShipmentStatus)) throw new Response("Invalid status", { status: 400 });
    await backendRequest(`/api/shipments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    return { ok: true, message: `Shipment marked ${status.replaceAll("_", " ")}` };
  }
  throw new Response("Unknown action", { status: 400 });
};

function ShipmentActions({ shipment }: { shipment: Shipment }) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  if (shipment.shipment_status === "pending" && !shipment.spx_tracking_number) {
    return (
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={shipment.id} />
        <input type="hidden" name="intent" value="create_spx" />
        <button className={styles.button} disabled={busy} type="submit">Create SPX</button>
      </fetcher.Form>
    );
  }
  return (
    <fetcher.Form className={styles.tableActions} method="post">
      <input type="hidden" name="id" value={shipment.id} />
      <input type="hidden" name="intent" value="update_status" />
      <select aria-label={`Status for shipment ${shipment.id}`} defaultValue={shipment.shipment_status} name="status">
        {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
      </select>
      <button className={styles.buttonSecondary} disabled={busy} type="submit">Save</button>
    </fetcher.Form>
  );
}

export default function ShipmentsPage() {
  const { shipments } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const dueForExport = shipments.some(
    (shipment) => shipment.shipment_status === "pending" && shipment.scheduled_ship_date <= new Date().toISOString().slice(0, 10),
  );
  return (
    <s-page heading="Shipments">
      {dueForExport ? <s-button slot="primary-action" href="/app/shipments/spx-csv">
        Download SPX CSV
      </s-button> : null}
      <Form className={styles.toolbar} method="get">
        <label className={styles.field}>Customer email<input name="customer_email" placeholder="Search email" type="search" /></label>
        <label className={styles.field}>Status<select defaultValue="" name="status"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <label className={styles.field}>From<input name="from" type="date" /></label>
        <label className={styles.field}>To<input name="to" type="date" /></label>
        <button className={styles.button} disabled={navigation.state !== "idle"} type="submit">Apply filters</button>
      </Form>
      <p className={styles.summary}>{shipments.length} shipment{shipments.length === 1 ? "" : "s"} found</p>
      <section className={styles.panel}>
        {shipments.length === 0 ? <EmptyState title="No shipments found">Adjust the filters or wait for the next Shopify order.</EmptyState> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Customer</th><th>Shipment</th><th>Scheduled</th><th>Tracking</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{shipments.map((shipment) => <tr key={shipment.id}>
              <td><strong>{shipment.customer_name}</strong><small>{shipment.customer_email}</small></td>
              <td><strong>{shipment.shipment_number} of {shipment.total_shipments}</strong><small>{shipment.product_name}</small></td>
              <td>{formatDate(shipment.scheduled_ship_date)}</td>
              <td>{shipment.spx_tracking_number || "Not created"}</td>
              <td><StatusBadge status={shipment.shipment_status} /></td>
              <td><ShipmentActions shipment={shipment} /></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
