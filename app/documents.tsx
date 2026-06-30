import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// ─── Types ────────────────────────────────────────────────────
type DocType   = 'DOC' | 'XLS' | 'DIR' | 'PDF' | 'TXT' | 'HC';
type Status    = 'active' | 'draft' | 'pending' | 'obsolete';
type Category  = 'QM' | 'LP' | 'QP' | 'FO' | 'EIR' | 'RA' | 'WI';
type UserRole  = 'admin' | 'technician' | 'viewer';

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  data: string;
  uploadedAt: string;
}

interface Doc {
  id: string;
  type: DocType;
  category: Category;
  desc: string;
  location: string;
  retention: string;
  status: Status;
  notes: string;
  revision: string;
  date: string;
  files: AttachedFile[];
}

interface ActivityEntry {
  id: string;
  action: 'add' | 'edit' | 'delete' | 'upload';
  docId: string;
  desc: string;
  user: string;
  time: string;
}

interface User {
  id: string;
  name: string;
  role: UserRole;
}

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; doc: Doc }
  | { type: 'delete'; doc: Doc }
  | { type: 'attach'; doc: Doc }
  | null;

// ─── Constants ────────────────────────────────────────────────
const MOBILE_BREAKPOINT = 768;
const CATEGORIES: Category[] = ['QM', 'LP', 'QP', 'FO', 'EIR', 'RA', 'WI'];
const CAT_LABELS: Record<Category, string> = {
  QM: 'Quality Manual', LP: 'Lab Policies', QP: 'Quality Procedures',
  FO: 'Forms', EIR: 'Electronic Index Records', RA: 'Risk Assessments', WI: 'Work Instructions',
};
const DOC_TYPES: DocType[] = ['DOC', 'XLS', 'DIR', 'PDF', 'TXT', 'HC'];
const STATUSES: Status[] = ['active', 'draft', 'pending', 'obsolete'];
const RETENTION_OPTS = ['Permanently', '5 years', '7 years', '10 years', 'Until superseded', 'As required'];
const PER_PAGE = 100;

// ─── Helpers ──────────────────────────────────────────────────
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function nowISO() { return new Date().toISOString(); }
function fmtDate(s: string) {
  if (!s || s === '—') return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}
function fmtTime(s: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}
function fmtSize(b: number) {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function csvEscape(v: unknown) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }

