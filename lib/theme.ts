// Bump this on every deploy so the running build is identifiable in the UI.
export const APP_VERSION = 'v1.2.0 · 2026-07-25';

export const colors = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  primaryDark: '#1e3a8a',
  accent: '#0ea5e9',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  textLight: '#94a3b8',
};

// ✅ Replace with this
export const shadow = {
  boxShadow: '0px 2px 8px rgba(15,23,42,0.06)',
  elevation: 2,
};

export const statusColor = (status: string) => {
  switch (status) {
    case 'operational': return colors.success;
    case 'maintenance': return colors.warning;
    case 'calibration_due': return colors.warning;
    case 'out_of_service': return colors.danger;
    case 'completed': return colors.success;
    case 'failed': return colors.danger;
    default: return colors.textMuted;
  }
};

export const statusLabel = (status: string) => {
  switch (status) {
    case 'operational': return 'Operational';
    case 'maintenance': return 'In Maintenance';
    case 'calibration_due': return 'Calibration Due';
    case 'out_of_service': return 'Out of Service';
    default: return status;
  }
};
