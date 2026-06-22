export type PayRole =
  | 'EMPLOYEE'
  | 'TCM'
  | 'RBT'
  | 'BCABA'
  | 'BCBA'
  | 'THERAPIST'
  | 'DOCTOR'
  | 'OUTREACH';

export type TaxType = 'W2' | '1099';

export interface PayRoleRate {
  id?: string;
  pay_role_config_id?: string;
  rate_key: string;
  rate_value: number;
  base_reference: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PayRoleConfig {
  id: string;
  employee_id: string;
  role: PayRole;
  tax_type: TaxType;
  active: boolean;
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  rates: PayRoleRate[];
}

export interface PayConfigDetail {
  employee: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  active_configs: PayRoleConfig[];
  historical_configs: PayRoleConfig[];
}
