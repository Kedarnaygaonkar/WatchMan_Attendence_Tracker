import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Users, X, UserCheck, UserX, Trash2, Download, Upload, FileSpreadsheet, Check, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

interface Watchman {
  id: string;
  employee_id: string;
  full_name: string;
  phone: string;
  emergency_contact: string;
  address: string;
  joining_date: string;
  status: 'active' | 'inactive' | 'suspended';
  profile_photo_url: string | null;
  active_assignments: number;
  email: string;
  agency_id?: string;
}

const defaultForm = {
  employeeId: '', fullName: '', phone: '',
  address: '',
  joiningDate: new Date().toISOString().split('T')[0], status: 'active' as 'active' | 'inactive' | 'suspended',
  agencyId: '',
};

export default function WatchmenPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editWatchman, setEditWatchman] = useState<Watchman | null>(null);
  const [form, setForm] = useState(defaultForm);
  const { user } = useAuthStore();

  // Import state
  const [importAgencyId, setImportAgencyId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<Array<{ employeeId: string; fullName: string }>>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: agencies } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => {
      const { data } = await api.get('/agencies');
      return data.data;
    },
    enabled: user?.role === 'super_admin',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['watchmen', search, statusFilter, agencyFilter],
    queryFn: async () => {
      const params: any = { search: search || undefined, status: statusFilter || undefined };
      if (user?.role === 'super_admin' && agencyFilter) params.agency_id = agencyFilter;
      const { data } = await api.get('/watchmen', { params });
      return data.data as Watchman[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      if (editWatchman) return api.put(`/watchmen/${editWatchman.id}`, payload);
      return api.post('/watchmen', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchmen'] });
      queryClient.invalidateQueries({ queryKey: ['watchmen-list'] });
      queryClient.invalidateQueries({ queryKey: ['wm-all'] });
      toast.success(editWatchman ? 'Watchman updated!' : 'Watchman added!');
      closeModal();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/watchmen/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchmen'] });
      queryClient.invalidateQueries({ queryKey: ['watchmen-list'] });
      queryClient.invalidateQueries({ queryKey: ['wm-all'] });
      toast.success('Watchman deleted successfully!');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete';
      toast.error(msg);
    },
  });

  const handleDelete = (w: Watchman) => {
    if (window.confirm(`Are you sure you want to delete ${w.full_name}? This will remove all their records.`)) {
      deleteMutation.mutate(w.id);
    }
  };

  function exportWatchmenCSV() {
    if (!data?.length) { toast.error('No watchmen to export'); return; }
    const headers = ['Guard Name', 'Employee ID', 'Mobile Number', 'Status', 'Joining Date', 'Active Assignments', 'Address'];
    const rows = data.map((w) => [
      w.full_name,
      w.employee_id,
      w.phone || '',
      w.status.toUpperCase(),
      w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '',
      w.active_assignments ?? 0,
      w.address || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchmen-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Watchmen report exported!');
  }

  function downloadSampleTemplate(type: 'xlsx' | 'csv' = 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Employee ID', 'Name'],
      ['AS-101', 'Ramesh Patil'],
      ['AS-102', 'Suresh Shinde'],
      ['AS-103', 'Deepak Bhosale'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Watchmen');
    if (type === 'csv') {
      XLSX.writeFile(wb, 'watchmen_sample_template.csv', { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, 'watchmen_sample_template.xlsx', { bookType: 'xlsx' });
    }
    toast.success(`Downloaded sample ${type.toUpperCase()} template!`);
  }

  const parseSelectedFile = async (file: File) => {
    setSelectedFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        toast.error('File has no sheets');
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const objRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const parsed: { employeeId: string; fullName: string }[] = [];

      if (objRows.length > 0) {
        for (const row of objRows) {
          let empId = '';
          let name = '';
          for (const [k, v] of Object.entries(row)) {
            const cleanK = k.toLowerCase().trim().replace(/[\s_-]+/g, '');
            const strV = String(v ?? '').trim();
            if (!strV) continue;
            if (['employeeid', 'empid', 'guardid', 'id', 'empcode', 'code'].includes(cleanK)) {
              empId = strV;
            } else if (['name', 'fullname', 'guardname', 'watchmanname', 'employeename', 'guard'].includes(cleanK)) {
              name = strV;
            }
          }
          if (!empId || !name) {
            const vals = Object.values(row).map(v => String(v ?? '').trim()).filter(Boolean);
            if (vals.length >= 2) {
              if (!empId) empId = vals[0];
              if (!name) name = vals[1];
            }
          }
          if (empId && name) {
            parsed.push({ employeeId: empId, fullName: name });
          }
        }
      }

      if (parsed.length === 0) {
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!Array.isArray(row) || row.length < 2) continue;
          const col0 = String(row[0] ?? '').trim();
          const col1 = String(row[1] ?? '').trim();
          if (!col0 || !col1) continue;
          if (i === 0 && (col0.toLowerCase().includes('id') || col1.toLowerCase().includes('name'))) continue;
          parsed.push({ employeeId: col0, fullName: col1 });
        }
      }

      setPreviewData(parsed);
      if (parsed.length > 0) {
        toast.success(`Found ${parsed.length} watchmen in file!`);
      } else {
        toast.error('No valid rows found. Ensure 2 columns: Employee ID and Name.');
      }
    } catch (err) {
      console.error('Failed to parse file:', err);
      toast.error('Failed to parse file. Please upload a valid Excel or CSV.');
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedFile && previewData.length === 0) {
      toast.error('Please select an Excel or CSV file first');
      return;
    }
    const targetAgencyId = user?.role === 'super_admin' ? (importAgencyId || agencyFilter) : user?.agencyId;
    if (!targetAgencyId) {
      toast.error('Please select an agency to import watchmen into');
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      }
      formData.append('agencyId', targetAgencyId);
      if (previewData.length > 0) {
        formData.append('watchmen', JSON.stringify(previewData));
      }

      const res = await api.post('/watchmen/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(res.data.message || 'Watchmen imported successfully!');
      queryClient.invalidateQueries({ queryKey: ['watchmen'] });
      queryClient.invalidateQueries({ queryKey: ['watchmen-list'] });
      queryClient.invalidateQueries({ queryKey: ['wm-all'] });
      closeImportModal();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to import watchmen');
    } finally {
      setIsImporting(false);
    }
  };

  function openImportModal() {
    setSelectedFile(null);
    setPreviewData([]);
    setImportAgencyId(agencyFilter || '');
    setShowImportModal(true);
  }

  function closeImportModal() {
    setShowImportModal(false);
    setSelectedFile(null);
    setPreviewData([]);
    setDragActive(false);
  }

  function openAdd() {
    setForm(defaultForm);
    setEditWatchman(null);
    setShowModal(true);
  }

  function openEdit(w: Watchman) {
    setForm({
      employeeId: w.employee_id, fullName: w.full_name, phone: w.phone || '',
      address: w.address || '', joiningDate: w.joining_date?.split('T')[0] || '',
      status: w.status,
      agencyId: w.agency_id || '',
    });
    setEditWatchman(w);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditWatchman(null); }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Watchmen</h1>
          <p className="text-slate-500 text-sm">{data?.length ?? 0} guards registered</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportWatchmenCSV} disabled={!data?.length} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button onClick={openImportModal} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 border border-slate-700/60 hover:border-emerald-500/50">
            <Upload className="w-4 h-4 text-emerald-400" /> Import Data
          </button>
          <button onClick={openAdd} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Watchman
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" style={{width:'16px',height:'16px'}} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, phone..." className="input pl-10 w-64" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-40">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        {user?.role === 'super_admin' && (
          <select value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} className="input w-48">
            <option value="">All Agencies</option>
            {agencies?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Employee ID</th>
              <th>Contact</th>
              <th>Joined</th>
              <th>Assignments</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({length: 5}).map((_,i) => (
                <tr key={i}><td colSpan={7}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
              ))
            ) : data?.map(w => (
              <tr key={w.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                      {w.profile_photo_url
                        ? <img src={w.profile_photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                        : <span className="text-sm font-bold text-brand-400">{w.full_name.charAt(0)}</span>
                      }
                    </div>
                    <div>
                      <p className="font-medium">{w.full_name}</p>
                      <p className="text-xs text-slate-500">{w.email}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="font-mono text-xs bg-surface-700 px-2 py-1 rounded">{w.employee_id}</span>
                </td>
                <td className="text-slate-400">{w.phone}</td>
                <td className="text-slate-400 text-sm">
                  {w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '—'}
                </td>
                <td>
                  <span className="badge bg-brand-500/10 text-brand-400 border-brand-500/20">
                    {w.active_assignments} active
                  </span>
                </td>
                <td>
                  <span className={`badge ${w.status === 'active' ? 'badge-present' : 'badge-absent'}`}>
                    {w.status === 'active' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                    {w.status}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(w)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-500 hover:text-slate-300" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(w)} className="p-2 rounded-lg hover:bg-danger-500/10 text-slate-500 hover:text-danger-400 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (!data || data.length === 0) && (
          <div className="text-center py-12 text-slate-600">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No watchmen found</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">{editWatchman ? 'Edit Watchman' : 'Add Watchman'}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Full Name *</label>
                  <input className="input" value={form.fullName} onChange={e => setForm(f => ({...f, fullName: e.target.value}))} placeholder="Ramesh Patil" />
                </div>
                <div className="form-group">
                  <label className="label">Employee ID *</label>
                  <input className="input" value={form.employeeId} onChange={e => setForm(f => ({...f, employeeId: e.target.value}))} placeholder="PSS-001" disabled={!!editWatchman} />
                </div>
                <div className="form-group">
                  <label className="label">Mobile Number (Optional)</label>
                  <input className="input" type="tel" maxLength={10} value={form.phone} onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setForm(f => ({...f, phone: val}));
                  }} placeholder="10-digit mobile number" />
                </div>
                {user?.role === 'super_admin' && (
                  <div className="form-group col-span-2">
                    <label className="label">Assign Agency *</label>
                    <select className="input" value={form.agencyId} onChange={e => setForm(f => ({...f, agencyId: e.target.value}))}>
                      <option value="">Select an Agency</option>
                      {agencies?.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="label">Joining Date</label>
                  <input className="input" type="date" value={form.joiningDate} onChange={e => setForm(f => ({...f, joiningDate: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value as typeof form.status}))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="form-group col-span-2">
                  <label className="label">Home Address</label>
                  <input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Full address" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={closeModal} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending || !form.fullName || !form.employeeId || (!!form.phone && form.phone.length !== 10) || (user?.role === 'super_admin' && !form.agencyId)}
                className="btn-primary px-5 py-2.5 ml-auto"
              >
                {mutation.isPending ? 'Saving...' : editWatchman ? 'Update' : 'Add Watchman'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs">
          <div className="card w-full max-w-lg max-h-[92vh] overflow-y-auto bg-surface-800 border border-surface-700 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-100 text-base">Import Watchmen</h2>
                  <p className="text-xs text-slate-400">Upload Excel (.xlsx, .xls) or CSV</p>
                </div>
              </div>
              <button onClick={closeImportModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Super Admin Agency Selection */}
              {user?.role === 'super_admin' && (
                <div className="form-group">
                  <label className="label">Target Agency *</label>
                  <select
                    className="input"
                    value={importAgencyId}
                    onChange={e => setImportAgencyId(e.target.value)}
                  >
                    <option value="">Select an Agency</option>
                    {agencies?.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">Watchmen will be registered under this agency.</p>
                </div>
              )}

              {/* Requirements & Sample Download Box */}
              <div className="p-3.5 rounded-xl bg-surface-700/40 border border-surface-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-200">Required Columns (2 columns):</p>
                  <p className="text-slate-400">1. <span className="text-brand-400 font-mono">Employee ID</span> &nbsp; 2. <span className="text-brand-400 font-mono">Name</span></p>
                  <p className="text-[11px] text-emerald-400/90 font-medium">✓ Mobile number is not compulsory</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('xlsx')}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-surface-600 transition-colors"
                    title="Download Excel Template"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" /> Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('csv')}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-surface-600 transition-colors"
                    title="Download CSV Template"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" /> CSV
                  </button>
                </div>
              </div>

              {/* Drag and Drop / Upload Box */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) parseSelectedFile(f);
                }}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) parseSelectedFile(f);
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-brand-500 bg-brand-500/10'
                    : selectedFile
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-surface-600 hover:border-brand-500/60 hover:bg-surface-700/20'
                }`}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200 text-sm">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <span className="text-xs text-brand-400 font-medium hover:underline mt-1">Click to change file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center text-slate-400">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200 text-sm">Choose an Excel or CSV file</p>
                      <p className="text-xs text-slate-400 mt-0.5">Drag & drop or click to browse</p>
                    </div>
                    <span className="badge bg-surface-700 text-slate-400 text-[10px] mt-1">.XLSX, .XLS, .CSV</span>
                  </div>
                )}
              </div>

              {/* Preview parsed data */}
              {previewData.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Ready to Import ({previewData.length} guards)
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedFile(null); setPreviewData([]); }}
                      className="text-xs text-slate-500 hover:text-danger-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-40 overflow-y-auto border border-surface-700 rounded-xl bg-surface-900/50">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-700/50 text-slate-400 sticky top-0">
                        <tr>
                          <th className="py-1.5 px-3">#</th>
                          <th className="py-1.5 px-3">Employee ID</th>
                          <th className="py-1.5 px-3">Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-700/50 text-slate-200">
                        {previewData.slice(0, 15).map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-700/20">
                            <td className="py-1.5 px-3 text-slate-500">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-mono font-medium text-brand-400">{row.employeeId}</td>
                            <td className="py-1.5 px-3">{row.fullName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewData.length > 15 && (
                      <p className="p-2 text-center text-[11px] text-slate-400 bg-surface-800">
                        + {previewData.length - 15} more guards...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={closeImportModal} disabled={isImporting} className="btn-ghost px-5 py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={handleImportSubmit}
                disabled={isImporting || previewData.length === 0 || (user?.role === 'super_admin' && !importAgencyId && !agencyFilter)}
                className="btn-primary px-5 py-2.5 ml-auto flex items-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-500 border-none shadow-lg shadow-emerald-600/20"
              >
                {isImporting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Import {previewData.length > 0 ? `${previewData.length} Guards` : 'Data'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
