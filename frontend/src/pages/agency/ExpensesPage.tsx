import { useState, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  WalletCards,
  Plus,
  Trash2,
  Calendar,
  Filter,
  DollarSign,
  Shirt,
  Utensils,
  CreditCard,
  Building2,
  User,
  Printer,
  X,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Receipt,
  Search,
  ChevronRight,
  AlertCircle,
  FileText,
  BadgeIndianRupee,
  RefreshCw,
  Phone,
  ArrowUpRight,
  ShieldCheck,
  Edit2,
  PauseCircle,
  PlayCircle,
  Clock,
  History,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface WatchmanOption {
  _id: string;
  id: string;
  full_name: string;
  employee_id: string;
  phone?: string;
  monthly_wage?: number;
  daily_wage?: number;
  agency_id?: any;
}

interface AgencyOption {
  id: string;
  name: string;
}

interface ExpenseItem {
  _id: string;
  id: string;
  agency_id: any;
  watchman_id: {
    _id: string;
    id: string;
    full_name: string;
    employee_id: string;
    phone?: string;
    monthly_wage?: number;
    daily_wage?: number;
  };
  category: 'monthly_wage' | 'daily_wage' | 'clothes' | 'food' | 'travel' | 'advance' | 'medical' | 'equipment' | 'bonus' | 'other';
  type: 'deduction' | 'earning';
  title: string;
  amount: number;
  date: string;
  notes?: string;
}

interface SalaryHoldItem {
  _id: string;
  id?: string;
  agency_id: any;
  watchman_id: {
    _id: string;
    id?: string;
    full_name: string;
    employee_id: string;
    phone?: string;
  };
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  periodLabel: string;
  dutyDays: number;
  grossSalary: number;
  deductions: number;
  netSalary: number;
  status: 'held' | 'released';
  holdReason: string;
  heldAt: string;
  heldBy?: { name?: string; email?: string };
  releasedAt?: string;
  releasedBy?: { name?: string; email?: string };
  paymentMode?: 'cash' | 'bank_transfer' | 'upi' | 'cheque';
  releaseNotes?: string;
}

function getWatchmanMonthlyWage(w?: { monthly_wage?: number; daily_wage?: number } | null): number {
  if (!w) return 15000;
  if (w.monthly_wage && w.monthly_wage > 0) return w.monthly_wage;
  if (w.daily_wage && w.daily_wage > 0) {
    return w.daily_wage > 2000 ? w.daily_wage : w.daily_wage * 30;
  }
  return 15000;
}

export default function ExpensesPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  const queryClient = useQueryClient();

  // Page Tab: 'expenses' | 'salary_slip'
  const [activeTab, setActiveTab] = useState<'expenses' | 'salary_slip'>('expenses');

  // Filters
  const [selectedAgency, setSelectedAgency] = useState<string>('');
  const [selectedWatchmanId, setSelectedWatchmanId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Date Range (default: 1st of current month to today)
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [showEditWageModal, setShowEditWageModal] = useState(false);
  const [newWageInput, setNewWageInput] = useState<string>('');

  // Salary Hold & Release State
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showHoldsLedger, setShowHoldsLedger] = useState(false);
  const [holdReasonInput, setHoldReasonInput] = useState('Guard left for other city without collecting salary');
  const [targetHoldToRelease, setTargetHoldToRelease] = useState<any>(null);
  const [releasePaymentMode, setReleasePaymentMode] = useState<'cash' | 'bank_transfer' | 'upi' | 'cheque'>('cash');
  const [releaseNotesInput, setReleaseNotesInput] = useState('Guard returned and collected pending salary in full');
  const [releaseDateInput, setReleaseDateInput] = useState(todayStr);

  // Add Expense Form State
  const [formWatchmanId, setFormWatchmanId] = useState('');
  const [formCategory, setFormCategory] = useState<'clothes' | 'food' | 'advance' | 'travel' | 'monthly_wage' | 'daily_wage' | 'medical' | 'equipment' | 'bonus' | 'other'>('clothes');
  const [formType, setFormType] = useState<'deduction' | 'earning'>('deduction');
  const [formTitle, setFormTitle] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(todayStr);
  const [formNotes, setFormNotes] = useState('');
  const [formUpdateMonthlyWage, setFormUpdateMonthlyWage] = useState(false);

  // Salary Slip State (Monthly Wage Override)
  const [slipWageOverride, setSlipWageOverride] = useState<string>('');

  // ── Fetch Agencies (for Super Admin) ──────────────────────────────────
  const { data: agencies = [] } = useQuery<AgencyOption[]>({
    queryKey: ['agencies-list'],
    queryFn: async () => {
      const res = await api.get('/agencies');
      const raw = res.data?.data?.agencies || res.data?.data || [];
      return raw.map((a: any) => ({ id: a.id || a._id, name: a.name }));
    },
    enabled: isSuperAdmin,
  });

  // ── Fetch Watchmen List ───────────────────────────────────────────────
  const { data: watchmen = [] } = useQuery<WatchmanOption[]>({
    queryKey: ['watchmen-list', selectedAgency],
    queryFn: async () => {
      const params: any = { limit: 200 };
      if (isSuperAdmin && selectedAgency) params.agency_id = selectedAgency;
      const res = await api.get('/watchmen', { params });
      const raw = res.data?.data?.watchmen || res.data?.data || [];
      return raw.map((w: any) => ({
        _id: w._id || w.id,
        id: w.id || w._id,
        full_name: w.full_name,
        employee_id: w.employee_id,
        phone: w.phone,
        monthly_wage: w.monthly_wage || (w.daily_wage ? (w.daily_wage > 2000 ? w.daily_wage : w.daily_wage * 30) : 15000),
        daily_wage: w.daily_wage || 500,
        agency_id: w.agency_id,
      }));
    },
  });

  // ── Fetch Expenses ────────────────────────────────────────────────────
  const { data: expensesData, isLoading: expensesLoading, refetch: refetchExpenses } = useQuery({
    queryKey: ['expenses', selectedAgency, selectedWatchmanId, selectedCategory, startDate, endDate],
    queryFn: async () => {
      const params: any = {};
      if (isSuperAdmin && selectedAgency) params.agency_id = selectedAgency;
      if (selectedWatchmanId) params.watchman_id = selectedWatchmanId;
      if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/expenses', { params });
      return res.data?.data || { expenses: [], summary: {} };
    },
  });

  const expensesList: ExpenseItem[] = expensesData?.expenses || [];
  const expensesSummary = expensesData?.summary || {
    totalCount: 0,
    totalDeductions: 0,
    totalEarnings: 0,
    clothesTotal: 0,
    foodTotal: 0,
    advanceTotal: 0,
  };

  // ── Fetch Salary Slip ─────────────────────────────────────────────────
  const {
    data: salarySlipData,
    isLoading: slipLoading,
    refetch: refetchSlip,
  } = useQuery({
    queryKey: ['salary-slip', selectedWatchmanId, startDate, endDate, slipWageOverride],
    queryFn: async () => {
      if (!selectedWatchmanId) return null;
      const params: any = {
        watchman_id: selectedWatchmanId,
        startDate,
        endDate,
      };
      if (slipWageOverride) params.monthlyWageOverride = slipWageOverride;

      const res = await api.get('/expenses/salary-slip', { params });
      return res.data?.data || null;
    },
    enabled: Boolean(selectedWatchmanId && (activeTab === 'salary_slip' || showSlipModal)),
  });

  // ── Add Expense Mutation ──────────────────────────────────────────────
  const addExpenseMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/expenses', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Expense recorded successfully');
      setShowAddModal(false);
      resetAddForm();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to record expense');
    },
  });

  // ── Delete Expense Mutation ───────────────────────────────────────────
  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/expenses/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Expense entry deleted');
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete expense');
    },
  });

  // ── Update Monthly Wage Mutation ──────────────────────────────────────
  const updateWageMutation = useMutation({
    mutationFn: async ({ watchmanId, monthly_wage }: { watchmanId: string; monthly_wage: number }) => {
      const res = await api.patch(`/expenses/watchman/${watchmanId}/wage`, { monthly_wage });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Monthly wage updated successfully');
      setShowEditWageModal(false);
      queryClient.invalidateQueries({ queryKey: ['watchmen-list'] });
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update monthly wage');
    },
  });

  // ── Fetch Salary Holds for Watchman ───────────────────────────────────
  const { data: salaryHoldsData, refetch: refetchSalaryHolds } = useQuery({
    queryKey: ['salary-holds', selectedWatchmanId],
    queryFn: async () => {
      if (!selectedWatchmanId) {
        return {
          holds: [],
          summary: { totalHeldAmount: 0, heldCount: 0, releasedCount: 0, totalCount: 0 },
        };
      }
      const res = await api.get('/expenses/salary-holds', {
        params: { watchman_id: selectedWatchmanId },
      });
      return res.data?.data || { holds: [], summary: { totalHeldAmount: 0, heldCount: 0, releasedCount: 0, totalCount: 0 } };
    },
    enabled: Boolean(selectedWatchmanId),
  });

  const watchmanSalaryHolds: SalaryHoldItem[] = salaryHoldsData?.holds || [];
  const holdsSummary = salaryHoldsData?.summary || { totalHeldAmount: 0, heldCount: 0, releasedCount: 0, totalCount: 0 };

  // ── Hold Salary Mutation ──────────────────────────────────────────────
  const holdSalaryMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/expenses/salary-hold', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Salary placed on hold');
      setShowHoldModal(false);
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
      queryClient.invalidateQueries({ queryKey: ['salary-holds'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to place salary on hold');
    },
  });

  // ── Release Salary Hold Mutation ──────────────────────────────────────
  const releaseHoldMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.put(`/expenses/salary-hold/${id}/release`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Held salary released and disbursed!');
      setShowReleaseModal(false);
      setTargetHoldToRelease(null);
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
      queryClient.invalidateQueries({ queryKey: ['salary-holds'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to release held salary');
    },
  });

  // ── Cancel/Delete Salary Hold Mutation ────────────────────────────────
  const cancelHoldMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/expenses/salary-hold/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Salary hold record removed');
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
      queryClient.invalidateQueries({ queryKey: ['salary-holds'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to remove salary hold');
    },
  });

  // ── Re-Hold Salary Mutation (Put already released salary back on hold) ──
  const reHoldSalaryMutation = useMutation({
    mutationFn: async ({ id, holdReason }: { id: string; holdReason?: string }) => {
      const res = await api.put(`/expenses/salary-hold/${id}/re-hold`, { holdReason });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Salary placed back on hold');
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
      queryClient.invalidateQueries({ queryKey: ['salary-holds'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to place salary back on hold');
    },
  });

  function openReleaseModal(hold: any) {
    setTargetHoldToRelease(hold);
    setReleasePaymentMode('cash');
    setReleaseNotesInput('Guard returned from other city and collected pending salary in full');
    setReleaseDateInput(todayStr);
    setShowReleaseModal(true);
  }

  function resetAddForm() {
    setFormWatchmanId(selectedWatchmanId || '');
    setFormCategory('clothes');
    setFormType('deduction');
    setFormTitle('');
    setFormAmount('');
    setFormDate(todayStr);
    setFormNotes('');
    setFormUpdateMonthlyWage(false);
  }

  function handleOpenAddModal(categoryPreset?: 'clothes' | 'food' | 'advance' | 'monthly_wage' | 'daily_wage') {
    resetAddForm();
    if (categoryPreset) {
      setFormCategory(categoryPreset);
      if (categoryPreset === 'clothes') setFormTitle('Uniform & Clothing Expense');
      else if (categoryPreset === 'food') setFormTitle('Food / Mess Charges');
      else if (categoryPreset === 'advance') setFormTitle('Salary Advance');
      else if (categoryPreset === 'monthly_wage' || categoryPreset === 'daily_wage') {
        setFormTitle('Monthly Wage Base Rate');
        setFormType('earning');
        setFormUpdateMonthlyWage(true);
      }
    }
    if (selectedWatchmanId) {
      setFormWatchmanId(selectedWatchmanId);
    }
    setShowAddModal(true);
  }

  function handleSubmitExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!formWatchmanId) {
      toast.error('Please select a watchman');
      return;
    }
    if (!formTitle.trim()) {
      toast.error('Please enter a title or item description');
      return;
    }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    addExpenseMutation.mutate({
      watchman_id: formWatchmanId,
      category: formCategory,
      type: formType,
      title: formTitle,
      amount: amt,
      date: formDate,
      notes: formNotes,
      updateWatchmanMonthlyWage: formUpdateMonthlyWage,
    });
  }

  // Active Selected Watchman info
  const selectedWatchman = watchmen.find((w) => w._id === selectedWatchmanId || w.id === selectedWatchmanId);

  // Filtered expenses by search text
  const filteredExpenses = expensesList.filter((exp) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const wName = exp.watchman_id?.full_name?.toLowerCase() || '';
    const wEmp = exp.watchman_id?.employee_id?.toLowerCase() || '';
    const title = exp.title?.toLowerCase() || '';
    const notes = exp.notes?.toLowerCase() || '';
    return wName.includes(q) || wEmp.includes(q) || title.includes(q) || notes.includes(q);
  });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'clothes':
        return { label: 'Clothes / Uniform', icon: Shirt, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'food':
        return { label: 'Food & Mess', icon: Utensils, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      case 'advance':
        return { label: 'Salary Advance', icon: CreditCard, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
      case 'monthly_wage':
        return { label: 'Monthly Wage Rate', icon: DollarSign, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'daily_wage':
        return { label: 'Wage Rate Adjustment', icon: DollarSign, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'travel':
        return { label: 'Travel / Transport', icon: ArrowUpRight, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
      case 'bonus':
        return { label: 'Bonus / Incentive', icon: TrendingUp, color: 'text-green-400 bg-green-500/10 border-green-500/30' };
      default:
        return { label: 'Other', icon: Receipt, color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' };
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-800/50 p-5 rounded-2xl border border-surface-700/60 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-glow">
              <WalletCards className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-100 flex items-center gap-2">
                Expense Tracker & Payroll
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  HR Portal
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Track guard monthly wages, clothes, food expenses, and generate attendance-verified salary slips.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Expense / Advance
          </button>

          <button
            onClick={() => {
              if (!selectedWatchmanId) {
                toast('Please select a watchman to generate their salary slip', { icon: 'ℹ️' });
              }
              setActiveTab('salary_slip');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95"
          >
            <Receipt className="w-4 h-4" />
            Salary Slip Generator
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-surface-800 pb-2">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'expenses'
              ? 'bg-surface-800 text-slate-100 border border-surface-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/40'
          }`}
        >
          <Receipt className="w-4 h-4 text-emerald-400" />
          <span>Expenses & Deductions</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-700 text-slate-300">
            {expensesSummary.totalCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('salary_slip')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'salary_slip'
              ? 'bg-surface-800 text-slate-100 border border-surface-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/40'
          }`}
        >
          <FileText className="w-4 h-4 text-brand-400" />
          <span>Salary Slip & Verified Dates</span>
          {selectedWatchman && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
              {selectedWatchman.full_name}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <div className="bg-surface-800/60 p-4 rounded-2xl border border-surface-700/60 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Agency Filter (Super Admin only) */}
          {isSuperAdmin && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Security Agency</label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedAgency}
                  onChange={(e) => {
                    setSelectedAgency(e.target.value);
                    setSelectedWatchmanId('');
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="">All Agencies</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Watchman Filter */}
          <div className={isSuperAdmin ? '' : 'sm:col-span-2'}>
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Watchman / Guard</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedWatchmanId}
                onChange={(e) => {
                  setSelectedWatchmanId(e.target.value);
                  setSlipWageOverride('');
                }}
                className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-brand-500 font-medium"
              >
                <option value="">-- All Watchmen --</option>
                {watchmen.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.full_name} ({w.employee_id}) — Base ₹{getWatchmanMonthlyWage(w).toLocaleString('en-IN')}/month
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">End Date</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Quick presets & Category filter */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-surface-700/40 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-medium">Quick Date:</span>
            <button
              onClick={() => {
                setStartDate(firstDayOfMonth);
                setEndDate(todayStr);
              }}
              className="px-2.5 py-1 rounded-lg bg-surface-700/60 hover:bg-surface-700 text-slate-300 transition-colors"
            >
              This Month
            </button>
            <button
              onClick={() => {
                const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const prevMEnd = new Date(now.getFullYear(), now.getMonth(), 0);
                setStartDate(prevM.toISOString().split('T')[0]);
                setEndDate(prevMEnd.toISOString().split('T')[0]);
              }}
              className="px-2.5 py-1 rounded-lg bg-surface-700/60 hover:bg-surface-700 text-slate-300 transition-colors"
            >
              Last Month
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 15);
                setStartDate(d.toISOString().split('T')[0]);
                setEndDate(todayStr);
              }}
              className="px-2.5 py-1 rounded-lg bg-surface-700/60 hover:bg-surface-700 text-slate-300 transition-colors"
            >
              Last 15 Days
            </button>
          </div>

          {activeTab === 'expenses' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1 bg-surface-900 border border-surface-700 rounded-lg text-slate-200 text-xs focus:outline-none"
              >
                <option value="all">All Categories</option>
                <option value="clothes">Uniform & Clothes</option>
                <option value="food">Food & Mess</option>
                <option value="advance">Salary Advance</option>
                <option value="monthly_wage">Monthly Wage Adjustments</option>
                <option value="daily_wage">Wage Adjustments</option>
                <option value="travel">Travel / Transport</option>
                <option value="bonus">Bonus / Incentive</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Selected Watchman Highlight Banner ─────────────────── */}
      {selectedWatchman && (
        <div className="p-4 bg-gradient-to-r from-surface-800 to-surface-800/80 rounded-2xl border border-surface-700/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/20 text-brand-300 border border-brand-500/30 flex items-center justify-center font-bold text-lg">
              {selectedWatchman.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-slate-100">{selectedWatchman.full_name}</h3>
                <span className="px-2 py-0.5 rounded text-xs bg-surface-700 text-slate-300 font-mono">
                  {selectedWatchman.employee_id}
                </span>
                {selectedWatchman.phone && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {selectedWatchman.phone}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                  <BadgeIndianRupee className="w-3.5 h-3.5" />
                  Base Monthly Wage: ₹{getWatchmanMonthlyWage(selectedWatchman).toLocaleString('en-IN')} / month
                </span>
                <button
                  onClick={() => {
                    setNewWageInput(String(getWatchmanMonthlyWage(selectedWatchman)));
                    setShowEditWageModal(true);
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 underline flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit Monthly Wage
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleOpenAddModal('clothes')}
              className="px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-600 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Shirt className="w-3.5 h-3.5" />
              + Clothes
            </button>
            <button
              onClick={() => handleOpenAddModal('food')}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-600 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Utensils className="w-3.5 h-3.5" />
              + Food/Mess
            </button>
            <button
              onClick={() => handleOpenAddModal('advance')}
              className="px-3 py-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-600 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5" />
              + Advance
            </button>
            <button
              onClick={() => {
                setActiveTab('salary_slip');
                setShowSlipModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Receipt className="w-3.5 h-3.5" />
              View Salary Slip
            </button>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* TAB 1: EXPENSES & DEDUCTIONS                             */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Deductions */}
            <div className="bg-surface-800/80 p-4 rounded-2xl border border-surface-700/60 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Deductions</span>
                <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <TrendingDown className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-100 mt-2">
                ₹{expensesSummary.totalDeductions.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-rose-400/80 mt-1">Expenses incurred by agency</p>
            </div>

            {/* Clothes / Uniform Spent */}
            <div className="bg-surface-800/80 p-4 rounded-2xl border border-surface-700/60 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Clothes & Uniform</span>
                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Shirt className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-100 mt-2">
                ₹{expensesSummary.clothesTotal.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-purple-400/80 mt-1">Uniform, boots, accessories</p>
            </div>

            {/* Food & Mess Expenses */}
            <div className="bg-surface-800/80 p-4 rounded-2xl border border-surface-700/60 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Food & Eating / Mess</span>
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Utensils className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-100 mt-2">
                ₹{expensesSummary.foodTotal.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-amber-400/80 mt-1">Mess charges, daily meals</p>
            </div>

            {/* Salary Advances Given */}
            <div className="bg-surface-800/80 p-4 rounded-2xl border border-surface-700/60 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Salary Advances</span>
                <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <CreditCard className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-slate-100 mt-2">
                ₹{expensesSummary.advanceTotal.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-blue-400/80 mt-1">Cash advances to guards</p>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="bg-surface-800/60 rounded-2xl border border-surface-700/60 overflow-hidden shadow-sm">
            {/* Table Search & Controls */}
            <div className="p-4 border-b border-surface-700/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by guard name, ID, or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-surface-900 border border-surface-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-brand-500 placeholder-slate-500"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 w-full sm:w-auto justify-between sm:justify-end">
                <span>
                  Showing <strong className="text-slate-200">{filteredExpenses.length}</strong> entries
                </span>
                <button
                  onClick={() => refetchExpenses()}
                  className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {expensesLoading ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
                <p className="text-sm">Loading expenses...</p>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-surface-700/50 flex items-center justify-center text-slate-500">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-300">No expenses recorded for this selection</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click "Add Expense / Advance" above to log uniform, food, or advance expenses.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenAddModal()}
                  className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow"
                >
                  + Record First Expense
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-surface-900/50 text-xs uppercase tracking-wider text-slate-400 border-b border-surface-700/60 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Watchman</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Item Description</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Amount (₹)</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/40">
                    {filteredExpenses.map((exp) => {
                      const badge = getCategoryBadge(exp.category);
                      const Icon = badge.icon;
                      const dateObj = new Date(exp.date);
                      const formattedDate = dateObj.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      });

                      return (
                        <tr key={exp._id} className="hover:bg-surface-700/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400 font-mono">
                            {formattedDate}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-100 text-sm">
                              {exp.watchman_id?.full_name || 'Guard'}
                            </div>
                            <span className="text-xs text-slate-500 font-mono">
                              {exp.watchman_id?.employee_id || ''}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${badge.color}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-200">{exp.title}</p>
                            {exp.notes && (
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{exp.notes}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {exp.type === 'deduction' ? (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                Deduction
                              </span>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Allowance / Earning
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-sm">
                            <span className={exp.type === 'deduction' ? 'text-rose-400' : 'text-emerald-400'}>
                              {exp.type === 'deduction' ? '-' : '+'}₹{Number(exp.amount).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete expense "${exp.title}" of ₹${exp.amount}?`)) {
                                  deleteExpenseMutation.mutate(exp._id);
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* TAB 2: SALARY SLIP & VERIFIED PRESENT DATES              */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'salary_slip' && (
        <div className="space-y-6">
          {!selectedWatchmanId ? (
            <div className="bg-surface-800/50 p-12 rounded-2xl border border-surface-700/60 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Receipt className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Select a Watchman to Generate Salary Slip</h3>
              <p className="text-sm text-slate-400 max-w-md">
                Choose a guard from the dropdown above and specify the date range. The system will retrieve all
                verified attendance dates, calculate prorated monthly wages, subtract recorded expenses, and generate
                an official salary slip.
              </p>
              <div className="mt-2 w-full max-w-sm">
                <select
                  value={selectedWatchmanId}
                  onChange={(e) => setSelectedWatchmanId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface-900 border border-brand-500/50 rounded-xl text-slate-100 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="">-- Choose Watchman --</option>
                  {watchmen.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.full_name} ({w.employee_id}) — Base ₹{getWatchmanMonthlyWage(w).toLocaleString('en-IN')}/month
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : slipLoading ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-surface-800/40 rounded-2xl border border-surface-700/50">
              <RefreshCw className="w-8 h-8 animate-spin text-brand-400" />
              <p className="text-sm font-medium">Calculating verified attendance & expenses...</p>
            </div>
          ) : !salarySlipData ? (
            <div className="p-8 text-center text-slate-400 bg-surface-800/40 rounded-2xl border border-surface-700/50">
              <p className="font-semibold text-slate-300">Unable to load salary data</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Alert: Returning guard with prior pending held salary arrears */}
              {salarySlipData.totalPendingHeldArrears > 0 && (
                <div className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/15 border-2 border-amber-500/40 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-amber-200 text-sm">
                          Held Salary Backlog Detected for Returned Guard
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">
                          {salarySlipData.priorPendingHolds?.length} Month(s) Pending Arrears
                        </span>
                      </div>
                      <p className="text-xs text-amber-200/90 mt-1">
                        This guard has <strong className="text-amber-100 font-mono">₹{salarySlipData.totalPendingHeldArrears.toLocaleString('en-IN')}</strong> in held salary from previous months (e.g. left for hometown without collecting salary). Now that the guard has returned, you can release and disburse their held backlog below.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => setShowHoldsLedger(true)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-surface-950 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow"
                    >
                      <History className="w-4 h-4" />
                      View Backlog ({salarySlipData.priorPendingHolds?.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Status Banner for Currently Selected Month's Hold Status */}
              {salarySlipData.holdStatus && (
                <div className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md ${
                  salarySlipData.holdStatus.status === 'held'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      salarySlipData.holdStatus.status === 'held'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {salarySlipData.holdStatus.status === 'held' ? (
                        <PauseCircle className="w-5 h-5 text-amber-400 animate-pulse" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-black tracking-wide border shadow-sm ${
                          salarySlipData.holdStatus.status === 'held'
                            ? 'bg-amber-500 text-slate-950 border-amber-600'
                            : 'bg-emerald-600 text-white border-emerald-700'
                        }`}>
                          {salarySlipData.holdStatus.status === 'held'
                            ? '⏸️ SALARY ON HOLD'
                            : `✅ RELEASED & DISBURSED (${salarySlipData.holdStatus.paymentMode?.toUpperCase() || 'CASH'})`}
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                          {salarySlipData.holdStatus.status === 'held'
                            ? `Held on ${new Date(salarySlipData.holdStatus.heldAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : `Disbursed on ${new Date(salarySlipData.holdStatus.releasedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 mt-1 font-medium">
                        {salarySlipData.holdStatus.status === 'held' ? (
                          <>Reason: <span className="text-amber-800 dark:text-amber-300 font-bold">"{salarySlipData.holdStatus.holdReason}"</span></>
                        ) : (
                          <>Remarks: <span className="text-emerald-800 dark:text-emerald-300 font-bold">"{salarySlipData.holdStatus.releaseNotes}"</span></>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {salarySlipData.holdStatus.status === 'held' ? (
                      <>
                        <button
                          onClick={() => openReleaseModal(salarySlipData.holdStatus)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                        >
                          <PlayCircle className="w-4 h-4" />
                          Release & Pay Salary
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to cancel this salary hold?')) {
                              cancelHoldMutation.mutate(salarySlipData.holdStatus.id);
                            }
                          }}
                          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-xl text-xs transition-colors"
                          title="Cancel Hold"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-emerald-900 bg-emerald-100 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-600 font-bold px-3 py-1.5 rounded-xl shadow-sm">
                          Payment Disbursed to Guard
                        </span>
                        <button
                          onClick={() => {
                            const reason = window.prompt(
                              'Reason for putting this salary back on hold:',
                              'Guard left again without collecting or payment reverted'
                            );
                            if (reason !== null) {
                              reHoldSalaryMutation.mutate({
                                id: salarySlipData.holdStatus.id,
                                holdReason: reason,
                              });
                            }
                          }}
                          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-600 rounded-xl text-xs font-black shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                          title="Put this disbursed salary back on hold"
                        >
                          <PauseCircle className="w-3.5 h-3.5 text-slate-950" />
                          Put Back on Hold
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Slip Generation Control & Wage Override */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-800/70 p-4 rounded-2xl border border-surface-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-300 border border-brand-500/30 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">
                      Salary Slip for {salarySlipData.watchman?.full_name}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Period: {salarySlipData.period?.startDate} to {salarySlipData.period?.endDate} (
                      {salarySlipData.attendanceSummary?.totalDays} total days)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Monthly Wage (₹):</span>
                    <input
                      type="number"
                      placeholder={String(salarySlipData.financials?.monthlyWageRate || salarySlipData.watchman?.monthly_wage || 15000)}
                      value={slipWageOverride}
                      onChange={(e) => setSlipWageOverride(e.target.value)}
                      className="w-28 px-2.5 py-1.5 bg-surface-900 border border-surface-700 rounded-xl text-slate-100 text-xs font-mono font-bold focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  {/* Hold / Release Action Buttons */}
                  {salarySlipData.holdStatus?.status === 'held' ? (
                    <button
                      onClick={() => openReleaseModal(salarySlipData.holdStatus)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all active:scale-95"
                    >
                      <PlayCircle className="w-4 h-4" />
                      Release & Pay
                    </button>
                  ) : salarySlipData.holdStatus?.status === 'released' ? (
                    <button
                      onClick={() => {
                        const reason = window.prompt(
                          'Reason for putting this salary back on hold:',
                          'Guard left again without collecting or payment reverted'
                        );
                        if (reason !== null) {
                          reHoldSalaryMutation.mutate({
                            id: salarySlipData.holdStatus.id,
                            holdReason: reason,
                          });
                        }
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition-all active:scale-95 border border-amber-600"
                      title="Put this disbursed salary back on hold"
                    >
                      <PauseCircle className="w-4 h-4 text-slate-950" />
                      Put Back on Hold
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setHoldReasonInput('Guard left for other city without collecting salary');
                        setShowHoldModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition-all active:scale-95 border border-amber-600"
                      title="Put this month's salary on hold if guard has gone to another city without collecting"
                    >
                      <PauseCircle className="w-4 h-4 text-slate-950" />
                      Put Salary on Hold
                    </button>
                  )}

                  {/* Toggle Holds Ledger */}
                  <button
                    onClick={() => setShowHoldsLedger(!showHoldsLedger)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                      showHoldsLedger
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-surface-700 dark:text-indigo-200 dark:border-surface-600'
                    }`}
                  >
                    <History className={`w-4 h-4 ${showHoldsLedger ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
                    Held Backlogs ({watchmanSalaryHolds.length})
                  </button>

                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    Print / Download Slip
                  </button>
                </div>
              </div>

              {/* Held Salaries & Backlog Ledger Section */}
              {showHoldsLedger && (
                <div className="bg-surface-800/80 p-5 rounded-2xl border border-surface-700/70 space-y-4 shadow-lg animate-in fade-in duration-200">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-surface-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                        <History className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-100 text-sm">
                          Held Salaries & Backlog Ledger — {salarySlipData.watchman?.full_name}
                        </h4>
                        <p className="text-xs text-slate-400">
                          Complete audit trail of salaries held while guard was away, ready to release upon return
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-600 font-bold shadow-sm">
                        Pending Held: {holdsSummary.heldCount} (₹{holdsSummary.totalHeldAmount?.toLocaleString('en-IN')})
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-600 font-bold shadow-sm">
                        Released: {holdsSummary.releasedCount}
                      </span>
                    </div>
                  </div>

                  {watchmanSalaryHolds.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No held salary records for this watchman yet. Click "Put Salary on Hold" to hold a month's salary.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-surface-900/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-surface-700/60">
                          <tr>
                            <th className="px-3 py-2.5">Period</th>
                            <th className="px-3 py-2.5">Duty Days</th>
                            <th className="px-3 py-2.5">Held Reason</th>
                            <th className="px-3 py-2.5 text-right">Net Amount</th>
                            <th className="px-3 py-2.5 text-center">Status</th>
                            <th className="px-3 py-2.5">Held Date</th>
                            <th className="px-3 py-2.5">Disbursement Details</th>
                            <th className="px-3 py-2.5 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-700/40">
                          {watchmanSalaryHolds.map((h: any) => (
                            <tr key={h._id} className="hover:bg-surface-700/20 transition-colors">
                              <td className="px-3 py-2.5 font-bold text-slate-100 whitespace-nowrap">
                                {h.periodLabel}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="font-mono">{h.dutyDays}</span> Days
                              </td>
                              <td className="px-3 py-2.5 max-w-xs text-slate-300">
                                {h.holdReason}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right font-mono font-bold text-slate-100">
                                ₹{Number(h.netSalary).toLocaleString('en-IN')}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                {h.status === 'held' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500 text-slate-950 border border-amber-600 shadow-sm">
                                    <PauseCircle className="w-3.5 h-3.5 text-slate-950" />
                                    Held
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white border border-emerald-700 shadow-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                    Disbursed
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                                {new Date(h.heldAt).toLocaleDateString('en-IN')}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                                {h.status === 'released' ? (
                                  <div>
                                    <span className="font-semibold text-emerald-300 uppercase">
                                      {h.paymentMode || 'Cash'}
                                    </span>
                                    <span className="text-slate-500 ml-1.5 font-mono">
                                      ({new Date(h.releasedAt).toLocaleDateString('en-IN')})
                                    </span>
                                    {h.releaseNotes && (
                                      <p className="text-[10px] text-slate-400 line-clamp-1">{h.releaseNotes}</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 italic">Awaiting guard return</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {h.status === 'held' ? (
                                    <button
                                      onClick={() => openReleaseModal(h)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow transition-all active:scale-95 flex items-center gap-1"
                                      title="Release and pay salary to guard"
                                    >
                                      <PlayCircle className="w-3.5 h-3.5" />
                                      Release & Pay
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-mono font-bold bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-600">
                                        Paid ✓
                                      </span>
                                      <button
                                        onClick={() => {
                                          const reason = window.prompt(
                                            `Reason for putting ${h.periodLabel} salary back on hold:`,
                                            'Guard left again without collecting or payment reverted'
                                          );
                                          if (reason !== null) {
                                            reHoldSalaryMutation.mutate({
                                              id: h._id,
                                              holdReason: reason,
                                            });
                                          }
                                        }}
                                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[11px] shadow-sm transition-all active:scale-95 flex items-center gap-1 border border-amber-600"
                                        title="Put this salary back on hold"
                                      >
                                        <PauseCircle className="w-3.5 h-3.5 text-slate-950" />
                                        Re-Hold
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Delete hold record for ${h.periodLabel}?`)) {
                                        cancelHoldMutation.mutate(h._id);
                                      }
                                    }}
                                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                                    title="Delete record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 1. Verified Present Dates Section */}
              <div className="bg-surface-800/60 p-5 rounded-2xl border border-surface-700/60 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-slate-100 text-sm sm:text-base">
                      Verified Present Dates ({salarySlipData.attendanceSummary?.presentDaysCount} Days on Duty)
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-600 font-bold shadow-sm">
                      Present: {salarySlipData.attendanceSummary?.presentDaysCount} Days
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-950 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-600 font-bold shadow-sm">
                      Absent / Off: {salarySlipData.attendanceSummary?.absentDaysCount} Days
                    </span>
                    <span className="text-slate-400">
                      Attendance: <strong>{salarySlipData.attendanceSummary?.attendanceRate}%</strong>
                    </span>
                  </div>
                </div>

                {salarySlipData.presentDates?.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-surface-900/50 rounded-xl border border-surface-800">
                    <p className="text-sm">No attendance records found for this date range.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Wages can only be calculated on verified present dates.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-400 mb-3">
                      Below is the exact list of dates when this watchman was present and verified via QR/GPS scan:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {salarySlipData.presentDates?.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-surface-900/80 hover:bg-surface-900 border border-emerald-500/30 rounded-xl text-xs transition-all shadow-sm"
                        >
                          <div className="flex items-center justify-between font-mono font-bold text-slate-200">
                            <span>{item.date}</span>
                            <span className="text-[10px] text-emerald-400 uppercase font-semibold">
                              {item.dayOfWeek}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 truncate">
                            {item.societyName}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between">
                            <span>In: {item.checkInTime}</span>
                            <span className="text-emerald-400 font-semibold">✓</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Salary Breakdown (Earnings vs Deductions) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Earnings Card */}
                <div className="bg-surface-800/60 p-5 rounded-2xl border border-emerald-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-surface-700/60">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                        <h4 className="font-bold text-slate-100 text-sm">Earnings / Wages</h4>
                      </div>
                      <span className="text-xs text-emerald-950 bg-emerald-100 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-600 font-bold px-2.5 py-0.5 rounded-lg shadow-sm">
                        Credit
                      </span>
                    </div>

                    <div className="space-y-3 mt-4 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-200">
                            Earned Monthly Wage
                          </p>
                          <p className="text-xs text-slate-400">
                            {salarySlipData.attendanceSummary?.presentDaysCount} Present Days of {salarySlipData.attendanceSummary?.totalDays} Days (Base ₹{salarySlipData.financials?.monthlyWageRate?.toLocaleString('en-IN')}/mo)
                          </p>
                        </div>
                        <span className="font-mono font-bold text-slate-100">
                          ₹{salarySlipData.financials?.earnedBasicWage.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {salarySlipData.financials?.earnings?.items?.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{item.title}</span>
                          <span className="font-mono text-emerald-400 font-semibold">
                            +₹{Number(item.amount).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 mt-6 border-t border-surface-700/60 flex items-center justify-between">
                    <span className="font-bold text-slate-300 text-sm">Gross Earnings</span>
                    <span className="font-mono font-black text-emerald-400 text-lg">
                      ₹{salarySlipData.financials?.grossSalary.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Deductions Card */}
                <div className="bg-surface-800/60 p-5 rounded-2xl border border-rose-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-surface-700/60">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-rose-400" />
                        <h4 className="font-bold text-slate-100 text-sm">Agency Expenses & Deductions</h4>
                      </div>
                      <span className="text-xs text-rose-950 bg-rose-100 border border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-600 font-bold px-2.5 py-0.5 rounded-lg shadow-sm">
                        Debit
                      </span>
                    </div>

                    <div className="space-y-3 mt-4 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shirt className="w-4 h-4 text-purple-400" />
                          <span className="text-slate-300">Uniform & Clothes Expenses</span>
                        </div>
                        <span className="font-mono font-semibold text-rose-300">
                          -₹{salarySlipData.financials?.deductions?.clothesTotal.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Utensils className="w-4 h-4 text-amber-400" />
                          <span className="text-slate-300">Food & Eating / Mess Charges</span>
                        </div>
                        <span className="font-mono font-semibold text-rose-300">
                          -₹{salarySlipData.financials?.deductions?.foodTotal.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-blue-400" />
                          <span className="text-slate-300">Salary Advances Given</span>
                        </div>
                        <span className="font-mono font-semibold text-rose-300">
                          -₹{salarySlipData.financials?.deductions?.advanceTotal.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {salarySlipData.financials?.deductions?.otherDeductionsTotal > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300">Other Miscellaneous Deductions</span>
                          <span className="font-mono font-semibold text-rose-300">
                            -₹{salarySlipData.financials?.deductions?.otherDeductionsTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-6 border-t border-surface-700/60 flex items-center justify-between">
                    <span className="font-bold text-slate-300 text-sm">Total Deductions</span>
                    <span className="font-mono font-black text-rose-400 text-lg">
                      -₹{salarySlipData.financials?.deductions?.totalDeductions.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Net Payable Banner */}
              <div className={`p-6 rounded-2xl border-2 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-glow ${
                salarySlipData.holdStatus?.status === 'held'
                  ? 'bg-gradient-to-r from-amber-950/60 via-surface-800 to-amber-950/40 border-amber-500/60'
                  : 'bg-gradient-to-r from-emerald-950/60 via-surface-800 to-emerald-950/40 border-emerald-500/50'
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs uppercase tracking-wider font-bold ${
                      salarySlipData.holdStatus?.status === 'held' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {salarySlipData.holdStatus?.status === 'held'
                        ? '⏸️ Net Salary on Hold (Backlog Tracked)'
                        : 'Net Salary Disbursable'}
                    </span>
                    {salarySlipData.holdStatus?.status === 'held' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Awaiting Guard Return
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className={`text-3xl sm:text-4xl font-black font-mono ${
                      salarySlipData.holdStatus?.status === 'held' ? 'text-amber-300' : 'text-emerald-300'
                    }`}>
                      ₹{salarySlipData.financials?.netSalary.toLocaleString('en-IN')}
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">
                      (Gross ₹{salarySlipData.financials?.grossSalary.toLocaleString('en-IN')} - Deductions ₹
                      {salarySlipData.financials?.deductions?.totalDeductions.toLocaleString('en-IN')})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {salarySlipData.holdStatus?.status === 'held' ? (
                    <button
                      onClick={() => openReleaseModal(salarySlipData.holdStatus)}
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      <PlayCircle className="w-5 h-5" />
                      Release & Pay Now
                    </button>
                  ) : salarySlipData.holdStatus?.status === 'released' ? (
                    <button
                      onClick={() => {
                        const reason = window.prompt(
                          'Reason for putting this salary back on hold:',
                          'Guard left again without collecting or payment reverted'
                        );
                        if (reason !== null) {
                          reHoldSalaryMutation.mutate({
                            id: salarySlipData.holdStatus.id,
                            holdReason: reason,
                          });
                        }
                      }}
                      className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 flex items-center gap-2 border border-amber-600 shadow"
                      title="Put this disbursed salary back on hold"
                    >
                      <PauseCircle className="w-4 h-4 text-slate-950" />
                      Put Back on Hold
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setHoldReasonInput('Guard left for other city without collecting salary');
                        setShowHoldModal(true);
                      }}
                      className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 flex items-center gap-2 border border-amber-600 shadow"
                    >
                      <PauseCircle className="w-4 h-4 text-slate-950" />
                      Put Salary on Hold
                    </button>
                  )}

                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-sm transition-all shadow-lg active:scale-95 flex items-center gap-2 border border-emerald-700"
                  >
                    <Printer className="w-5 h-5 text-white" />
                    View & Print Official Slip
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: ADD EXPENSE / ADVANCE                             */}
      {/* ──────────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-800 flex items-center justify-between bg-surface-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Record Watchman Expense</h3>
                  <p className="text-xs text-slate-400">Add clothes, food, advance or wage adjustment</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="p-5 space-y-4">
              {/* Watchman Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Watchman <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formWatchmanId}
                  onChange={(e) => setFormWatchmanId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500 font-medium"
                >
                  <option value="">-- Choose Watchman --</option>
                  {watchmen.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.full_name} ({w.employee_id}) — Base ₹{getWatchmanMonthlyWage(w).toLocaleString('en-IN')}/month
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Category <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e: any) => {
                      const cat = e.target.value;
                      setFormCategory(cat);
                      if (cat === 'clothes' && !formTitle) setFormTitle('Uniform & Clothing');
                      if (cat === 'food' && !formTitle) setFormTitle('Mess / Food Charge');
                      if (cat === 'advance' && !formTitle) setFormTitle('Salary Advance');
                      if (cat === 'monthly_wage' || cat === 'daily_wage') {
                        setFormType('earning');
                        setFormUpdateMonthlyWage(true);
                      }
                    }}
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="clothes">👕 Clothes & Uniform</option>
                    <option value="food">🍲 Food & Mess</option>
                    <option value="advance">💳 Salary Advance</option>
                    <option value="monthly_wage">💰 Monthly Wage Rate</option>
                    <option value="travel">🚌 Travel / Transport</option>
                    <option value="medical">💊 Medical</option>
                    <option value="equipment">🔦 Safety Equipment</option>
                    <option value="bonus">🎁 Bonus / Incentive</option>
                    <option value="other">📑 Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Type <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={(e: any) => setFormType(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500 font-medium"
                  >
                    <option value="deduction">Deduction (Debit from Salary)</option>
                    <option value="earning">Allowance / Earning (Credit)</option>
                  </select>
                </div>
              </div>

              {/* Title / Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Item Description / Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2 sets khaki uniform & boots, October mess fee"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Amount (₹) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 1500"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    required
                    min="1"
                    className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 font-mono font-bold text-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Notes / Receipt Details (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional notes for HR payroll audit..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500 placeholder-slate-500 resize-none"
                />
              </div>

              {/* Checkbox to update watchman default monthly wage */}
              {(formCategory === 'monthly_wage' || formCategory === 'daily_wage') && (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={formUpdateMonthlyWage}
                    onChange={(e) => setFormUpdateMonthlyWage(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-surface-800 border-surface-700"
                  />
                  <span className="text-xs text-slate-300">
                    Set this as the guard's permanent base monthly wage rate
                  </span>
                </label>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-surface-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addExpenseMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {addExpenseMutation.isPending ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: EDIT MONTHLY WAGE RATE                            */}
      {/* ──────────────────────────────────────────────────────── */}
      {showEditWageModal && selectedWatchman && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Update Monthly Wage Rate</h3>
              <button
                onClick={() => setShowEditWageModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">
                Set base monthly wage for <strong>{selectedWatchman.full_name}</strong> ({selectedWatchman.employee_id}):
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                <input
                  type="number"
                  value={newWageInput}
                  onChange={(e) => setNewWageInput(e.target.value)}
                  placeholder="15000"
                  className="w-full pl-8 pr-3 py-2 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 font-mono font-bold text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditWageModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const wage = parseFloat(newWageInput);
                  if (isNaN(wage) || wage < 0) {
                    toast.error('Please enter a valid monthly wage amount');
                    return;
                  }
                  updateWageMutation.mutate({
                    watchmanId: selectedWatchman._id,
                    monthly_wage: wage,
                  });
                }}
                disabled={updateWageMutation.isPending}
                className="px-4 py-1.5 text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow disabled:opacity-50"
              >
                {updateWageMutation.isPending ? 'Updating...' : 'Update Monthly Wage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: OFFICIAL PRINTABLE SALARY SLIP                    */}
      {/* ──────────────────────────────────────────────────────── */}
      {showSlipModal && salarySlipData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full my-auto overflow-hidden shadow-2xl border border-slate-300 print:border-none print:shadow-none print:m-0 print:p-0">
            {/* Modal Non-Printable Header */}
            <div className="bg-slate-100 p-3 sm:p-4 border-b border-slate-300 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <span className="font-bold text-sm text-slate-800">
                  Official Salary Slip Preview
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print Salary Slip
                </button>
                <button
                  onClick={() => setShowSlipModal(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Payslip Content (Clean Simplistic Printable Layout matching reference) */}
            <div className="p-6 sm:p-10 space-y-6 print:p-2 bg-white text-black">
              {/* Slip Centered Title */}
              <div className="text-center border-b border-slate-300 pb-3">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-black font-sans uppercase">
                  Salary Slip
                </h2>
                {salarySlipData.agency?.name && (
                  <p className="text-xs font-semibold text-slate-700 tracking-wider uppercase mt-0.5">
                    {salarySlipData.agency.name}
                  </p>
                )}
              </div>

              {/* Guard & Period Meta Details (2 Columns) */}
              <div className="flex flex-col sm:flex-row justify-between gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[120px_1fr] items-baseline">
                    <span className="font-semibold text-slate-800">Employee Name:</span>
                    <span className="font-bold text-black">{salarySlipData.watchman?.full_name}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-baseline">
                    <span className="font-semibold text-slate-800">Designation :</span>
                    <span className="text-black">Security Guard ({salarySlipData.watchman?.employee_id})</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-baseline">
                    <span className="font-semibold text-slate-800">Agency Name:</span>
                    <span className="text-black">{salarySlipData.agency?.name || 'Security Agency'}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-baseline">
                    <span className="font-semibold text-slate-800">Agency Address:</span>
                    <span className="text-slate-700">
                      {salarySlipData.agency?.address || salarySlipData.agency?.phone || 'Main Operations Center'}
                    </span>
                  </div>
                  {salarySlipData.society?.name && (
                    <div className="grid grid-cols-[120px_1fr] items-baseline">
                      <span className="font-semibold text-slate-800">Deployment:</span>
                      <span className="text-black font-medium">{salarySlipData.society?.name}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 sm:text-right">
                  <div className="grid grid-cols-[90px_1fr] sm:flex sm:justify-end sm:gap-4 items-baseline">
                    <span className="font-semibold text-slate-800">Month:</span>
                    <span className="font-bold text-black">
                      {new Date(salarySlipData.period?.startDate || '').toLocaleString('en-IN', { month: 'long' })}
                    </span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr] sm:flex sm:justify-end sm:gap-4 items-baseline">
                    <span className="font-semibold text-slate-800">Date Range:</span>
                    <span className="text-black">{salarySlipData.period?.startDate} to {salarySlipData.period?.endDate}</span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr] sm:flex sm:justify-end sm:gap-4 items-baseline">
                    <span className="font-semibold text-slate-800">Year:</span>
                    <span className="text-black">{new Date(salarySlipData.period?.startDate || '').getFullYear()}</span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr] sm:flex sm:justify-end sm:gap-4 items-baseline">
                    <span className="font-semibold text-slate-800">Attendance:</span>
                    <span className="font-bold text-emerald-800">
                      {salarySlipData.attendanceSummary?.presentDaysCount} / {salarySlipData.attendanceSummary?.totalDays} Days ({salarySlipData.attendanceSummary?.attendanceRate}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Official Status Stamp (if Held or Released) */}
              {salarySlipData.holdStatus && (
                <div className={`p-2.5 rounded-lg border-2 text-center text-xs ${
                  salarySlipData.holdStatus.status === 'held'
                    ? 'border-dashed border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-emerald-600 bg-emerald-50 text-emerald-900'
                }`}>
                  <div className="font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5">
                    {salarySlipData.holdStatus.status === 'held' ? (
                      <span>⏸️ SALARY ON HOLD — BACKLOG PENDING DISBURSEMENT</span>
                    ) : (
                      <span>✅ SALARY RELEASED & DISBURSED ({salarySlipData.holdStatus.paymentMode?.toUpperCase() || 'CASH'})</span>
                    )}
                  </div>
                  <p className="mt-0.5 font-medium text-[11px]">
                    {salarySlipData.holdStatus.status === 'held' ? (
                      <>
                        Reason: <span className="font-bold">{salarySlipData.holdStatus.holdReason}</span> | Held on:{' '}
                        {new Date(salarySlipData.holdStatus.heldAt).toLocaleDateString('en-IN')}
                      </>
                    ) : (
                      <>
                        Disbursed on: {new Date(salarySlipData.holdStatus.releasedAt).toLocaleDateString('en-IN')} | Notes:{' '}
                        <span className="font-bold">{salarySlipData.holdStatus.releaseNotes}</span>
                      </>
                    )}
                  </p>
                  {salarySlipData.holdStatus.status === 'held' && (
                    <p className="text-[10px] text-amber-700 italic mt-0.5">
                      * Official Record: Disbursable upon watchman's return to collect pending wages.
                    </p>
                  )}
                </div>
              )}

              {/* Notice if watchman has prior pending held salary arrears */}
              {salarySlipData.totalPendingHeldArrears > 0 && (
                <div className="p-2 border border-amber-400 bg-amber-50 rounded text-[11px] text-amber-900 flex items-center justify-between">
                  <span>
                    <strong>Prior Backlog Notice:</strong> Watchman has pending held salary of{' '}
                    <strong>₹{salarySlipData.totalPendingHeldArrears.toLocaleString('en-IN')}</strong> from previous month(s).
                  </span>
                  <span className="text-[10px] text-amber-800 font-mono font-bold">
                    ({salarySlipData.priorPendingHolds?.length} Month(s) Pending)
                  </span>
                </div>
              )}

              {/* Simplistic Boxed Table */}
              <div className="border-2 border-black">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-black font-bold uppercase tracking-wider text-black bg-slate-50">
                      <th className="p-2.5 border-r border-black w-[35%] text-left">EMOLUMENTS</th>
                      <th className="p-2.5 border-r-2 border-black w-[15%] text-right">AMOUNT Rs.</th>
                      <th className="p-2.5 border-r border-black w-[35%] text-left">DEDUCTIONS</th>
                      <th className="p-2.5 w-[15%] text-right">AMOUNT Rs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {/* Left: Emoluments items */}
                      <td colSpan={2} className="border-r-2 border-black align-top p-0">
                        <div className="flex flex-col justify-between min-h-[220px]">
                          <div className="p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Basic Monthly Wage Rate</span>
                              <span className="font-mono font-bold">
                                ₹{salarySlipData.financials?.monthlyWageRate?.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>
                                Earned Wage ({salarySlipData.attendanceSummary?.presentDaysCount}/{salarySlipData.attendanceSummary?.totalDays} Days)
                              </span>
                              <span className="font-mono font-bold">
                                ₹{salarySlipData.financials?.earnedBasicWage?.toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-600">
                              <span>Effective Daily Rate</span>
                              <span className="font-mono">
                                ₹{salarySlipData.financials?.effectiveDailyRate || salarySlipData.financials?.dailyWageRate}
                              </span>
                            </div>
                            {salarySlipData.financials?.earnings?.items?.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between">
                                <span>{item.title}</span>
                                <span className="font-mono font-semibold">
                                  ₹{Number(item.amount).toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Right: Deductions items */}
                      <td colSpan={2} className="align-top p-0">
                        <div className="flex flex-col justify-between min-h-[220px]">
                          <div className="p-2.5 space-y-2">
                            {salarySlipData.financials?.deductions?.clothesTotal > 0 && (
                              <div className="flex items-center justify-between">
                                <span>Uniform & Clothes</span>
                                <span className="font-mono">
                                  ₹{salarySlipData.financials?.deductions?.clothesTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                            {salarySlipData.financials?.deductions?.foodTotal > 0 && (
                              <div className="flex items-center justify-between">
                                <span>Food & Mess Charges</span>
                                <span className="font-mono">
                                  ₹{salarySlipData.financials?.deductions?.foodTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                            {salarySlipData.financials?.deductions?.advanceTotal > 0 && (
                              <div className="flex items-center justify-between">
                                <span>Salary Advance</span>
                                <span className="font-mono">
                                  ₹{salarySlipData.financials?.deductions?.advanceTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                            {salarySlipData.financials?.deductions?.otherDeductionsTotal > 0 && (
                              <div className="flex items-center justify-between">
                                <span>Other Deductions</span>
                                <span className="font-mono">
                                  ₹{salarySlipData.financials?.deductions?.otherDeductionsTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                            {salarySlipData.financials?.deductions?.totalDeductions === 0 && (
                              <div className="text-slate-400 italic">No deductions recorded</div>
                            )}
                          </div>

                          {/* Total Deductions row inside the deductions column */}
                          <div className="border-t border-black p-2.5 flex items-center justify-between font-bold bg-slate-50/50">
                            <span>Total Deductions</span>
                            <span className="font-mono">
                              ₹{salarySlipData.financials?.deductions?.totalDeductions?.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Bottom Summary Row: Gross Pay & Net Pay */}
                    <tr className="border-t-2 border-black font-bold text-black bg-slate-100">
                      <td className="p-2.5 border-r border-black font-bold uppercase">Gross Pay</td>
                      <td className="p-2.5 border-r-2 border-black font-mono font-black text-right text-sm">
                        ₹{salarySlipData.financials?.grossSalary?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-2.5 border-r border-black font-bold uppercase">Net Pay</td>
                      <td className="p-2.5 font-mono font-black text-right text-sm">
                        ₹{salarySlipData.financials?.netSalary?.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Verified Duty Dates Annexure */}
              {salarySlipData.presentDates?.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
                    Dates Verified on Duty ({salarySlipData.attendanceSummary?.presentDaysCount} Days):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {salarySlipData.presentDates?.map((d: any, idx: number) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] font-mono text-slate-800"
                      >
                        {d.date.split('-')[2]} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.date.split('-')[1])-1]} ({d.dayOfWeek})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Signatures: 3 Columns matching reference image */}
              <div className="grid grid-cols-3 gap-6 pt-10 text-xs text-center sm:text-left">
                <div>
                  <p className="font-bold text-black mb-10">Checked By</p>
                  <p className="border-t border-black pt-1 font-semibold text-slate-900">
                    Operations In-Charge
                  </p>
                  <p className="text-[11px] text-slate-600">Detachment commander</p>
                </div>

                <div>
                  <p className="font-bold text-black mb-10">Authorized by</p>
                  <p className="border-t border-black pt-1 font-semibold text-slate-900">
                    Agency HR / Supervisor
                  </p>
                  <p className="text-[11px] text-slate-600">{salarySlipData.agency?.name || 'Security Agency'}</p>
                </div>

                <div>
                  <p className="font-bold text-black mb-10">Received by</p>
                  <p className="border-t border-black pt-1 font-semibold text-slate-900">
                    {salarySlipData.watchman?.full_name}
                  </p>
                  <p className="text-[11px] text-slate-600">Security Guard</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: PUT SALARY ON HOLD                                */}
      {/* ──────────────────────────────────────────────────────── */}
      {showHoldModal && salarySlipData && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-800 flex items-center justify-between bg-surface-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center">
                  <PauseCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Put Salary on Hold</h3>
                  <p className="text-xs text-slate-400">Track unpaid salary for absent or out-of-town guard</p>
                </div>
              </div>
              <button
                onClick={() => setShowHoldModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                holdSalaryMutation.mutate({
                  watchman_id: salarySlipData.watchman?.id || selectedWatchmanId,
                  startDate: salarySlipData.period?.startDate,
                  endDate: salarySlipData.period?.endDate,
                  dutyDays: salarySlipData.attendanceSummary?.presentDaysCount || 0,
                  grossSalary: salarySlipData.financials?.grossSalary || 0,
                  deductions: salarySlipData.financials?.deductions?.totalDeductions || 0,
                  netSalary: salarySlipData.financials?.netSalary || 0,
                  holdReason: holdReasonInput,
                });
              }}
              className="p-5 space-y-4"
            >
              {/* Guard & Slip Info */}
              <div className="p-3.5 bg-surface-800/60 rounded-xl border border-surface-700/60 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Watchman:</span>
                  <span className="font-bold text-slate-200">
                    {salarySlipData.watchman?.full_name} ({salarySlipData.watchman?.employee_id})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Period:</span>
                  <span className="font-medium text-slate-200">
                    {salarySlipData.period?.startDate} to {salarySlipData.period?.endDate}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Duty Days Verified:</span>
                  <span className="font-semibold text-emerald-400">
                    {salarySlipData.attendanceSummary?.presentDaysCount} Days
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-surface-700/50">
                  <span className="font-bold text-slate-300">Net Salary to Hold:</span>
                  <span className="font-mono font-black text-amber-300 text-sm">
                    ₹{salarySlipData.financials?.netSalary.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Hold Reason Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Reason for Holding Salary <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={holdReasonInput}
                  onChange={(e) => setHoldReasonInput(e.target.value)}
                  placeholder="e.g. Guard left for other city without collecting salary"
                  required
                  className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500 resize-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 This record will be safely stored in the guard's backlog ledger. Even if the guard returns after 5 or 6 months, their salary will remain fully preserved and can be disbursed with one click.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-800">
                <button
                  type="button"
                  onClick={() => setShowHoldModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-surface-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holdSalaryMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-surface-950 shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  <PauseCircle className="w-4 h-4" />
                  {holdSalaryMutation.isPending ? 'Holding...' : 'Confirm Salary Hold'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: RELEASE & DISBURSE HELD SALARY                    */}
      {/* ──────────────────────────────────────────────────────── */}
      {showReleaseModal && targetHoldToRelease && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-800 flex items-center justify-between bg-surface-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center">
                  <PlayCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Release & Pay Held Salary</h3>
                  <p className="text-xs text-slate-400">Disburse held wages to returning guard</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowReleaseModal(false);
                  setTargetHoldToRelease(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                releaseHoldMutation.mutate({
                  id: targetHoldToRelease.id || targetHoldToRelease._id,
                  payload: {
                    paymentMode: releasePaymentMode,
                    releaseNotes: releaseNotesInput,
                    releaseDate: releaseDateInput,
                  },
                });
              }}
              className="p-5 space-y-4"
            >
              {/* Backlog Summary Card */}
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Period:</span>
                  <span className="font-bold text-slate-200 text-sm">
                    {targetHoldToRelease.periodLabel || 'Held Month'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Duty Days Verified:</span>
                  <span className="font-semibold text-emerald-400">
                    {targetHoldToRelease.dutyDays || 0} Days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Original Hold Reason:</span>
                  <span className="text-slate-300 italic">
                    "{targetHoldToRelease.holdReason}"
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-emerald-500/30">
                  <span className="font-bold text-slate-200 text-sm">Net Amount to Disburse:</span>
                  <span className="font-mono font-black text-emerald-400 text-xl">
                    ₹{Number(targetHoldToRelease.netSalary).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Payment Mode <span className="text-rose-400">*</span>
                </label>
                <select
                  value={releasePaymentMode}
                  onChange={(e: any) => setReleasePaymentMode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="cash">💵 Cash In-Hand</option>
                  <option value="bank_transfer">🏦 Bank Transfer (NEFT / IMPS / RTGS)</option>
                  <option value="upi">📱 UPI / GPay / PhonePe</option>
                  <option value="cheque">📝 Bank Cheque</option>
                </select>
              </div>

              {/* Release Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Disbursement Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={releaseDateInput}
                  onChange={(e) => setReleaseDateInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Release Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Disbursement Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={releaseNotesInput}
                  onChange={(e) => setReleaseNotesInput(e.target.value)}
                  placeholder="e.g. Guard returned from other city and collected pending salary in full"
                  className="w-full px-3.5 py-2.5 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500 resize-none text-xs"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowReleaseModal(false);
                    setTargetHoldToRelease(null);
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-surface-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={releaseHoldMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {releaseHoldMutation.isPending ? 'Releasing...' : 'Disburse & Release Salary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
