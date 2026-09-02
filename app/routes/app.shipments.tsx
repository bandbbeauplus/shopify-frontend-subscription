import { useEffect, useId, type ReactNode } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, unauthenticated } from "../shopify.server";
import { backendBinaryRequest, backendRequest } from "../lib/backend.server";
import { createShopifyFulfillment } from "../lib/shopifyFulfillment.server";
import { createPrepaidDeliveryOrder } from "../lib/shopifyDeliveryOrder.server";
import type { IntegrationConfig, Shipment, ShipmentStatus } from "../lib/types";
import { EmptyState, formatDate, StatusBadge } from "../components/AdminUi";
import styles from "../styles/admin.module.css";

const statuses: ShipmentStatus[] = ["pending", "ready_to_ship", "shipped", "delivered", "failed", "cancelled"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ["status", "kind", "from", "to", "customer_email"]) {
    const value = incoming.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const [shipments, integration] = await Promise.all([
    backendRequest<Shipment[]>(`/api/shipments${suffix}`),
    backendRequest<IntegrationConfig>("/api/shipments/integration-config"),
  ]);
  return {
    shipments: shipments.map((shipment) => ({
      ...shipment,
      warehouse_status: shipment.warehouse_status || "not_sent",
    })),
    integration,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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

  if (intent === "release_to_oms") {
    const shipment = await backendRequest<Shipment>(`/api/shipments/${id}`);
    const { admin: offlineAdmin } = await unauthenticated.admin(session.shop);
    const deliveryOrder = await createPrepaidDeliveryOrder(offlineAdmin, shipment);
    await backendRequest(`/api/shipments/${id}/link-shopify-delivery-order`, {
      method: "POST",
      body: JSON.stringify({
        shopify_order_id: deliveryOrder.orderId,
        shopify_order_name: deliveryOrder.orderName,
        product_variant_id: deliveryOrder.variantId,
      }),
    });
    const action = deliveryOrder.created ? "created" : "linked";
    return { ok: true, message: `Shopify delivery order ${deliveryOrder.orderName} ${action} for SellerCraft` };
  }

  if (intent === "sync_oms") {
    const result = await backendRequest<{ shipment: Shipment }>(`/api/shipments/${id}/sync-oms`, { method: "POST" });
    const warehouseStatus = result.shipment.warehouse_status || "not_sent";
    return { ok: true, message: `Warehouse status: ${warehouseStatus.replaceAll("_", " ")}` };
  }

  if (intent === "mark_packed") {
    await backendRequest(`/api/shipments/${id}/mark-packed`, { method: "POST" });
    return { ok: true, message: "Packed status confirmed; SPX booking is now available" };
  }

  if (intent === "create_spx_api") {
    const result = await backendRequest<{ shipment: Shipment }>(`/api/shipments/${id}/create-spx`, { method: "POST" });
    const batch = result.shipment.spx_batch_no;
    return { ok: true, message: batch ? `SPX order submitted (batch ${batch})` : "SPX order submission is already processing" };
  }

  if (intent === "sync_spx") {
    const result = await backendRequest<{ success: boolean; shipment: Shipment }>(`/api/shipments/${id}/sync-spx`, { method: "POST" });
    const status = result.shipment.spx_booking_status || "processing";
    const detail = result.shipment.spx_error ? `: ${result.shipment.spx_error}` : "";
    return { ok: result.success, message: `SPX status: ${status.replaceAll("_", " ")}${detail}` };
  }

  if (intent === "sync_awb_google") {
    const result = await backendRequest<{ success: boolean; shipment: Shipment }>(`/api/shipments/${id}/sync-awb-google`, { method: "POST" });
    const detail = result.shipment.google_awb_error ? `: ${result.shipment.google_awb_error}` : "";
    return {
      ok: result.success,
      message: result.success
        ? "AWB uploaded to Google Drive and recorded in the monitoring sheet"
        : `Google AWB sync failed${detail}`,
    };
  }

  if (intent === "send_awb_to_oms") {
    await backendRequest(`/api/shipments/${id}/send-awb-to-oms`, { method: "POST" });
    return { ok: true, message: "SPX AWB sent to the warehouse" };
  }

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
    await backendRequest(`/api/shipments/${id}/confirm-spx`, {
      method: "POST",
      body: JSON.stringify({
        tracking_number: trackingNumber,
        awb_url: String(form.get("awb_url") || "").trim() || null,
        status: "ready_to_ship",
      }),
    });

    return { ok: true, message: "SPX tracking and AWB saved; send them to the warehouse next" };
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

function WorkflowButton({
  id,
  intent,
  label,
  pendingLabel = "Working...",
}: {
  id: number;
  intent: string;
  label: string;
  pendingLabel?: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);
  return <div className={styles.workflowAction}>
    <fetcher.Form method="post">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      <button className={styles.button} disabled={busy} type="submit">
        {busy ? <><span className={styles.spinner} aria-hidden="true" />{pendingLabel}</> : label}
      </button>
    </fetcher.Form>
    <div aria-live="polite">
      {busy ? <small className={styles.progressText}>Please wait. This page will update automatically.</small> : null}
      {!busy && fetcher.data?.message ? <small className={fetcher.data.ok ? styles.successText : styles.dangerText}>{fetcher.data.message}</small> : null}
    </div>
  </div>;
}

function WorkflowStep({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return <div className={styles.workflowCard}>
    <span className={styles.stepLabel}>Step {number} of 3</span>
    <strong>{title}</strong>
    {children}
  </div>;
}

function friendlySpxStatus(status?: string | null) {
  const labels: Record<string, string> = {
    not_created: "Ready to create",
    creating: "Submitting to SPX",
    submitted: "Order submitted; tracking is being generated",
    processing: "SPX is generating the tracking number",
    created: "Tracking is ready; AWB is being generated",
    awb_processing: "SPX is generating the AWB PDF",
    ready: "SPX tracking and AWB are ready",
    failed: "SPX setup needs attention",
  };
  return labels[status || "not_created"] || String(status || "not_created").replaceAll("_", " ");
}

function InfoTooltip({ label, tone = "info" }: { label: string; tone?: "info" | "success" | "warning" }) {
  const tooltipId = useId();
  return <span className={styles.tooltip}>
    <button
      aria-describedby={tooltipId}
      aria-label={label}
      className={`${styles.tooltipButton} ${styles[`tooltipButton_${tone}`]}`}
      type="button"
    >
      {tone === "success" ? "✓" : tone === "warning" ? "!" : "i"}
    </button>
    <span className={styles.tooltipContent} id={tooltipId} role="tooltip">{label}</span>
  </span>;
}

function ShipmentActions({ shipment, integration }: { shipment: Shipment; integration: IntegrationConfig }) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  const isDue = shipment.scheduled_ship_date <= new Date().toISOString().slice(0, 10);
  const awbReadyForWarehouse = integration.google_awb_configured
    ? shipment.google_awb_sync_status === "synced" && Boolean(shipment.google_awb_url)
    : Boolean(shipment.spx_awb_url) || integration.oms_mode === "mock";
  if (!isDue && shipment.warehouse_status === "not_sent") {
    return <div className={styles.waitingAction}>
      <span>Waiting</span>
      <InfoTooltip label={`This delivery is scheduled for ${formatDate(shipment.scheduled_ship_date)}.`} />
    </div>;
  }

  if ((shipment.warehouse_status === "not_sent" || shipment.warehouse_status === "failed") && shipment.shipment_status === "pending") {
    return <div className={styles.confirmStack}>
      <WorkflowButton
        id={shipment.id}
        intent="release_to_oms"
        label={shipment.warehouse_status === "failed"
          ? "Retry Shopify release"
          : shipment.shipment_number === 1
            ? "Link checkout order"
            : "Create delivery order"}
      />
      {shipment.warehouse_error ? <small className={styles.dangerText}>{shipment.warehouse_error}</small> : null}
    </div>;
  }

  if (shipment.warehouse_status === "submitted" || shipment.warehouse_status === "picking") {
    return <WorkflowStep number={1} title="Wait for Ninja Van to pack">
      {integration.oms_mode === "manual"
        ? <WorkflowButton id={shipment.id} intent="mark_packed" label="Confirm parcel is packed" pendingLabel="Saving packed status..." />
        : <WorkflowButton id={shipment.id} intent="sync_oms" label={integration.oms_mode === "mock" ? "Advance mock status" : "Check warehouse status"} />}
      <small>Click only after Ninja Van confirms that this parcel is physically packed.</small>
    </WorkflowStep>;
  }

  if (shipment.warehouse_status === "packed" && !shipment.spx_tracking_number) {
    return <WorkflowStep number={2} title="Create the SPX shipping label">
      {integration.spx_mode === "api" && integration.spx_configured ? (
        shipment.spx_batch_no
          ? <WorkflowButton id={shipment.id} intent="sync_spx" label="Continue SPX label setup" pendingLabel="Checking SPX result..." />
          : <WorkflowButton id={shipment.id} intent="create_spx_api" label={integration.spx_environment === "uat" ? "Create SPX UAT label" : "Create SPX shipping label"} pendingLabel="Submitting to SPX..." />
      ) : <small className={styles.dangerText}>SPX API credentials are not configured on the backend.</small>}
      <small className={styles.progressText}>{friendlySpxStatus(shipment.spx_booking_status)}</small>
      {shipment.spx_error ? <small className={styles.dangerText}>{shipment.spx_error}</small> : null}
    </WorkflowStep>;
  }
  return <div className={styles.confirmStack}>
    {shipment.spx_tracking_number && !shipment.spx_awb_url && shipment.spx_batch_no && integration.spx_mode === "api" ? (
      <WorkflowStep number={2} title="SPX is preparing the AWB">
        <WorkflowButton id={shipment.id} intent="sync_spx" label="Continue: Get AWB PDF" pendingLabel="Getting AWB from SPX..." />
        <small className={styles.progressText}>{friendlySpxStatus(shipment.spx_booking_status)}</small>
      </WorkflowStep>
    ) : null}
    {shipment.spx_awb_url && integration.google_awb_configured && shipment.google_awb_sync_status !== "synced" ? (
      <WorkflowStep number={3} title="Save AWB for Ninja Van">
        <WorkflowButton id={shipment.id} intent="sync_awb_google" label={shipment.google_awb_sync_status === "failed" ? "Retry Drive & Sheet sync" : "Save AWB to Drive & Sheet"} pendingLabel="Uploading AWB to Google..." />
        {shipment.google_awb_error ? <small className={styles.dangerText}>{shipment.google_awb_error}</small> : null}
      </WorkflowStep>
    ) : null}
    {shipment.spx_awb_url && !integration.google_awb_configured ? (
      <WorkflowStep number={3} title="Google AWB sync is turned off">
        <small className={styles.dangerText}>Enable Google AWB integration on the backend to archive this PDF in Drive and add it to the monitoring Sheet.</small>
      </WorkflowStep>
    ) : null}
    {shipment.google_awb_sync_status === "synced" ? (
      <div className={styles.actionNotice}>
        <span>Google saved</span>
        <InfoTooltip
          label={`AWB saved in Drive and Google Sheet${shipment.google_sheet_row_number ? ` (row ${shipment.google_sheet_row_number})` : ""}.`}
          tone="success"
        />
      </div>
    ) : null}
    {shipment.warehouse_status === "packed" && shipment.spx_tracking_number && awbReadyForWarehouse ? (
      <WorkflowButton
        id={shipment.id}
        intent="send_awb_to_oms"
        label={integration.oms_mode === "manual" ? "Mark AWB shared with Ninja Van" : "Send AWB to warehouse"}
      />
    ) : null}
    {integration.oms_mode !== "manual" && new Set(["awb_sent", "ready_for_pickup"]).has(shipment.warehouse_status) && shipment.shipment_status === "ready_to_ship" && shipment.spx_tracking_number && (shipment.total_shipments === 1 || shipment.shipment_number === shipment.total_shipments) ? (
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={shipment.id} />
        <input type="hidden" name="order_id" value={shipment.shopify_delivery_order_id || shipment.order_id} />
        <input type="hidden" name="tracking_number" value={shipment.spx_tracking_number} />
        <input type="hidden" name="intent" value="fulfill_shopify" />
        <button className={styles.button} disabled={busy} type="submit">Fulfill in Shopify</button>
      </fetcher.Form>
    ) : null}
    {shipment.warehouse_status === "awb_sent" && shipment.total_shipments > 1 && shipment.shipment_number < shipment.total_shipments ? (
      <div className={styles.actionNotice}>
        <span>Plan active</span>
        <InfoTooltip label="Shopify fulfillment remains open until the final scheduled shipment." tone="warning" />
      </div>
    ) : null}
    <details className={styles.advancedAction}>
      <summary>Update delivery status</summary>
      <fetcher.Form className={styles.tableActions} method="post">
          <input type="hidden" name="id" value={shipment.id} />
          <input type="hidden" name="intent" value="update_status" />
          <select aria-label={`Status for shipment ${shipment.id}`} defaultValue={shipment.shipment_status} name="status">
            {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
          <button className={styles.buttonSecondary} disabled={busy} type="submit">Save</button>
        </fetcher.Form>
    </details>
  </div>;
}

function EvidenceLinks({ shipment }: { shipment: Shipment }) {
  const groups = [
    { label: "Pickup proof", urls: shipment.spx_epop_urls },
    { label: "Delivery proof", urls: shipment.spx_epod_urls },
    { label: "Return proof", urls: shipment.spx_epor_urls },
    { label: "Handling proof", urls: shipment.spx_epooh_urls },
  ].filter((group) => Array.isArray(group.urls) && group.urls.length > 0);
  if (!groups.length) return null;
  return <small>{groups.flatMap((group) => group.urls.map((url, index) => (
    <span key={`${group.label}-${index}`}>
      <a className={styles.textLink} href={url} rel="noreferrer" target="_blank">
        {group.label}{group.urls.length > 1 ? ` ${index + 1}` : ""}
      </a>{" "}
    </span>
  )))}</small>;
}

function ShipmentTable({ shipments, integration }: { shipments: Shipment[]; integration: IntegrationConfig }) {
  if (shipments.length === 0) {
    return <EmptyState title="No orders found">Adjust the filters or wait for the next Shopify order.</EmptyState>;
  }
  return <div className={styles.tableWrap}><table className={styles.table}>
    <colgroup>
      <col className={styles.colCustomer} />
      <col className={styles.colShipment} />
      <col className={styles.colScheduled} />
      <col className={styles.colWarehouse} />
      <col className={styles.colSpx} />
      <col className={styles.colDelivery} />
      <col className={styles.colAction} />
    </colgroup>
    <thead><tr><th>Customer</th><th>Shipment</th><th>Scheduled</th><th>Warehouse</th><th>SPX</th><th>Delivery</th><th className={styles.stickyAction}>Action</th></tr></thead>
    <tbody>{shipments.map((shipment) => <tr key={shipment.id}>
      <td><strong>{shipment.customer_name}</strong><small>{shipment.customer_email}</small></td>
      <td>
        <strong>{shipment.shipment_kind === "ordinary" ? "One-time order" : `${shipment.shipment_number} of ${shipment.total_shipments}`}</strong>
        <small>{shipment.order_name ? `${shipment.order_name} · ` : ""}{shipment.product_name}</small>
        <small>{shipment.physical_box_count || 1} box{shipment.physical_box_count === 1 ? "" : "es"} · {Number(shipment.parcel_weight_kg || 0).toFixed(3)} kg</small>
      </td>
      <td className={styles.scheduleDate}><time dateTime={shipment.scheduled_ship_date}>{formatDate(shipment.scheduled_ship_date)}</time></td>
      <td><StatusBadge status={shipment.warehouse_status} />{shipment.oms_order_reference ? <small>{shipment.oms_order_reference}</small> : null}</td>
      <td>{shipment.spx_tracking_number ? <a className={styles.textLink} href={shipment.spx_tracking_link || "https://spx.ph/track"} rel="noreferrer" target="_blank">{shipment.spx_tracking_number}</a> : "Not booked"}{shipment.spx_tracking_status ? <small>{shipment.spx_tracking_status}{shipment.spx_tracking_status_code ? ` (${shipment.spx_tracking_status_code})` : ""}</small> : null}{shipment.google_awb_url || shipment.spx_awb_url ? <small><a className={styles.textLink} href={shipment.google_awb_url || shipment.spx_awb_url || "#"} rel="noreferrer" target="_blank">{shipment.google_awb_url ? "AWB in Drive" : "Temporary AWB PDF"}</a></small> : null}<EvidenceLinks shipment={shipment} /></td>
      <td><StatusBadge status={shipment.shipment_status} /></td>
      <td className={styles.stickyAction}><ShipmentActions shipment={shipment} integration={integration} /></td>
    </tr>)}</tbody>
  </table></div>;
}

export default function ShipmentsPage() {
  const { shipments, integration } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const ordinaryOrders = shipments.filter((shipment) => shipment.shipment_kind === "ordinary");
  const subscriptionDeliveries = shipments.filter((shipment) => shipment.shipment_kind !== "ordinary");
  return (
    <s-page heading="Shipments">
      {integration.oms_mode === "mock" ? <div className={styles.infoBar}>
        <strong>SellerCraft simulation mode</strong>
        <span>The first shipment links its checkout order. Later prepaid deliveries create zero-value Shopify orders for SellerCraft to import. Warehouse status is simulated.</span>
      </div> : null}
      {integration.oms_mode === "manual" ? <div className={styles.infoBar}>
        <strong>SellerCraft / Anchanto managed connection</strong>
        <span>Orders reach Ninja Van through SellerCraft. Confirm packed only after Ninja Van verifies it, then create the SPX booking and manually share the generated AWB PDF with the warehouse.</span>
      </div> : null}
      {integration.spx_mode === "api" && !integration.spx_configured ? <div className={styles.infoBar}>
        <strong>SPX API needs configuration</strong>
        <span>Add the SPX app and user credentials to the backend environment.</span>
      </div> : null}
      {integration.google_awb_mode === "api" && !integration.google_awb_configured ? <div className={styles.infoBar}>
        <strong>Google AWB sync needs configuration</strong>
        <span>Add the service-account, Drive folder, and Sheet settings to the backend. SPX booking remains available while Google sync is disabled.</span>
      </div> : null}
      {integration.google_awb_configured ? <div className={styles.infoBar}>
        <strong>Automatic AWB monitoring enabled</strong>
        <span>When SPX finishes an AWB, the backend archives its PDF in Google Drive and adds or updates the shipment row in Google Sheets.</span>
      </div> : null}
      <Form className={styles.toolbar} method="get">
        <label className={styles.field}>Customer email<input name="customer_email" placeholder="Search email" type="search" /></label>
        <label className={styles.field}>Order type<select defaultValue="" name="kind"><option value="">All order types</option><option value="ordinary">Ordinary orders</option><option value="subscription">Subscription deliveries</option></select></label>
        <label className={styles.field}>Status<select defaultValue="" name="status"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <label className={styles.field}>From<input name="from" type="date" /></label>
        <label className={styles.field}>To<input name="to" type="date" /></label>
        <button className={styles.button} disabled={navigation.state !== "idle"} type="submit">Apply filters</button>
      </Form>
      <p className={styles.summary}>{shipments.length} shipment{shipments.length === 1 ? "" : "s"} found</p>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>SHOPIFY ORDERS</span><h2>Ordinary orders</h2></div><span>{ordinaryOrders.length}</span></div>
        <ShipmentTable shipments={ordinaryOrders} integration={integration} />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>PREPAID PLANS</span><h2>Subscription deliveries</h2></div><span>{subscriptionDeliveries.length}</span></div>
        <ShipmentTable shipments={subscriptionDeliveries} integration={integration} />
      </section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
