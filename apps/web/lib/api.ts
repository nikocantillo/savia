const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchAPI<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options?.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...((options?.headers as Record<string, string>) || {}) },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiError(body.detail || "API error", res.status);
  }

  return res.json();
}

export const api = {
  get: <T = any>(url: string) => fetchAPI<T>(url),

  post: <T = any>(url: string, body?: any) =>
    fetchAPI<T>(url, {
      method: "POST",
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(url: string, body?: any) =>
    fetchAPI<T>(url, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  del: async (url: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${url}`, { method: "DELETE", headers });
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
      throw new ApiError("Unauthorized", 401);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: "Unknown error" }));
      throw new ApiError(body.detail || "API error", res.status);
    }
  },
};

// ── Types matching backend schemas ─────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
}

export interface InvoiceListItem {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  currency: string;
  total: string | null;
  status: string;
  payment_status: string;
  payment_due_date: string | null;
  created_at: string;
}

export interface LineItem {
  id: string;
  invoice_id: string;
  master_item_id: string | null;
  master_item_name: string | null;
  raw_description: string;
  normalized_description: string | null;
  quantity: string | null;
  unit: string | null;
  unit_price: string | null;
  total_price: string | null;
  created_at: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  organization_id: string;
  uploaded_by_id: string;
  file_type: string | null;
  error_message: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  line_items: LineItem[];
}

export interface MasterItem {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  created_at: string;
}

export interface DashboardSummary {
  spend_by_supplier: { supplier_name: string; total_spend: string; invoice_count: number }[];
  top_price_increases: { master_item_id: string; item_name: string; old_avg_price: string; new_price: string; pct_change: number }[];
  total_invoices: number;
  total_spend: string;
  active_suppliers: number;
  alert_count: number;
}

export interface PricePoint {
  date: string;
  unit_price: string;
  supplier_name: string | null;
  invoice_id: string;
}

export interface PriceHistory {
  master_item_id: string;
  item_name: string;
  prices: PricePoint[];
}

export interface Alert {
  id: string;
  organization_id: string;
  master_item_id: string | null;
  master_item_name: string | null;
  line_item_id: string | null;
  alert_type: string;
  message: string;
  old_avg_price: string | null;
  new_price: string | null;
  pct_change: number | null;
  is_read: boolean;
  created_at: string;
}

// ── Supplier types ──────────────────────────────────────────────────

export interface Supplier {
  id: string;
  organization_id?: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  payment_terms_days: number;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
  invoice_count: number;
  total_spend: string;
}

export interface NegotiatedPrice {
  id: string;
  supplier_id: string;
  master_item_id: string;
  master_item_name: string | null;
  price: string;
  effective_from: string | null;
  effective_until: string | null;
  created_at: string;
}

// ── Payment types ───────────────────────────────────────────────────

export interface AgingBucket {
  bucket: string;
  count: number;
  total: string;
}

export interface AgingReport {
  buckets: AgingBucket[];
  total_unpaid: string;
  total_overdue: string;
  total_paid_last_30d: string;
}

// ── Branch types ────────────────────────────────────────────────────

export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Sales types ─────────────────────────────────────────────────────

export interface DailySalesEntry {
  id: string;
  organization_id: string;
  branch_id: string | null;
  branch_name: string | null;
  date: string;
  total_revenue: string;
  transaction_count: number | null;
  notes: string | null;
  created_at: string;
}

// ── Margin types ────────────────────────────────────────────────────

export interface MarginDay {
  date: string;
  revenue: string;
  cost: string;
  margin: string;
  margin_pct: number;
}

export interface BranchMargin {
  branch_id: string;
  branch_name: string;
  revenue: string;
  cost: string;
  margin: string;
  margin_pct: number;
}

export interface MarginSummary {
  period_revenue: string;
  period_cost: string;
  period_margin: string;
  period_margin_pct: number;
  food_cost_target_pct: number;
  daily: MarginDay[];
  by_branch: BranchMargin[];
}

// ── Notification types ──────────────────────────────────────────────

export interface NotificationPrefs {
  notification_email: string | null;
  email_alerts: boolean;
  email_daily_summary: boolean;
  email_weekly_summary: boolean;
}

export interface OnboardingStatus {
  onboarding_completed: boolean;
  organization_name: string;
  food_cost_target_pct: number;
  alert_threshold_pct: number;
  branches_count: number;
  suppliers_count: number;
}

// ── Agent types ────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  organization_id: string;
  agent_type: string;
  name: string;
  is_enabled: boolean;
  config: Record<string, any> | null;
  schedule: string;
  last_run_at: string | null;
  created_at: string;
  last_run_status: string | null;
  last_run_findings: number | null;
}

export interface AgentRun {
  id: string;
  agent_config_id: string;
  status: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  findings_summary: string | null;
  findings_count: number;
  actions_count: number;
  error_message: string | null;
}

export interface AgentFinding {
  id: string;
  agent_run_id: string;
  severity: string;
  title: string;
  description: string | null;
  data: Record<string, any> | null;
  created_at: string;
}

export interface AgentRunDetail extends AgentRun {
  findings: AgentFinding[];
}
