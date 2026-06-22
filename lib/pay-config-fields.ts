import type { PayRole } from '@/lib/types/pay-config';

export type RateFieldDefinition = {
  rate_key: string;
  label: string;
  requiresBaseReference?: boolean;
};

export const OUTREACH_BASE_REFERENCE_OPTIONS = [
  { value: 'BA_TOTAL', label: 'PERCENT_OF_BA' },
  { value: 'CMHC_TOTAL', label: 'PERCENT_OF_CMHC' },
  { value: 'TCM_TOTAL', label: 'PERCENT_OF_TCM' },
  { value: 'ALL_TOTAL', label: 'PERCENT_OF_ALL' },
];

export function getRateFieldsForRole(role: PayRole): RateFieldDefinition[] {
  switch (role) {
    case 'EMPLOYEE':
    case 'RBT':
      return [{ rate_key: 'HOURLY', label: 'Hourly' }];
    case 'TCM':
      return [
        { rate_key: 'HOURLY', label: 'Hourly' },
        { rate_key: 'PREMIUM_34H', label: 'Premium 34H' },
      ];
    case 'BCABA':
    case 'BCBA':
      return [
        { rate_key: 'HOURLY', label: 'Hourly' },
        { rate_key: 'ASSESSMENT', label: 'Assessment' },
        { rate_key: 'REASSESSMENT', label: 'Reassessment' },
      ];
    case 'THERAPIST':
      return [
        { rate_key: 'INTAKE', label: 'Intake' },
        { rate_key: 'IN_DEPTH_INTAKE', label: 'In-depth intake' },
        { rate_key: 'IN_DEPTH_BIO', label: 'In-depth bio' },
        { rate_key: 'IN_DEPTH_EXISTING', label: 'In-depth existing' },
        { rate_key: 'TP', label: 'Treatment plan' },
        { rate_key: 'BIO', label: 'Bio' },
        { rate_key: 'IT', label: 'Individual therapy' },
        { rate_key: 'TP_REVIEW', label: 'Treatment plan review' },
      ];
    case 'DOCTOR':
      return [{ rate_key: 'FIXED_SALARY', label: 'Fixed salary' }];
    case 'OUTREACH':
      return [{ rate_key: 'PERCENT', label: 'Percent', requiresBaseReference: true }];
    default:
      return [];
  }
}