// ─── Seed data ────────────────────────────────────────────────
const SEED_DOCS: Doc[] = [
  { id: 'QM-001',  type: 'DOC', category: 'QM',  desc: 'ISO 17025 Quality Manual',                    location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'Completely rewritten for ISO 17025:2017', revision: '3', date: '2024-01-15', files: [] },
  { id: 'LP-001',  type: 'DOC', category: 'LP',  desc: 'Code of Conduct',                             location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'New for ISO 17025:2017',                 revision: '1', date: '2024-01-15', files: [] },
  { id: 'LP-002',  type: 'DOC', category: 'LP',  desc: 'Quality Policy',                              location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'New for ISO 17025:2017',                 revision: '1', date: '2024-01-15', files: [] },
  { id: 'QP-001',  type: 'DOC', category: 'QP',  desc: 'Estimating Measurement Uncertainty',          location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-10', files: [] },
  { id: 'QP-002',  type: 'DOC', category: 'QP',  desc: 'Reporting Measurement Uncertainty',           location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-10', files: [] },
  { id: 'QP-003',  type: 'DOC', category: 'QP',  desc: 'Control of Data - Validating Electronic Calculations', location: 'Management System\\EIR-002', retention: 'Permanently', status: 'active', notes: 'Updated for ISO 17025:2017', revision: '2', date: '2024-02-10', files: [] },
  { id: 'QP-004',  type: 'DOC', category: 'QP',  desc: 'Records Maintenance and Retention',           location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-10', files: [] },
  { id: 'QP-005',  type: 'DOC', category: 'QP',  desc: 'Proficiency Test Plan',                       location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-03-01', files: [] },
  { id: 'QP-010',  type: 'DOC', category: 'QP',  desc: 'Internal Audits',                             location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-03-01', files: [] },
  { id: 'QP-023',  type: 'TXT', category: 'QP',  desc: 'Process for Issuing Test Reports',            location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'pending', notes: 'Not included in kit. Needs to be created.', revision: '—', date: '2024-01-15', files: [] },
  { id: 'QP-024',  type: 'TXT', category: 'QP',  desc: 'Handling Test and Calibration Items',         location: 'Management System\\EIR-002',  retention: 'Permanently', status: 'pending', notes: 'Not included in kit. Needs to be created.', revision: '—', date: '2024-01-15', files: [] },
  { id: 'FO-001',  type: 'DOC', category: 'FO',  desc: 'Procedure Template',                          location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-15', files: [] },
  { id: 'FO-003',  type: 'XLS', category: 'FO',  desc: 'Uncertainty Estimate',                        location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-15', files: [] },
  { id: 'FO-003-1',type: 'XLS', category: 'FO',  desc: 'Uncertainty Estimate (Pressure)',             location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'Child of FO-003',                        revision: '1', date: '2024-03-01', files: [] },
  { id: 'FO-003-2',type: 'XLS', category: 'FO',  desc: 'Uncertainty Estimate (Temperature)',          location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'Child of FO-003',                        revision: '1', date: '2024-03-01', files: [] },
  { id: 'FO-004',  type: 'DOC', category: 'FO',  desc: 'Corrective Action Report',                    location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-15', files: [] },
  { id: 'FO-010',  type: 'DOC', category: 'FO',  desc: 'Customer Survey Form',                        location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'Updated for ISO 17025:2017',             revision: '2', date: '2024-02-20', files: [] },
  { id: 'FO-017',  type: 'DOC', category: 'FO',  desc: 'Competence Assessment Form',                  location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'active',  notes: 'New for ISO 17025:2017',                 revision: '1', date: '2024-03-10', files: [] },
  { id: 'FO-029',  type: 'TXT', category: 'FO',  desc: 'Calibration Tag',                             location: 'Management System\\EIR-004',  retention: 'Permanently', status: 'pending', notes: 'Not included in kit. Needs to be created.', revision: '—', date: '2024-01-15', files: [] },
  { id: 'EIR-001', type: 'DIR', category: 'EIR', desc: 'Standards and Methods',                       location: 'Management System',           retention: 'Permanently', status: 'active',  notes: '',                                       revision: '1', date: '2024-01-10', files: [] },
  { id: 'EIR-002', type: 'DIR', category: 'EIR', desc: 'Policy and Procedures',                       location: 'Management System',           retention: 'Permanently', status: 'active',  notes: '',                                       revision: '1', date: '2024-01-10', files: [] },
  { id: 'EIR-013', type: 'XLS', category: 'EIR', desc: 'Records and Documents List',                  location: 'Management System',           retention: 'Permanently', status: 'active',  notes: '',                                       revision: '3', date: '2025-01-01', files: [] },
  { id: 'EIR-018', type: 'XLS', category: 'EIR', desc: 'Complaints Log',                              location: 'Management System',           retention: 'Permanently', status: 'active',  notes: '',                                       revision: '1', date: '2024-01-10', files: [] },
  { id: 'RA-001',  type: 'XLS', category: 'RA',  desc: 'Impartiality Risk Assessment',                location: 'Management System\\EIR-020',  retention: 'Permanently', status: 'active',  notes: 'New for ISO 17025:2017',                 revision: '1', date: '2024-05-01', files: [] },
  { id: 'RA-002',  type: 'XLS', category: 'RA',  desc: 'Process Risks and Opportunities Assessment',  location: 'Management System\\EIR-020',  retention: 'Permanently', status: 'active',  notes: 'New for ISO 17025:2017',                 revision: '1', date: '2024-05-01', files: [] },
  { id: 'WI-003',  type: 'DOC', category: 'WI',  desc: 'Process for Transmitting Electronic Data',    location: 'Management System\\EIR-003',  retention: 'Permanently', status: 'pending', notes: 'Not included in kit. Needs to be created.', revision: '—', date: '2024-01-15', files: [] },
  { id: 'WI-004',  type: 'DOC', category: 'WI',  desc: 'Work Instruction Placeholder',                location: 'Management System\\EIR-003',  retention: 'Permanently', status: 'draft',   notes: '',                                       revision: '—', date: '2024-01-15', files: [] },
];

// ─── Style helpers ────────────────────────────────────────────
function statusStyle(s: Status) {
  return ({
    active:   { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    draft:    { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
    pending:  { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
    obsolete: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  } as const)[s] ?? { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
}

function typeStyle(t: DocType) {
  return ({
    DOC: { bg: '#eff6ff', color: '#1d4ed8' },
    XLS: { bg: '#f0fdf4', color: '#15803d' },
    DIR: { bg: '#f8fafc', color: '#475569' },
    PDF: { bg: '#fffbeb', color: '#b45309' },
    TXT: { bg: '#f5f3ff', color: '#7c3aed' },
    HC:  { bg: '#fff7ed', color: '#c2410c' },
  } as const)[t] ?? { bg: '#eff6ff', color: '#1d4ed8' };
}

function activityColor(action: ActivityEntry['action']) {
  return ({ add: '#16a34a', edit: '#1d4ed8', delete: '#dc2626', upload: '#7c3aed' })[action];
}
function activityIcon(action: ActivityEntry['action']) {
  return ({ add: '＋', edit: '✎', delete: '🗑', upload: '📎' })[action];
}

// ─── Shared style objects ─────────────────────────────────────
const S = {
  inp: {
    border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px',
    fontSize: 14, color: '#0f172a', background: '#fff', width: '100%',
    boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit',
  },
  btnPri: {
    background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
  },
  btnSec: {
    background: '#fff', color: '#334155', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  card: {
    background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
    padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600,
    maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  modalHdr: {
    padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky' as const, top: 0, background: '#fff', zIndex: 1, borderRadius: '16px 16px 0 0',
  },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b', padding: 4 },
  td: { padding: '9px 12px', verticalAlign: 'middle' as const },
  th: { padding: '8px 12px', textAlign: 'left' as const, fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const },
};

// ─── Label ────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{children}</div>;
}

// ─── Toast ────────────────────────────────────────────────────
interface ToastItem { id: string; msg: string; type: 'success' | 'error' | 'info'; }

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map(t => {
        const bg = t.type === 'error' ? '#dc2626' : t.type === 'info' ? '#1d4ed8' : '#16a34a';
        return (
          <div key={t.id} style={{
            background: bg, color: '#fff', padding: '10px 18px', borderRadius: 10,
            fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            whiteSpace: 'nowrap', animation: 'slideIn 0.2s ease',
          }}>{t.msg}</div>
        );
      })}
    </div>
  );
}

// ─── File Upload Zone ─────────────────────────────────────────
function FileUploadZone({ existingFiles, onFilesChange, addToast }: {
  existingFiles: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
  addToast: (msg: string, type?: ToastItem['type']) => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList) => {
    const results: AttachedFile[] = [];
    for (const f of Array.from(fileList)) {
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target!.result as string);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(f);
      });
      results.push({ id: uid(), name: f.name, size: f.size, mime: f.type, data, uploadedAt: nowISO() });
    }
    onFilesChange([...existingFiles, ...results]);
    addToast(`${results.length} file${results.length > 1 ? 's' : ''} attached`);
  };

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); processFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? '#1d4ed8' : '#cbd5e1'}`,
          borderRadius: 12, padding: '24px 20px', textAlign: 'center', cursor: 'pointer',
          background: drag ? '#eff6ff' : '#f8fafc', transition: 'all 0.2s',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Drag & drop files here, or click to browse</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>Any file type accepted</div>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => e.target.files && processFiles(e.target.files)} />
      </div>

      {existingFiles.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Attached Files ({existingFiles.length})
          </div>
          {existingFiles.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: 18 }}>{fileEmoji(f.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtSize(f.size)} · {fmtDate(f.uploadedAt)}</div>
              </div>
              <button
                onClick={() => onFilesChange(existingFiles.filter(x => x.id !== f.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: 4, flexShrink: 0 }}
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fileEmoji(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return '🖼️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📄';
}

// ─── File Preview Modal ───────────────────────────────────────
function FilePreviewModal({ file, onClose }: { file: AttachedFile; onClose: () => void }) {
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
  const isPDF   = /\.pdf$/i.test(file.name);

  const download = () => {
    const a = document.createElement('a');
    a.href = file.data; a.download = file.name; a.click();
  };

  return (
    <div style={{ ...S.overlay, zIndex: 1100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxWidth: 780 }}>
        <div style={S.modalHdr}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{fileEmoji(file.name)} {file.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtSize(file.size)} · Uploaded {fmtDate(file.uploadedAt)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={{ ...S.btnPri, fontSize: 12 }} onClick={download}>⬇ Download</button>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {isImage && <img src={file.data} alt={file.name} style={{ maxWidth: '100%', borderRadius: 8 }} />}
          {isPDF && <iframe src={file.data} title={file.name} style={{ width: '100%', height: 500, border: 'none', borderRadius: 8 }} />}
          {!isImage && !isPDF && (
            <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{fileEmoji(file.name)}</div>
              <div style={{ fontSize: 14, marginBottom: 16 }}>Preview not available for this file type.</div>
              <button style={S.btnPri} onClick={download}>⬇ Download to open</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Attachments Modal ────────────────────────────────────────
function AttachmentsModal({ doc, onSave, onClose, user, addToast }: {
  doc: Doc;
  onSave: (doc: Doc) => void;
  onClose: () => void;
  user: User;
  addToast: (msg: string, type?: ToastItem['type']) => void;
}) {
  const [files, setFiles] = useState<AttachedFile[]>(doc.files ?? []);
  const [preview, setPreview] = useState<AttachedFile | null>(null);

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxWidth: 700 }}>
        <div style={S.modalHdr}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>📎 Attachments — {doc.id}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{doc.desc}</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {user.role === 'admin' && (
            <FileUploadZone existingFiles={files} onFilesChange={setFiles} addToast={addToast} />
          )}
          {user.role !== 'admin' && files.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
              <div>No files attached to this document.</div>
            </div>
          )}
          {user.role !== 'admin' && files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 20 }}>{fileEmoji(f.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtSize(f.size)}</div>
                  </div>
                  <button style={{ ...S.btnSec, fontSize: 12, padding: '5px 10px' }} onClick={() => setPreview(f)}>👁 View</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{files.length} file{files.length !== 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnSec} onClick={onClose}>Close</button>
            {user.role === 'admin' && (
              <button style={S.btnPri} onClick={() => { onSave({ ...doc, files }); onClose(); }}>💾 Save Attachments</button>
            )}
          </div>
        </div>
      </div>
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ─── Doc Form Modal ───────────────────────────────────────────
function DocFormModal({ doc, onSave, onClose, addToast }: {
  doc?: Doc;
  onSave: (doc: Doc) => void;
  onClose: () => void;
  addToast: (msg: string, type?: ToastItem['type']) => void;
}) {
  const blank: Doc = {
    id: '', type: 'DOC', category: 'QM', desc: '', location: 'Management System',
    retention: 'Permanently', status: 'active', notes: '', revision: '1',
    date: new Date().toISOString().slice(0, 10), files: [],
  };
  const normalise = (d: Doc): Doc => ({ ...d, notes: d.notes ?? '', revision: d.revision ?? '', location: d.location ?? '', date: d.date ?? '' });
  const [form, setForm] = useState<Doc>(doc ? normalise(doc) : blank);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'info' | 'files'>('info');
  const set = (k: keyof Doc) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.id.trim()) { setErr('Document ID is required'); return; }
    if (!form.desc.trim()) { setErr('Description is required'); return; }
    setErr('');
    onSave(form);
  };

  return (
    <div data-overlay style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.modalHdr}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{doc ? '✏️ Edit Document' : '＋ Add Document'}</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          {(['info', 'files'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#1d4ed8' : '#64748b',
              borderBottom: tab === t ? '2px solid #1d4ed8' : '2px solid transparent',
              fontFamily: 'inherit', textTransform: 'capitalize',
            }}>
              {t === 'files' ? `📎 Files (${form.files.length})` : '📋 Info'}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'info' && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <Label>Document ID *</Label>
                  <input style={S.inp} value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value.toUpperCase() }))} placeholder="e.g. QP-011" disabled={!!doc} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Type</Label>
                  <select style={S.inp} value={form.type} onChange={set('type')}>
                    {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <Label>Category</Label>
                  <select style={S.inp} value={form.category} onChange={set('category')}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c} — {CAT_LABELS[c]}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Status</Label>
                  <select style={S.inp} value={form.status} onChange={set('status')}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>Description *</Label>
                <input style={S.inp} value={form.desc} onChange={set('desc')} placeholder="Document description" />
              </div>
              <div>
                <Label>Location</Label>
                <input style={S.inp} value={form.location} onChange={set('location')} placeholder="e.g. Management System" />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <Label>Revision</Label>
                  <input style={S.inp} value={form.revision} onChange={set('revision')} placeholder="e.g. 1" />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Date</Label>
                  <input style={S.inp} type="date" value={form.date} onChange={set('date')} />
                </div>
              </div>
              <div>
                <Label>Retention</Label>
                <select style={S.inp} value={form.retention} onChange={set('retention')}>
                  {RETENTION_OPTS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <Label>Notes</Label>
                <textarea style={{ ...S.inp, minHeight: 72, resize: 'vertical' }} value={form.notes} onChange={set('notes')} placeholder="Optional notes" />
              </div>
            </>
          )}
          {tab === 'files' && (
            <FileUploadZone existingFiles={form.files} onFilesChange={files => setForm(f => ({ ...f, files }))} addToast={addToast} />
          )}
          {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #fecaca' }}>{err}</div>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={S.btnSec} onClick={onClose}>Cancel</button>
          <button style={S.btnPri} onClick={submit}>{doc ? '💾 Update' : '＋ Add Document'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────
function ConfirmDelete({ doc, onConfirm, onClose }: { doc: Doc; onConfirm: () => void; onClose: () => void }) {
  return (
    <div data-overlay style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxWidth: 400 }}>
        <div style={S.modalHdr}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>🗑 Delete Document</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', fontSize: 14, color: '#334155' }}>
          Delete <b>{doc.id}</b> — "{doc.desc}"? This cannot be undone.
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={S.btnSec} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnPri, background: '#dc2626', borderColor: '#dc2626' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard View ─────────────────────────────────────────────
function DashboardView({ docs, activity, onGoRegistry, onGoDoc }: {
  docs: Doc[];
  activity: ActivityEntry[];
  onGoRegistry: (status?: string) => void;
  onGoDoc: (docId: string) => void;
}) {
  const total      = docs.length;
  const active     = docs.filter(d => d.status === 'active').length;
  const pending    = docs.filter(d => d.status === 'pending').length;
  const draft      = docs.filter(d => d.status === 'draft').length;
  const obsolete   = docs.filter(d => d.status === 'obsolete').length;
  const withFiles  = docs.filter(d => d.files.length > 0).length;
  const totalFiles = docs.reduce((s, d) => s + d.files.length, 0);

  const byType = DOC_TYPES.map(t => ({ label: t, count: docs.filter(d => d.type === t).length })).filter(x => x.count > 0);
  const byCat  = CATEGORIES.map(c => ({ label: c, count: docs.filter(d => d.category === c).length })).filter(x => x.count > 0);
  const maxT   = Math.max(...byType.map(x => x.count), 1);
  const maxC   = Math.max(...byCat.map(x => x.count), 1);
  const maxStatus = Math.max(active, pending, draft, obsolete, 1);

  const statCards = [
    { label: 'Total',    value: total,      color: '#1d4ed8', bg: '#eff6ff', onClick: () => onGoRegistry(), filter: '' },
    { label: 'Active',   value: active,     color: '#15803d', bg: '#f0fdf4', onClick: () => onGoRegistry('active'), filter: 'active' },
    { label: 'Pending',  value: pending,    color: '#6d28d9', bg: '#f5f3ff', onClick: () => onGoRegistry('pending'), filter: 'pending' },
    { label: 'Draft',    value: draft,      color: '#b45309', bg: '#fffbeb', onClick: () => onGoRegistry('draft'), filter: 'draft' },
    { label: 'Files',    value: totalFiles, color: '#0891b2', bg: '#ecfeff', onClick: () => onGoRegistry('has-files'), filter: 'has-files', sub: `across ${withFiles} docs` },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
    
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        {statCards.map(s => (
          <div key={s.label} onClick={s.onClick} style={{
            background: s.bg, borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
            border: `1px solid ${s.color}22`, textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* By Category */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>By Document Category</div>
          {byCat.map(({ label, count }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 36 }}>{label}</span>
              <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((count / maxC) * 100)}%`, background: '#3b82f6', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', width: 24, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
          {byCat.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No categories yet</div>}
        </div>

        {/* By Type */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>By Document Type</div>
          {byType.map(({ label, count }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 36 }}>{label}</span>
              <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((count / maxT) * 100)}%`, background: '#8b5cf6', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', width: 24, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
          {byType.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No types yet</div>}
        </div>
      </div>

      {/* Document Status Overview + Alerts */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Document Status Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Active', count: active, color: '#15803d', bg: '#f0fdf4', filter: 'active' },
            { label: 'Pending', count: pending, color: '#6d28d9', bg: '#f5f3ff', filter: 'pending' },
            { label: 'Draft', count: draft, color: '#b45309', bg: '#fffbeb', filter: 'draft' },
            { label: 'Obsolete', count: obsolete, color: '#dc2626', bg: '#fef2f2', filter: 'obsolete' },
          ].map(s => {
            const pct = total ? Math.round((s.count / total) * 100) : 0;
            return (
              <div key={s.label} onClick={() => onGoRegistry(s.filter)} style={{ cursor: 'pointer', textAlign: 'center', padding: 8, borderRadius: 8, background: s.bg }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
                <div style={{ fontSize: 10, color: s.color }}>{pct}%</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alerts</div>
          {docs.filter(d => d.status === 'pending').length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6d28d9', marginBottom: 6 }}>
              <span>⏳</span> <span>{docs.filter(d => d.status === 'pending').length} pending document(s) awaiting approval</span>
            </div>
          )}
          {docs.filter(d => d.status === 'draft').length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#b45309', marginBottom: 6 }}>
              <span>✏️</span> <span>{docs.filter(d => d.status === 'draft').length} draft document(s) in progress</span>
            </div>
          )}
          {docs.filter(d => d.files.length === 0 && d.status === 'active').length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0891b2', marginBottom: 6 }}>
              <span>📎</span> <span>{docs.filter(d => d.files.length === 0 && d.status === 'active').length} active document(s) with no attachments</span>
            </div>
          )}
          {docs.filter(d => d.status === 'pending').length === 0 && docs.filter(d => d.status === 'draft').length === 0 && (
            <div style={{ fontSize: 12, color: '#15803d' }}>✅ No critical alerts</div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>🕐 Recent Activity</div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Click an item to view document</span>
        </div>
        {activity.length === 0
          ? <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>No activity yet — start adding documents.</div>
          : activity.slice(0, 12).map(a => (
            <div key={a.id} onClick={() => onGoDoc(a.docId)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
              borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                background: activityColor(a.action) + '18', color: activityColor(a.action),
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>{activityIcon(a.action)}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', marginBottom: 2 }}>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8',
                    background: '#eff6ff', padding: '1px 6px', borderRadius: 5,
                    fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap',
                  }}>{a.docId}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    color: activityColor(a.action), background: activityColor(a.action) + '18',
                    padding: '1px 6px', borderRadius: 5, flexShrink: 0,
                  }}>{a.action}</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.desc}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap' }}>{a.user} · {fmtTime(a.time)}</div>
              </div>
            </div>
          ))
        }
      </div>
      <div className="bottom-spacer" style={{ flexShrink: 0, height: 20 }} />
    </div>
  );
}

// ─── Registry View ──────────────────────────────────────────────
function RegistryView({ docs, onAdd, onEdit, onDelete, onAttach, user, activeCat, setActiveCat, initStatus, initDocId }: {
  docs: Doc[];
  onAdd: () => void;
  onEdit: (doc: Doc) => void;
  onDelete: (doc: Doc) => void;
  onAttach: (doc: Doc) => void;
  user: User;
  activeCat: string;
  setActiveCat: (c: string) => void;
  initStatus: string;
  initDocId: string;
}) {
  const [q, setQ]           = useState('');
  const [fType, setFType]   = useState('');
  const [fStatus, setFStatus] = useState(() => initStatus && initStatus !== 'has-files' ? initStatus : '');
  const [fHasFiles, setFHasFiles] = useState(() => initStatus === 'has-files' ? 'yes' : '');
  const [sortK, setSortK]   = useState<keyof Doc>('id');
  const [sortD, setSortD]   = useState(1);
  const [page, setPage]     = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [highlightId, setHighlightId] = useState('');
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!initDocId) return;
    setHighlightId(initDocId);
    const m = initDocId.match(/^(.+)-\d+$/);
    if (m && docs.find(d => d.id === m[1])) {
      setExpanded(e => ({ ...e, [m[1]]: true }));
    }
    setTimeout(() => {
      rowRefs.current[initDocId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onAttach(docs.find(d => d.id === initDocId)!);
    }, 100);
    setTimeout(() => setHighlightId(''), 3000);
  }, [initDocId, docs, onAttach]);

  const doSort = (k: keyof Doc) => {
    if (sortK === k) setSortD(d => d === 1 ? -1 : 1);
    else { setSortK(k); setSortD(1); }
    setPage(1);
  };

  const childMap = useMemo(() => {
    const map: Record<string, Doc[]> = {};
    docs.forEach(d => {
      const m = d.id.match(/^(.+)-\d+$/);
      if (m && docs.find(p => p.id === m[1])) {
        map[m[1]] = [...(map[m[1]] ?? []), d];
      }
    });
    return map;
  }, [docs]);

  const childIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(childMap).forEach(arr => arr.forEach(d => s.add(d.id)));
    return s;
  }, [childMap]);

  const isSearching = !!(q || fType || fStatus || fHasFiles);

  const filtered = useMemo(() => {
    let r = docs.filter(d => {
      if (activeCat && d.category !== activeCat) return false;
      if (fStatus && d.status !== fStatus) return false;
      if (fType && d.type !== fType) return false;
      if (fHasFiles === 'yes' && !d.files.length) return false;
      if (fHasFiles === 'no' && d.files.length) return false;
      if (q) {
        const lq = q.toLowerCase();
        if (![d.id, d.desc, d.category, d.type, d.notes].join(' ').toLowerCase().includes(lq)) return false;
      }
      if (childIds.has(d.id) && !isSearching) {
        const m = d.id.match(/^(.+)-\d+$/)!;
        if (!expanded[m[1]]) return false;
      }
      return true;
    });
    r.sort((a, b) => {
      const va = (a[sortK] ?? '').toString();
      const vb = (b[sortK] ?? '').toString();
      return va.localeCompare(vb) * sortD;
    });
    return r;
  }, [docs, q, activeCat, fType, fStatus, fHasFiles, sortK, sortD, expanded, childIds, isSearching]);

  const pages   = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportCSV = () => {
    const header = ['ID', 'Type', 'Category', 'Description', 'Location', 'Retention', 'Status', 'Revision', 'Date', 'Files', 'Notes'];
    const rows = filtered.map(d => [d.id, d.type, d.category, d.desc, d.location, d.retention, d.status, d.revision, d.date, d.files.length, d.notes].map(csvEscape));
    const csv = [header.map(csvEscape), ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'ISO17025_Documents.csv';
    a.click();
  };

  const SortBtn = ({ label, k }: { label: string; k: keyof Doc }) => (
    <span onClick={() => doSort(k)} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {label}
      <span style={{ fontSize: 9, opacity: sortK === k ? 1 : 0.3 }}>{sortK === k ? (sortD === 1 ? '▲' : '▼') : '⇅'}</span>
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Category pills - only visible on mobile (handled by parent) */}
      <div style={{ overflowX: 'auto', padding: '8px 16px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
        {['', ...CATEGORIES].map(c => (
          <button key={c || 'all'} onClick={() => { setActiveCat(c); setPage(1); }} style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid',
            borderColor: activeCat === c ? '#1d4ed8' : '#e2e8f0',
            background: activeCat === c ? '#1d4ed8' : '#fff',
            color: activeCat === c ? '#fff' : '#64748b',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{c ? `${c} — ${CAT_LABELS[c as Category]}` : 'All'}</button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input style={{ ...S.inp, paddingLeft: 32 }} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search documents…" />
        </div>

        <select style={{ ...S.inp, width: 'auto', minWidth: 110 }} value={fType} onChange={e => { setFType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>

        <select style={{ ...S.inp, width: 'auto', minWidth: 120 }} value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>

        <select style={{ ...S.inp, width: 'auto', minWidth: 110 }} value={fHasFiles} onChange={e => { setFHasFiles(e.target.value); setPage(1); }}>
          <option value="">All files</option>
          <option value="yes">Has files</option>
          <option value="no">No files</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={S.btnSec} onClick={exportCSV} title="Export filtered list as CSV">⬇ Export</button>
          {user.role === 'admin' && (
            <button style={S.btnPri} onClick={onAdd}>＋ Add</button>
          )}
        </div>
      </div>

      {/* Count + Pagination */}
      <div style={{ padding: '6px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''} · page {page}/{pages}</span>
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: page === 1 ? '#cbd5e1' : '#334155' }}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{page} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: page === pages ? 'default' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: page === pages ? '#cbd5e1' : '#334155' }}>›</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="registry-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0 16px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
              <th style={S.th}><SortBtn label="ID" k="id" /></th>
              <th style={S.th}><SortBtn label="Type" k="type" /></th>
              <th style={S.th}><SortBtn label="Cat" k="category" /></th>
              <th style={S.th}><SortBtn label="Description" k="desc" /></th>
              <th style={S.th}><SortBtn label="Location" k="location" /></th>
              <th style={S.th}><SortBtn label="Rev" k="revision" /></th>
              <th style={S.th}><SortBtn label="Status" k="status" /></th>
              <th style={S.th}><SortBtn label="Date" k="date" /></th>
              <th style={S.th}>Files</th>
              {user.role === 'admin' && <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>No documents match your filters</td></tr>
            ) : visible.map(doc => {
              const ts = typeStyle(doc.type);
              const ss = statusStyle(doc.status);
              const fc = doc.files.length;
              const isChild    = childIds.has(doc.id) && !isSearching;
              const hasChildren = !!(childMap[doc.id]?.length);
              const isExp      = !!expanded[doc.id];
              const isHighlight = doc.id === highlightId;

              return (
                <tr
                  key={doc.id}
                  ref={el => { rowRefs.current[doc.id] = el; }}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: isHighlight ? '#dbeafe' : isChild ? '#fafbfc' : '#fff',
                    outline: isHighlight ? '2px solid #1d4ed8' : 'none',
                    outlineOffset: -1,
                    transition: 'background 0.2s',
                  }}
                >
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: isChild ? 18 : 0 }}>
                      {isChild && <span style={{ color: '#cbd5e1', fontSize: 12 }}>└</span>}
                      {hasChildren && !isSearching
                        ? <button
                            onClick={() => setExpanded(e => ({ ...e, [doc.id]: !e[doc.id] }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#1d4ed8', fontSize: 11, fontWeight: 600, borderRadius: 4 }}
                          >{isExp ? '▼' : '▶'}</button>
                        : <span style={{ width: 20, display: 'inline-block' }} />
                      }
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', fontSize: 12 }}>{doc.id}</span>
                      {hasChildren && !isSearching && (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                          {childMap[doc.id].length}
                        </span>
                      )}
                    </div>
                   </td>
                  <td style={S.td}>
                    <span style={{ background: ts.bg, color: ts.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5 }}>{doc.type}</span>
                   </td>
                  <td style={{ ...S.td, fontSize: 11, fontWeight: 600, color: '#64748b' }}>{doc.category}</td>
                  <td style={{ ...S.td, maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }} title={doc.desc}>{doc.desc}</div>
                    {doc.notes && <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.notes}</div>}
                   </td>
                  <td style={{ ...S.td, maxWidth: 140 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }} title={doc.location}>{doc.location || '—'}</div>
                   </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{doc.revision}</td>
                  <td style={S.td}>
                    <span style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10 }}>
                      {doc.status}
                    </span>
                   </td>
                  <td style={{ ...S.td, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(doc.date)}</td>
                  <td style={S.td}>
                    {(fc > 0 || user.role === 'admin') && (
                      <button
                        onClick={() => onAttach(doc)}
                        style={{
                          background: fc > 0 ? '#eff6ff' : '#f8fafc', border: `1px solid ${fc > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                          color: fc > 0 ? '#1d4ed8' : '#94a3b8', borderRadius: 7, padding: '4px 10px',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        title={user.role === 'admin' ? 'Manage attachments' : 'View attachments'}
                      >
                        📎 {fc > 0 ? fc : (user.role === 'admin' ? 'Add' : '')}
                      </button>
                    )}
                   </td>
                  {user.role === 'admin' && (
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => onEdit(doc)}>✏️</button>
                        <button style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => onDelete(doc)}>🗑</button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── useIsDesktop hook ─────────────────────────────────────────
function useIsDesktop(breakpoint = 768): boolean {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= breakpoint : false
  );
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint);
    window.addEventListener('resize', check);
    check();
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isDesktop;
}

// ─── Desktop Sidebar ────────────────────────────────────────────
function DesktopSidebar({ view, setView, docCount, currentUser, onCategoryClick }: {
  view: string;
  setView: (v: string) => void;
  docCount: number;
  currentUser: User;
  onCategoryClick: (c: string) => void;
}) {
  const accent = '#1B4F72';

  return (
    <nav style={{
      width: 240,
      flexShrink: 0,
      background: accent,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '2px 0 8px rgba(0,0,0,0.12)',
    }}>
      <div style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📄</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Documents</div>
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>ISO 17025 · Quality</div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        <div style={{ padding: '6px 16px', fontSize: 10, fontWeight: 600, opacity: 0.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Navigation</div>
        {[
          { id: 'dashboard', icon: '📊', label: 'Dashboard' },
          { id: 'registry',  icon: '📋', label: 'Document Registry', badge: docCount },
        ].map(n => (
          <div
            key={n.id}
            onClick={() => setView(n.id)}
            style={{
              padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
              fontSize: 13, fontWeight: view === n.id ? 600 : 400,
              background: view === n.id ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderLeft: view === n.id ? '3px solid #fff' : '3px solid transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (view !== n.id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { if (view !== n.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge !== undefined && (
              <span style={{ background: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{n.badge}</span>
            )}
          </div>
        ))}

        <div style={{ padding: '6px 16px', fontSize: 10, fontWeight: 600, opacity: 0.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 12 }}>Categories</div>
        {CATEGORIES.map(c => (
          <div
            key={c}
            onClick={() => onCategoryClick(c)}
            style={{
              padding: '7px 16px', cursor: 'pointer', fontSize: 12, opacity: 0.85,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 11 }}>📁</span>
            {c} — {CAT_LABELS[c]}
          </div>
        ))}
      </div>


    </nav>
  );
}

// ─── Supabase DB column mapping ──────────────────────────────
function fromDB(r: any): Doc {
  return {
    id:        r.id,
    type:      r.type,
    category:  r.category,
    desc:      r.description ?? r.desc ?? '',
    location:  r.location  ?? '',
    retention: r.retention ?? 'Permanently',
    status:    r.status    ?? 'active',
    notes:     r.notes     ?? '',
    revision:  r.revision  ?? '—',
    date:      r.date      ?? '',
    files:     r.files     ?? [],
  };
}
function toDB(d: Doc, includeId = false, includeFiles = false): Record<string, unknown> {
  const row: Record<string, unknown> = {
    description: d.desc,
    type:        d.type,
    category:    d.category,
    location:    d.location,
    retention:   d.retention,
    status:      d.status,
    notes:       d.notes,
    revision:    d.revision,
    date:        d.date,
  };
  if (includeId)    row.id    = d.id;
  if (includeFiles) row.files = d.files ?? [];
  return row;
}

// ─── Main App ─────────────────────────────────────────────────
export default function DocumentsApp() {
  const { user: authUser } = useAuth();
  const isDesktop = useIsDesktop(MOBILE_BREAKPOINT);

  const CURRENT_USER: User = {
    id:   authUser?.id   ?? 'guest',
    name: authUser?.fullName ?? authUser?.email ?? 'Guest',
    role: (authUser?.role as UserRole) ?? 'viewer',
  };

  const isAdmin = CURRENT_USER.role === 'admin';

  const [docs, setDocs]       = useState<Doc[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState('dashboard');
  const [modal, setModal]     = useState<ModalState>(null);
  const [toasts, setToasts]   = useState<ToastItem[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [initStatus, setInitStatus] = useState('');
  const [initDocId, setInitDocId]   = useState('');
  const [registryKey, setRegistryKey] = useState(0);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [{ data: docsData }, { data: activityData }] = await Promise.all([
        supabase.from('iso_documents').select('*').order('id'),
        supabase.from('iso_document_activity').select('*').order('time', { ascending: false }).limit(60),
      ]);
      if (docsData && docsData.length > 0) {
        setDocs(docsData.map(fromDB));
      } else {
        const toInsert = SEED_DOCS.map(d => toDB(d, true, true));
        const { data: inserted } = await supabase.from('iso_documents').insert(toInsert).select();
        setDocs(inserted ? inserted.map(fromDB) : SEED_DOCS);
      }
      setActivity(activityData ?? []);
      setLoading(false);
    }
    loadData();
  }, []);

  const addToast = useCallback((msg: string, type: ToastItem['type'] = 'success') => {
    const id = uid();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const log = useCallback((action: ActivityEntry['action'], docId: string, desc: string) => {
    const entry: ActivityEntry = { id: uid(), action, docId, desc, user: CURRENT_USER.name, time: nowISO() };
    supabase.from('iso_document_activity').insert({
      id: entry.id, action: entry.action, docId: entry.docId,
      description: entry.desc, user: entry.user, time: entry.time,
    });
    setActivity(a => [entry, ...a].slice(0, 60));
  }, [CURRENT_USER.name]);

  const handleSave = async (form: Doc) => {
    if (!isAdmin) { addToast('Permission denied', 'error'); return; }
    if ((modal as { type: string }).type === 'add') {
      if (docs.find(d => d.id === form.id)) { addToast('Document ID already exists', 'error'); return; }
      const { error } = await supabase.from('iso_documents').insert(toDB(form, true, true));
      if (error) { addToast('Failed to save document', 'error'); return; }
      setDocs(prev => [...prev, { ...form, files: form.files ?? [] }]);
      log('add', form.id, form.desc);
      addToast('Document added');
    } else {
      const { error } = await supabase.from('iso_documents').update(toDB(form)).eq('id', form.id);
      if (error) {
        addToast(`Update failed: ${error.message ?? error.code ?? 'Unknown error'}`, 'error');
        return;
      }
      setDocs(prev => prev.map(d => d.id === form.id ? { ...form, files: form.files ?? [] } : d));
      log('edit', form.id, form.desc);
      addToast('Document updated');
    }
    setModal(null);
  };

  const handleAttachSave = async (form: Doc) => {
    const prev = docs.find(d => d.id === form.id);
    const newCount = form.files.length;
    const oldCount = prev?.files.length ?? 0;
    const { error } = await supabase.from('iso_documents').update({ files: form.files }).eq('id', form.id);
    if (error) { addToast('Failed to save attachments', 'error'); return; }
    setDocs(prev => prev.map(d => d.id === form.id ? form : d));
    if (newCount !== oldCount) log('upload', form.id, `Files updated (${newCount} attached)`);
    addToast('Attachments saved');
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin) { addToast('Permission denied', 'error'); return; }
    if (modal?.type !== 'delete') return;
    const doc = modal.doc;
    const { error } = await supabase.from('iso_documents').delete().eq('id', doc.id);
    if (error) { addToast('Failed to delete document', 'error'); return; }
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    log('delete', doc.id, doc.desc);
    addToast('Document deleted');
    setModal(null);
  };

  const goToRegistry = (status?: string) => {
    setActiveCat('');
    setInitStatus(status ?? '');
    setInitDocId('');
    setRegistryKey(k => k + 1);
    setView('registry');
  };

  const goToDoc = (docId: string) => {
    setActiveCat('');
    setInitStatus('');
    setInitDocId(docId);
    setRegistryKey(k => k + 1);
    setView('registry');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'system-ui, sans-serif', color: '#64748b' }}>
        Loading documents…
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flex: 1,
      background: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: 0,
      flexDirection: isDesktop ? 'row' : 'column',
      height: '100%',
    }}>

      {/* ── DESKTOP: Persistent sidebar ── */}
      {isDesktop && (
        <DesktopSidebar
          view={view}
          setView={setView}
          docCount={docs.length}
          currentUser={CURRENT_USER}
          onCategoryClick={c => { setActiveCat(c); setView('registry'); setRegistryKey(k => k + 1); }}
        />
      )}

      {/* ── Right/main column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>

        {/* ── MOBILE: Tab switcher bar (hidden on desktop) ── */}
        {!isDesktop && (
          <div style={{
            display: 'flex', gap: 8, padding: '10px 16px',
            background: '#fff', borderBottom: '1px solid #e2e8f0',
            alignItems: 'center', flexShrink: 0,
          }}>
            <button
              onClick={() => setView('dashboard')}
              style={{
                ...S.btnSec,
                background: view === 'dashboard' ? '#eff6ff' : '#fff',
                borderColor: view === 'dashboard' ? '#bfdbfe' : '#e2e8f0',
                color: view === 'dashboard' ? '#1d4ed8' : '#334155',
              }}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setView('registry')}
              style={{
                ...S.btnSec,
                background: view === 'registry' ? '#eff6ff' : '#fff',
                borderColor: view === 'registry' ? '#bfdbfe' : '#e2e8f0',
                color: view === 'registry' ? '#1d4ed8' : '#334155',
              }}
            >
              📋 Registry ({docs.length})
            </button>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Documents</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>ISO 17025 · Quality</div>
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div
          className={view === 'dashboard' ? 'page-scroll-dashboard' : 'page-scroll-registry'}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflowY: view === 'dashboard' ? 'auto' : 'hidden',
          }}
        >
          {view === 'dashboard' && (
            <DashboardView
              docs={docs}
              activity={activity}
              onGoRegistry={goToRegistry}
              onGoDoc={goToDoc}
            />
          )}
          {view === 'registry' && (
            <RegistryView
              key={registryKey}
              docs={docs}
              onAdd={() => isAdmin && setModal({ type: 'add' })}
              onEdit={doc => isAdmin && setModal({ type: 'edit', doc })}
              onDelete={doc => isAdmin && setModal({ type: 'delete', doc })}
              onAttach={doc => setModal({ type: 'attach', doc })}
              user={CURRENT_USER}
              activeCat={activeCat}
              setActiveCat={setActiveCat}
              initStatus={initStatus}
              initDocId={initDocId}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {(modal?.type === 'add') && (
        <DocFormModal onSave={handleSave} onClose={() => setModal(null)} addToast={addToast} />
      )}
      {modal?.type === 'edit' && (
        <DocFormModal doc={modal.doc} onSave={handleSave} onClose={() => setModal(null)} addToast={addToast} />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDelete doc={modal.doc} onConfirm={handleConfirmDelete} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'attach' && (
        <AttachmentsModal doc={modal.doc} onSave={handleAttachSave} onClose={() => setModal(null)} user={CURRENT_USER} addToast={addToast} />
      )}

      <ToastContainer toasts={toasts} />

      <style>{`
        @supports not (height: 100dvh) {
          div[style*="100dvh"] { min-height: 100vh !important; }
        }
        .page-scroll-dashboard {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 24px;
        }
        .page-scroll-registry {
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 24px;
        }
        @media (max-width: 767px) {
          .page-scroll-dashboard { padding-bottom: 81px !important; }
          .page-scroll-registry  { padding-bottom: 81px !important; }
          .registry-scroll       { padding-bottom: 81px !important; }
          .bottom-spacer         { height: 81px; }
        }
        .registry-scroll { -webkit-overflow-scrolling: touch; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (min-width: 768px) {
          div[data-overlay] { align-items: center !important; padding: 16px !important; }
        }
        tbody tr:hover { background: #fafbfc !important; }
      `}</style>
    </div>
  );
}
