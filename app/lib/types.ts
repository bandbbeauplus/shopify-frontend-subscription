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
  subscription_id: number;
  order_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  product_name: string;
  product_sku: string | null;
  product_variant_id: string | null;
  product_quantity: number;
  shipment_number: number;
  total_shipments: number;
  scheduled_ship_date: string;
  actual_ship_date: string | null;
  spx_tracking_number: string | null;
  spx_awb_url: string | null;
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
  oms_mode: "mock" | "api";
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
