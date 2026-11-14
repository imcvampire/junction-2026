// Mirrors the backend agent API schemas (apps/api/src/api/procurement/schemas.py
// and apps/api/src/api/orders/models.py). Only the fields the console uses.

export type OrderStatus =
  | "draft"
  | "agreed"
  | "placed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "shipped"
  | "cancelled"

export interface OrderLine {
  product_id: string
  name: string
  quantity: number
  sales_unit: string
  unit_price: number
  line_total: number
  available_amount: number | null
  available_date: string | null
  covers_request: boolean
  substitute_for: string | null
  within_preferences: boolean
  missing_requirements: string[]
}

export interface OrderDecision {
  approved: boolean
  reason: string
  at: string
  decided_by: { agent_id: string; name: string } | null
}

export interface Cancellation {
  reason: string
  at: string
  cancelled_by: { agent_id: string; name: string }
  confirmed_via: string
  replaced_by: string | null
}

export interface OrderView {
  order_id: string
  status: OrderStatus
  agent_id: string | null
  quote_id: string | null
  client_reference: string | null
  delivery_date: string
  currency: string
  total: number
  lines: OrderLine[]
  requirements: string[]
  purpose: string | null
  approval_reasons: string[]
  decision: OrderDecision | null
  cancellation: Cancellation | null
  shipped_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderList {
  orders: OrderView[]
}

export interface PackView {
  width_mm: number
  length_mm: number
  height_mm: number
  gross_kg: number | null
  sales_units_per_pack: number
  estimated: boolean
}

export interface ProductView {
  id: string
  name: string
  brand: string | null
  vendor: string | null
  category: string
  sales_unit: string
  allowed_lot_size: number
  content_per_sales_unit: string | null
  pack: PackView | null
  allergens: Record<string, string>
  tags: string[]
  country_of_origin: string | null
  delivery_reliability: number | null
  co2_kg_per_sales_unit: number | null
  substitutes: string[]
}
