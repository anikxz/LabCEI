type Instrument = any;
type Log = any;
type Doc = any;

const colors = {
  primary: '#1e40af',
  primaryDark: '#1e3a8a',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  textMuted: '#64748b',
  border: '#e2e8f0',
  bg: '#f8fafc',
};

function ceiColor(v: number) {
  return v >= 85 ? colors.success : v >= 65 ? colors.warning : colors.danger;
}
function riskColor(v: number) {
  return v <= 20 ? colors.success : v <= 50 ? colors.warning : colors.danger;
}
function statusColor(s: string) {
  const map: Record<string, string> = {
    operational: colors.success,
    maintenance: colors.warning,
    calibration_due: colors.warning,
    out_of_service: colors.danger,
    completed: colors.success,
    failed: colors.danger,
  };
  return map[s] || colors.textMuted;
}
function statusLabel(s: string) {
  const map: Record<string, string> = {
    operational: 'Operational',
    maintenance: 'In Maintenance',
    calibration_due: 'Calibration Due',
    out_of_service: 'Out of Service',
    completed: 'Completed',
    failed: 'Failed',
    pending: 'Pending',
  };
  return map[s] || s;
}

// ─── Single instrument report ─────────────────────────────────────────────
export function generateInstrumentHTML(instrument: Instrument, logs: Log[], docs: Doc[]): string {
  const today = new Date();
  const daysBetween = (d?: string) =>
    d ? Math.floor((new Date(d).getTime() - today.getTime()) / 86400000) : null;
  const maintDays = daysBetween(instrument.next_maintenance);
  const calibDays = daysBetween(instrument.next_calibration);
  const totalCost = logs.reduce((s: number, l: any) => s + (Number(l.cost) || 0), 0);
  const failedLogs = logs.filter((l: any) => l.status === 'failed').length;
  const cei = instrument.cei_score ?? 0;
  const risk = instrument.risk_score ?? 0;

  const detailRow = (label: string, value: string, color?: string) => `
    <tr>
      <td style="padding:8px 12px;color:${colors.textMuted};font-size:13px;width:180px;border-bottom:1px solid ${colors.border}">${label}</td>
      <td style="padding:8px 12px;font-weight:600;font-size:13px;color:${color || '#0f172a'};border-bottom:1px solid ${colors.border}">${value || '—'}</td>
    </tr>`;

  const logRows = logs.map(l => `
    <tr>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid ${colors.border};text-transform:capitalize">${l.log_type}</td>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid ${colors.border}">${l.log_date}</td>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid ${colors.border}">${l.technician || '—'}</td>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid ${colors.border}">
        <span style="color:${statusColor(l.status)};font-weight:700">${statusLabel(l.status)}</span>
      </td>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid ${colors.border}">${l.cost != null ? '$' + Number(l.cost).toFixed(2) : '—'}</td>
      <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid ${colors.border};max-width:200px">${l.description || '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Instrument Report — ${instrument.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #fff; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body style="padding:40px;max-width:900px;margin:0 auto">

  <!-- Header -->
  <div style="background:${colors.primaryDark};color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:28px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div>
        <p style="font-size:11px;letter-spacing:2px;color:#93c5fd;font-weight:700;margin-bottom:6px">INSTRUMENT COMPLIANCE REPORT</p>
        <h1 style="font-size:26px;font-weight:800;margin-bottom:4px">${instrument.name}</h1>
        <p style="color:#cbd5e1;font-size:14px">${instrument.model || ''} · ${instrument.category || 'Uncategorized'} · S/N: ${instrument.serial_number || '—'}</p>
      </div>
      <div style="text-align:right">
        <p style="color:#93c5fd;font-size:12px;font-weight:600">Generated</p>
        <p style="font-size:14px;font-weight:700">${today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <div style="margin-top:8px;background:${statusColor(instrument.status)}22;border:1px solid ${statusColor(instrument.status)}66;border-radius:999px;padding:4px 14px;display:inline-block">
          <span style="color:${statusColor(instrument.status)};font-weight:700;font-size:13px">${statusLabel(instrument.status)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Compliance Scores -->
  <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
    <div style="flex:1;min-width:160px;border:1px solid ${colors.border};border-radius:12px;padding:20px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:8px">CEI SCORE</p>
      <p style="font-size:48px;font-weight:800;color:${ceiColor(cei)};line-height:1">${cei}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:6px">Compliance Efficiency Index</p>
      <div style="height:8px;background:${colors.bg};border-radius:999px;margin-top:10px;overflow:hidden">
        <div style="height:100%;width:${cei}%;background:${ceiColor(cei)};border-radius:999px"></div>
      </div>
    </div>
    <div style="flex:1;min-width:160px;border:1px solid ${colors.border};border-radius:12px;padding:20px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:8px">RISK SCORE</p>
      <p style="font-size:48px;font-weight:800;color:${riskColor(risk)};line-height:1">${risk}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:6px">AI-Predicted Maintenance Risk</p>
      <div style="height:8px;background:${colors.bg};border-radius:999px;margin-top:10px;overflow:hidden">
        <div style="height:100%;width:${risk}%;background:${riskColor(risk)};border-radius:999px"></div>
      </div>
    </div>
    <div style="flex:1;min-width:160px;border:1px solid ${colors.border};border-radius:12px;padding:20px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:8px">TOTAL LOGS</p>
      <p style="font-size:48px;font-weight:800;color:${colors.primary};line-height:1">${logs.length}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:6px">${failedLogs} failed · $${totalCost.toFixed(2)} total cost</p>
    </div>
    <div style="flex:1;min-width:160px;border:1px solid ${colors.border};border-radius:12px;padding:20px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:8px">NEXT DUE</p>
      <p style="font-size:18px;font-weight:800;color:${maintDays !== null && maintDays < 0 ? colors.danger : colors.primary};line-height:1.3">
        ${maintDays !== null ? (maintDays < 0 ? `${Math.abs(maintDays)}d overdue` : `in ${maintDays}d`) : '—'}
      </p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:6px">Maintenance</p>
      <p style="font-size:18px;font-weight:800;color:${calibDays !== null && calibDays < 0 ? colors.danger : colors.primary};margin-top:6px">
        ${calibDays !== null ? (calibDays < 0 ? `${Math.abs(calibDays)}d overdue` : `in ${calibDays}d`) : '—'}
      </p>
      <p style="font-size:11px;color:${colors.textMuted}">Calibration</p>
    </div>
  </div>

  <!-- Instrument Details -->
  <div style="border:1px solid ${colors.border};border-radius:12px;margin-bottom:24px;overflow:hidden">
    <div style="background:${colors.bg};padding:14px 18px;border-bottom:1px solid ${colors.border}">
      <h2 style="font-size:14px;font-weight:700">Instrument Details</h2>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        ${detailRow('Serial Number', instrument.serial_number)}
        ${detailRow('Location', instrument.location)}
        ${detailRow('Category', instrument.category)}
        ${detailRow('Purchase Date', instrument.purchase_date)}
        ${detailRow('Last Maintenance', instrument.last_maintenance)}
        ${detailRow('Next Maintenance', instrument.next_maintenance,
          maintDays !== null ? (maintDays < 0 ? colors.danger : maintDays < 14 ? colors.warning : undefined) : undefined)}
        ${detailRow('Last Calibration', instrument.last_calibration)}
        ${detailRow('Next Calibration', instrument.next_calibration,
          calibDays !== null ? (calibDays < 0 ? colors.danger : calibDays < 14 ? colors.warning : undefined) : undefined)}
        ${instrument.notes ? detailRow('Notes', instrument.notes) : ''}
      </tbody>
    </table>
  </div>

  <!-- Maintenance Logs -->
  <div style="border:1px solid ${colors.border};border-radius:12px;margin-bottom:24px;overflow:hidden">
    <div style="background:${colors.bg};padding:14px 18px;border-bottom:1px solid ${colors.border};display:flex;justify-content:space-between;align-items:center">
      <h2 style="font-size:14px;font-weight:700">Maintenance & Calibration Logs (${logs.length})</h2>
      <span style="font-size:12px;color:${colors.textMuted}">Total cost: $${totalCost.toFixed(2)}</span>
    </div>
    ${logs.length === 0
      ? `<p style="padding:20px;text-align:center;color:${colors.textMuted};font-size:13px">No logs recorded.</p>`
      : `<table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:${colors.bg}">
              <th style="padding:8px 10px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">TYPE</th>
              <th style="padding:8px 10px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">DATE</th>
              <th style="padding:8px 10px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">TECHNICIAN</th>
              <th style="padding:8px 10px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">STATUS</th>
              <th style="padding:8px 10px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">COST</th>
              <th style="padding:8px 10px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">DESCRIPTION</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>`}
  </div>

  <!-- AI Recommendation -->
  ${instrument.recommendation ? `
  <div style="border:1px solid ${colors.primary}33;border-left:4px solid ${colors.primary};border-radius:12px;padding:18px 20px;margin-bottom:24px;background:${colors.primary}08">
    <p style="font-size:11px;font-weight:700;color:${colors.primary};letter-spacing:1px;margin-bottom:6px">AI RECOMMENDATION</p>
    <p style="font-size:13px;color:#0f172a;line-height:1.6">${instrument.recommendation}</p>
  </div>` : ''}

  <!-- Footer -->
  <div style="border-top:1px solid ${colors.border};padding-top:20px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <p style="font-size:11px;color:${colors.textMuted}">Laboratory Maintenance & Compliance Efficiency System</p>
    <p style="font-size:11px;color:${colors.textMuted}">Report generated: ${today.toISOString().split('T')[0]} · Confidential</p>
  </div>

</body>
</html>`;
}

// ─── Fleet summary report ─────────────────────────────────────────────────
export function generateFleetHTML(instruments: Instrument[], logs: Log[]): string {
  const today = new Date();
  const daysBetween = (d?: string) =>
    d ? Math.floor((new Date(d).getTime() - today.getTime()) / 86400000) : 999;

  const overdue = instruments.filter(i =>
    daysBetween(i.next_maintenance) < 0 || daysBetween(i.next_calibration) < 0
  );
  const avgCEI = instruments.length
    ? Math.round(instruments.reduce((s, i) => s + (i.cei_score || 0), 0) / instruments.length) : 0;
  const avgRisk = instruments.length
    ? Math.round(instruments.reduce((s, i) => s + (i.risk_score || 0), 0) / instruments.length) : 0;
  const totalCost = logs.reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const failRate = logs.length
    ? Math.round((logs.filter(l => l.status === 'failed').length / logs.length) * 100) : 0;

  const instRows = instruments.map(inst => {
    const md = daysBetween(inst.next_maintenance);
    const cd = daysBetween(inst.next_calibration);
    const instLogs = logs.filter(l => l.instrument_id === inst.id);
    const instCost = instLogs.reduce((s: number, l: any) => s + (Number(l.cost) || 0), 0);
    return `
    <tr>
      <td style="padding:10px 12px;font-size:13px;border-bottom:1px solid ${colors.border};font-weight:600">${inst.name}</td>
      <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid ${colors.border};color:${colors.textMuted}">${inst.model || '—'}</td>
      <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid ${colors.border}">
        <span style="color:${statusColor(inst.status)};font-weight:700">${statusLabel(inst.status)}</span>
      </td>
      <td style="padding:10px 12px;font-size:13px;border-bottom:1px solid ${colors.border};font-weight:700;color:${ceiColor(inst.cei_score || 0)}">${inst.cei_score ?? '—'}</td>
      <td style="padding:10px 12px;font-size:13px;border-bottom:1px solid ${colors.border};font-weight:700;color:${riskColor(inst.risk_score || 0)}">${inst.risk_score ?? '—'}</td>
      <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid ${colors.border};color:${md < 0 ? colors.danger : md < 14 ? colors.warning : colors.textMuted}">
        ${inst.next_maintenance ? (md < 0 ? `${Math.abs(md)}d overdue` : `in ${md}d`) : '—'}
      </td>
      <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid ${colors.border};color:${cd < 0 ? colors.danger : cd < 14 ? colors.warning : colors.textMuted}">
        ${inst.next_calibration ? (cd < 0 ? `${Math.abs(cd)}d overdue` : `in ${cd}d`) : '—'}
      </td>
      <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid ${colors.border}">${instLogs.length}</td>
      <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid ${colors.border}">$${instCost.toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Fleet Compliance Report — ${today.toLocaleDateString()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #fff; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body style="padding:40px;max-width:1100px;margin:0 auto">

  <!-- Header -->
  <div style="background:${colors.primaryDark};color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:28px">
    <p style="font-size:11px;letter-spacing:2px;color:#93c5fd;font-weight:700;margin-bottom:6px">FLEET COMPLIANCE REPORT</p>
    <h1 style="font-size:26px;font-weight:800;margin-bottom:4px">Laboratory Instrument Fleet</h1>
    <p style="color:#cbd5e1;font-size:14px">
      ${instruments.length} instruments · Generated ${today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
  </div>

  <!-- KPI Cards -->
  <div style="display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap">
    <div style="flex:1;min-width:150px;border:1px solid ${colors.border};border-radius:12px;padding:18px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:6px">AVG CEI</p>
      <p style="font-size:40px;font-weight:800;color:${ceiColor(avgCEI)}">${avgCEI}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:4px">Fleet average</p>
    </div>
    <div style="flex:1;min-width:150px;border:1px solid ${colors.border};border-radius:12px;padding:18px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:6px">AVG RISK</p>
      <p style="font-size:40px;font-weight:800;color:${riskColor(avgRisk)}">${avgRisk}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:4px">Fleet average</p>
    </div>
    <div style="flex:1;min-width:150px;border:1px solid ${colors.border};border-radius:12px;padding:18px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:6px">OVERDUE</p>
      <p style="font-size:40px;font-weight:800;color:${overdue.length > 0 ? colors.danger : colors.success}">${overdue.length}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:4px">Instruments</p>
    </div>
    <div style="flex:1;min-width:150px;border:1px solid ${colors.border};border-radius:12px;padding:18px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:6px">TOTAL COST</p>
      <p style="font-size:32px;font-weight:800;color:${colors.primary}">$${totalCost.toFixed(0)}</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:4px">All maintenance</p>
    </div>
    <div style="flex:1;min-width:150px;border:1px solid ${colors.border};border-radius:12px;padding:18px;text-align:center">
      <p style="font-size:11px;color:${colors.textMuted};font-weight:700;letter-spacing:1px;margin-bottom:6px">FAIL RATE</p>
      <p style="font-size:40px;font-weight:800;color:${failRate <= 10 ? colors.success : failRate <= 25 ? colors.warning : colors.danger}">${failRate}%</p>
      <p style="font-size:11px;color:${colors.textMuted};margin-top:4px">Of all logs</p>
    </div>
  </div>

  <!-- Instrument Table -->
  <div style="border:1px solid ${colors.border};border-radius:12px;overflow:hidden;margin-bottom:28px">
    <div style="background:${colors.bg};padding:14px 18px;border-bottom:1px solid ${colors.border}">
      <h2 style="font-size:14px;font-weight:700">All Instruments</h2>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:800px">
        <thead>
          <tr style="background:${colors.bg}">
            ${['NAME','MODEL','STATUS','CEI','RISK','NEXT MAINT.','NEXT CALIB.','LOGS','COST'].map(h =>
              `<th style="padding:8px 12px;font-size:11px;color:${colors.textMuted};text-align:left;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid ${colors.border}">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>${instRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Overdue Alert -->
  ${overdue.length > 0 ? `
  <div style="border:1px solid ${colors.danger}33;border-left:4px solid ${colors.danger};border-radius:12px;padding:18px 20px;margin-bottom:24px;background:${colors.danger}08">
    <p style="font-size:12px;font-weight:700;color:${colors.danger};letter-spacing:1px;margin-bottom:8px">⚠ OVERDUE INSTRUMENTS (${overdue.length})</p>
    ${overdue.map(i => `<p style="font-size:13px;color:#0f172a;margin-bottom:4px">• <strong>${i.name}</strong> — ${i.model || ''}</p>`).join('')}
  </div>` : `
  <div style="border:1px solid ${colors.success}33;border-left:4px solid ${colors.success};border-radius:12px;padding:18px 20px;margin-bottom:24px;background:${colors.success}08">
    <p style="font-size:13px;font-weight:700;color:${colors.success}">✓ All instruments are within compliance schedule.</p>
  </div>`}

  <!-- Footer -->
  <div style="border-top:1px solid ${colors.border};padding-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <p style="font-size:11px;color:${colors.textMuted}">Laboratory Maintenance & Compliance Efficiency System</p>
    <p style="font-size:11px;color:${colors.textMuted}">Report generated: ${today.toISOString().split('T')[0]} · Confidential</p>
  </div>

</body>
</html>`;
}

// ─── Trigger browser print/download ───────────────────────────────────────
export function printHTML(html: string, filename: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.document.title = filename;

  // Auto-trigger print dialog after render
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };
}
