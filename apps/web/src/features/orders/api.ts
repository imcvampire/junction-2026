import type { OrderList, OrderView, ProductView } from "@/features/orders/types"

// The Vite dev server proxies /api to the backend (vite.config.ts). Every
// caller is the shared company agent, so no key is needed.
const BASE = "/api/agent/v1"

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { accept: "application/json" },
      signal,
    })
  } catch (cause) {
    throw new ApiError(
      0,
      `Could not reach the API. Is the backend running? (${String(cause)})`
    )
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new ApiError(res.status, detail || `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export function listOrders(
  scope: "company" | "mine" = "company",
  signal?: AbortSignal
): Promise<OrderList> {
  return getJson<OrderList>(`/orders?scope=${scope}&limit=100`, signal)
}

export function getOrder(id: string, signal?: AbortSignal): Promise<OrderView> {
  return getJson<OrderView>(`/orders/${encodeURIComponent(id)}`, signal)
}

export function getProduct(
  id: string,
  signal?: AbortSignal
): Promise<ProductView> {
  return getJson<ProductView>(`/products/${encodeURIComponent(id)}`, signal)
}

// Fetch the pack of every product in an order. A product that can no longer be
// read (404, deleted) maps to null so planning can mark it as unsized.
export async function loadPacks(
  productIds: string[],
  signal?: AbortSignal
): Promise<Map<string, ProductView | null>> {
  const unique = [...new Set(productIds)]
  const results = await Promise.all(
    unique.map((id) =>
      getProduct(id, signal).catch(() => null as ProductView | null)
    )
  )
  return new Map(unique.map((id, i) => [id, results[i]]))
}
