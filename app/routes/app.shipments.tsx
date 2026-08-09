import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { backendBinaryRequest, backendRequest } from "../lib/backend.server";
import { createShopifyFulfillment } from "../lib/shopifyFulfillment.server";
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
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "download_spx_bulk") {
    const result = await backendBinaryRequest("/api/shipments/spx-xlsx");
    const disposition = result.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "spx-shipments.xlsx";
    return { ok: true, workbook: result.base64, filename };
  }

  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id < 1) throw new Response("Invalid shipment ID", { status: 400 });

  if (intent === "download_spx_xlsx") {
    const result = await backendBinaryRequest(`/api/shipments/${id}/spx-xlsx`);
    const disposition = result.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `spx-shipment-${id}.xlsx`;
    return { ok: true, workbook: result.base64, filename };
  }

  if (intent === "confirm_spx") {
    const trackingNumber = String(form.get("tracking_number") || "").trim();
    if (!/^[A-Za-z0-9-]{4,50}$/.test(trackingNumber)) {
      throw new Response("Enter a valid SPX tracking number", { status: 400 });
    }
    const markShopifyFulfilled = form.get("mark_shopify_fulfilled") === "yes";

    await backendRequest(`/api/shipments/${id}/confirm-spx`, {
      method: "POST",
      body: JSON.stringify({ tracking_number: trackingNumber, status: "ready_to_ship" }),
    });

    if (markShopifyFulfilled) {
      const orderId = String(form.get("order_id") || "");
      try {
        await createShopifyFulfillment(admin, orderId, trackingNumber);
        await backendRequest(`/api/shipments/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "shipped" }),
        });
        return { ok: true, message: "SPX tracking saved and Shopify order marked fulfilled" };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown Shopify error";
        return { ok: false, message: `SPX tracking saved as ready to ship, but Shopify was not fulfilled: ${detail}` };
      }
    }

    return { ok: true, message: "SPX tracking saved as ready to ship" };
  }

  if (intent === "fulfill_shopify") {
    const trackingNumber = String(form.get("tracking_number") || "").trim();
    const orderId = String(form.get("order_id") || "");
    if (!/^[A-Za-z0-9-]{4,50}$/.test(trackingNumber)) {
      throw new Response("Shipment has no valid SPX tracking number", { status: 400 });
    }

    try {
      await createShopifyFulfillment(admin, orderId, trackingNumber);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Shopify error";
      return { ok: false, message: `Shopify was not fulfilled: ${detail}` };
    }

    try {
      await backendRequest(`/api/shipments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "shipped" }),
      });
    } catch {
      return { ok: false, message: "Shopify is fulfilled, but the internal shipment status could not be updated" };
    }

    return { ok: true, message: "Shopify order marked fulfilled with SPX tracking" };
  }

  if (intent === "update_status") {
    const status = String(form.get("status"));
    if (!statuses.includes(status as ShipmentStatus)) throw new Response("Invalid status", { status: 400 });
    await backendRequest(`/api/shipments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    return { ok: true, message: `Shipment marked ${status.replaceAll("_", " ")}` };
  }
  throw new Response("Unknown action", { status: 400 });
};

function XlsxDownloadButton({ id, label }: { id?: number; label: string }) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    const data = fetcher.data;
    if (!data || !("workbook" in data) || !data.workbook) return;

    const binary = atob(data.workbook);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    shopify.toast.show("SPX Excel file downloaded");
  }, [fetcher.data, shopify]);

  return (
    <fetcher.Form method="post">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="intent" value={id ? "download_spx_xlsx" : "download_spx_bulk"} />
      <button className={styles.button} disabled={busy} type="submit">
        {busy ? "Preparing Excel..." : label}
      </button>
    </fetcher.Form>
  );
}

function ShipmentActions({ shipment }: { shipment: Shipment }) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  if (shipment.shipment_status === "pending" && !shipment.spx_tracking_number) {
    return <div className={styles.confirmStack}>
      <XlsxDownloadButton id={shipment.id} label="Download SPX Excel" />
      <fetcher.Form className={styles.confirmForm} method="post">
        <input type="hidden" name="id" value={shipment.id} />
        <input type="hidden" name="order_id" value={shipment.order_id} />
        <input type="hidden" name="intent" value="confirm_spx" />
        <input aria-label={`SPX tracking for shipment ${shipment.id}`} name="tracking_number" placeholder="SPX tracking number" required />
        <label className={styles.checkField}>
          <input defaultChecked={shipment.total_shipments === 1} name="mark_shopify_fulfilled" type="checkbox" value="yes" />
          Mark Shopify fulfilled
        </label>
        {shipment.total_shipments > 1 ? <small>Only check when this Shopify line should be fully fulfilled.</small> : null}
        <button className={styles.buttonSecondary} disabled={busy} type="submit">Confirm SPX order</button>
      </fetcher.Form>
    </div>;
  }
  return <div className={styles.confirmStack}>
    {shipment.shipment_status === "ready_to_ship" && shipment.spx_tracking_number ? (
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={shipment.id} />
        <input type="hidden" name="order_id" value={shipment.order_id} />
        <input type="hidden" name="tracking_number" value={shipment.spx_tracking_number} />
        <input type="hidden" name="intent" value="fulfill_shopify" />
        <button className={styles.button} disabled={busy} type="submit">Fulfill in Shopify</button>
      </fetcher.Form>
    ) : null}
    <fetcher.Form className={styles.tableActions} method="post">
        <input type="hidden" name="id" value={shipment.id} />
        <input type="hidden" name="intent" value="update_status" />
        <select aria-label={`Status for shipment ${shipment.id}`} defaultValue={shipment.shipment_status} name="status">
          {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
        </select>
        <button className={styles.buttonSecondary} disabled={busy} type="submit">Save</button>
      </fetcher.Form>
  </div>;
}

export default function ShipmentsPage() {
  const { shipments } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const dueForExport = shipments.some(
    (shipment) => shipment.shipment_status === "pending" && shipment.scheduled_ship_date <= new Date().toISOString().slice(0, 10),
  );
  return (
    <s-page heading="Shipments">
      {dueForExport ? <div className={styles.exportBar}>
        <XlsxDownloadButton label="Download due shipments Excel" />
      </div> : null}
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
              <td>{shipment.spx_tracking_number ? <a className={styles.textLink} href="https://spx.ph/track" rel="noreferrer" target="_blank">{shipment.spx_tracking_number}</a> : "Not created"}</td>
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
