export type Role = "admin" | "sales" | "department";
export type SheetStatus = "draft" | "submitted" | "confirmed" | "completed" | "cancelled";
export type TaskStatus = "pending" | "in_progress" | "done" | "issue" | "na" | "cancelled";
export type PricingUnit = "per_day" | "per_pax_per_day" | "package";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  department_code: string | null;
}

export interface Department { code: string; name: string; sort_order: number; escalation_email: string | null; active: boolean }
export interface Venue { id: string; name: string; capacity: number | null; active: boolean }

export interface FnbItemInput { serve_time: string; item: string; menu_ref: string; pax: number | null; notes: string }
export interface DayInput {
  event_date: string;
  venue_id: string;
  start_time: string;
  end_time: string;
  pax_guaranteed: number;
  pax_expected: number;
  setup_style: string;
  notes: string;
  fnb: FnbItemInput[];
}
export interface DeptNoteInput { department_code: string; notes: string; not_required: boolean; ready_by: string }

export interface SheetInput {
  id?: string;
  account_name: string;
  booking_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  event_type: string;
  description: string;
  rate: number;
  pricing_unit: PricingUnit;
  pricing_pax: number;
  pricing_days: number;
  deposit: number;
  payment_method: string;
  accounts_notes: string;
  days: DayInput[];
  departments: DeptNoteInput[];
}

/** Full sheet as stored in a revision snapshot and used by the print view. */
export interface SheetSnapshot extends SheetInput {
  sheet_no: string;
  status: SheetStatus;
  revision: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  sales_name: string | null;
  days: (DayInput & { id?: string; venue_name: string })[];
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  issue: "Issue",
  na: "N/A",
  cancelled: "Cancelled",
};

export const SHEET_STATUS_LABEL: Record<SheetStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
