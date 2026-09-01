export type ShipmentStatus =
  | "pending"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "failed"
  | "cancelled";

export type SubscriptionStatus = "active" | "paused" | "cancelled" | "completed";

export type WarehouseStatus =
  | "not_sent"
  | "submitted"
  | "picking"
  | "packed"
  | "awb_sent"
  | "ready_for_pickup"
  | "failed";

export interface ShippingAddress {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  phone?: string;
}

export interface Shipment {
  id: number;
  subscription_id: number | null;
  shipment_kind: "subscription" | "ordinary";
  order_id: string;
  order_name: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  product_name: string;
  variant_title: string | null;
  product_sku: string | null;
  product_variant_id: string | null;
  product_quantity: number;
  line_items: Array<{
    name: string;
    title?: string;
    variant_title?: string;
    sku: string | null;
    quantity: number;
  }>;
  order_total_price: string | null;
  physical_box_count: number;
  parcel_weight_kg: number;
  shipment_number: number;
  total_shipments: number;
  scheduled_ship_date: string;
  actual_ship_date: string | null;
  spx_tracking_number: string | null;
  spx_batch_no: string | null;
  spx_order_id: string | null;
  spx_booking_status: string | null;
  spx_error: string | null;
  spx_awb_url: string | null;
  spx_tracking_status: string | null;
  spx_tracking_status_code: string | null;
  spx_tracking_message: string | null;
  spx_tracking_link: string | null;
  spx_tracking_updated_at: string | null;
  spx_actual_shipping_fee: string | null;
  spx_latest_actual_weight: string | null;
  google_drive_file_id: string | null;
  google_awb_url: string | null;
  google_sheet_row_number: number | null;
  google_awb_sync_status: string | null;
  google_awb_synced_at: string | null;
  google_awb_error: string | null;
  oms_order_id: string | null;
  oms_order_reference: string | null;
  shopify_delivery_order_id: string | null;
  shopify_delivery_order_name: string | null;
  warehouse_status: WarehouseStatus;
  warehouse_error: string | null;
  shipment_status: ShipmentStatus;
  notes: string | null;
}

export interface IntegrationConfig {
  oms_mode: "manual" | "mock" | "api";
  spx_mode: "disabled" | "api";
  spx_environment: "uat" | "production";
  spx_configured: boolean;
  google_awb_mode: "disabled" | "api";
  google_awb_configured: boolean;
}

export interface Subscription {
  id: number;
  order_id: string;
  order_name: string;
  customer_email: string;
  customer_phone: string | null;
  product_name: string;
  variant_title: string;
  total_price_paid: string;
  plan_months: number;
  subscription_start_date: string;
  subscription_end_date: string;
  subscription_status: SubscriptionStatus;
  created_at: string;
}
