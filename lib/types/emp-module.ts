export type EmpModuleStatus = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

export type RateDecisionType =
  | 'auto_single'
  | 'manual_old'
  | 'manual_new'
  | 'manual_prorate'
  | 'fixed_salary'
  | 'outreach_pct';

export type EmpEmployee = {
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  
  // Computed fields
  has_rate_conflict: boolean;
  rate_old: number | null;
  rate_new: number | null;
  rate_change_date: string | null;
  is_fixed_salary: boolean;
  fixed_amount: number | null;
  is_outreach: boolean;
  outreach_pct: number | null;
  outreach_base_total: number | null;
  outreach_blocked: boolean; // true si BA no submittes
  
  // Existing entry data (si ya capturado)
  entry: {
    id: string;
    hours: number | null;
    prorate_date: string | null;
    rate_decision_type: RateDecisionType;
    rate_used: number | null;
    rate_decision_note: string | null;
    subtotal: number | null;
    original_hours?: number | null;
    edited_by_owner?: boolean | null;
    owner_note?: string | null;
    edited_at?: string | null;
  } | null;
};

export type EmpModuleData = {
  pay_period: {
    id: string;
    start_date: string;
    end_date: string;
    pay_date?: string;
    capture_opens_at?: string;
    sup_deadline?: string;
    owner_deadline?: string;
    week_code?: string;
    status: string;
  };
  module_status: EmpModuleStatus;
  employees: EmpEmployee[];
  total: number;
  has_conflicts: number;
};
