export type ShipmentStatus =
  | "pending"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "failed"
  | "cancelled";

export type SubscriptionStatus = "active" | "paused" | "cancelled" | "completed";

export interface ShippingAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
}

export interface Shipment {
  id: number;
  subscription_id: number;
  order_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  product_name: string;
  shipment_number: number;
  total_shipments: number;
  scheduled_ship_date: string;
  actual_ship_date: string | null;
  spx_tracking_number: string | null;
  shipment_status: ShipmentStatus;
  notes: string | null;
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
