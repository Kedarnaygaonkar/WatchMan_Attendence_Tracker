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
  Edit2
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
    daily_wage?: number;
  };
  category: 'daily_wage' | 'clothes' | 'food' | 'travel' | 'advance' | 'medical' | 'equipment' | 'bonus' | 'other';
  type: 'deduction' | 'earning';
  title: string;
  amount: number;
  date: string;
  notes?: string;
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

  // Add Expense Form State
  const [formWatchmanId, setFormWatchmanId] = useState('');
  const [formCategory, setFormCategory] = useState<'clothes' | 'food' | 'advance' | 'travel' | 'daily_wage' | 'medical' | 'equipment' | 'bonus' | 'other'>('clothes');
  const [formType, setFormType] = useState<'deduction' | 'earning'>('deduction');
  const [formTitle, setFormTitle] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(todayStr);
  const [formNotes, setFormNotes] = useState('');
  const [formUpdateDailyWage, setFormUpdateDailyWage] = useState(false);

  // Salary Slip State
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
      if (slipWageOverride) params.dailyWageOverride = slipWageOverride;

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

  // ── Update Daily Wage Mutation ────────────────────────────────────────
  const updateWageMutation = useMutation({
    mutationFn: async ({ watchmanId, daily_wage }: { watchmanId: string; daily_wage: number }) => {
      const res = await api.patch(`/expenses/watchman/${watchmanId}/wage`, { daily_wage });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Daily wage updated successfully');
      setShowEditWageModal(false);
      queryClient.invalidateQueries({ queryKey: ['watchmen-list'] });
      queryClient.invalidateQueries({ queryKey: ['salary-slip'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update daily wage');
    },
  });

  function resetAddForm() {
    setFormWatchmanId(selectedWatchmanId || '');
    setFormCategory('clothes');
    setFormType('deduction');
    setFormTitle('');
    setFormAmount('');
    setFormDate(todayStr);
    setFormNotes('');
    setFormUpdateDailyWage(false);
  }

  function handleOpenAddModal(categoryPreset?: 'clothes' | 'food' | 'advance' | 'daily_wage') {
    resetAddForm();
    if (categoryPreset) {
      setFormCategory(categoryPreset);
      if (categoryPreset === 'clothes') setFormTitle('Uniform & Clothing Expense');
      else if (categoryPreset === 'food') setFormTitle('Food / Mess Charges');
      else if (categoryPreset === 'advance') setFormTitle('Salary Advance');
      else if (categoryPreset === 'daily_wage') {
        setFormTitle('Daily Wage Base Rate');
        setFormType('earning');
        setFormUpdateDailyWage(true);
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
      updateWatchmanDailyWage: formUpdateDailyWage,
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
      case 'daily_wage':
        return { label: 'Daily Wage Rate', icon: DollarSign, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
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
                Track guard daily wages, clothes, food expenses, and generate attendance-verified salary slips.
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
                    {w.full_name} ({w.employee_id}) — Base ₹{w.daily_wage || 500}/day
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
                <option value="daily_wage">Daily Wage Adjustments</option>
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
                  Base Daily Wage: ₹{selectedWatchman.daily_wage || 500} / day
                </span>
                <button
                  onClick={() => {
                    setNewWageInput(String(selectedWatchman.daily_wage || 500));
                    setShowEditWageModal(true);
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 underline flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit Wage Rate
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleOpenAddModal('clothes')}
              className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Shirt className="w-3.5 h-3.5" />
              + Clothes
            </button>
            <button
              onClick={() => handleOpenAddModal('food')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Utensils className="w-3.5 h-3.5" />
              + Food/Mess
            </button>
            <button
              onClick={() => handleOpenAddModal('advance')}
              className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              + Advance
            </button>
            <button
              onClick={() => {
                setActiveTab('salary_slip');
                setShowSlipModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow transition-all flex items-center gap-1.5"
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
                verified attendance dates, calculate earned daily wages, subtract recorded expenses, and generate
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
                      {w.full_name} ({w.employee_id}) — Base ₹{w.daily_wage || 500}/day
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

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Daily Wage (₹):</span>
                    <input
                      type="number"
                      placeholder={String(salarySlipData.watchman?.daily_wage || 500)}
                      value={slipWageOverride}
                      onChange={(e) => setSlipWageOverride(e.target.value)}
                      className="w-24 px-2.5 py-1.5 bg-surface-900 border border-surface-700 rounded-xl text-slate-100 text-xs font-mono font-bold focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    Print / Download Slip
                  </button>
                </div>
              </div>

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
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
                      Present: {salarySlipData.attendanceSummary?.presentDaysCount} Days
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold">
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
                      <span className="text-xs text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10">
                        Credit
                      </span>
                    </div>

                    <div className="space-y-3 mt-4 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-200">
                            Earned Daily Wages
                          </p>
                          <p className="text-xs text-slate-400">
                            {salarySlipData.attendanceSummary?.presentDaysCount} Present Days × ₹{salarySlipData.financials?.dailyWageRate}/day
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
                      <span className="text-xs text-rose-400 font-semibold px-2 py-0.5 rounded bg-rose-500/10">
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
              <div className="bg-gradient-to-r from-emerald-950/60 via-surface-800 to-emerald-950/40 p-6 rounded-2xl border-2 border-emerald-500/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-glow">
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">
                    Net Salary Disbursable
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-3xl sm:text-4xl font-black text-emerald-300 font-mono">
                      ₹{salarySlipData.financials?.netSalary.toLocaleString('en-IN')}
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">
                      (Gross ₹{salarySlipData.financials?.grossSalary.toLocaleString('en-IN')} - Deductions ₹
                      {salarySlipData.financials?.deductions?.totalDeductions.toLocaleString('en-IN')})
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowSlipModal(true)}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-surface-950 font-black rounded-xl text-sm transition-all shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  View & Print Official Slip
                </button>
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
                      {w.full_name} ({w.employee_id}) — Base ₹{w.daily_wage || 500}/day
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
                      if (cat === 'daily_wage') {
                        setFormType('earning');
                        setFormUpdateDailyWage(true);
                      }
                    }}
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="clothes">👕 Clothes & Uniform</option>
                    <option value="food">🍲 Food & Mess</option>
                    <option value="advance">💳 Salary Advance</option>
                    <option value="daily_wage">💰 Daily Wage Rate</option>
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

              {/* Checkbox to update watchman default daily wage */}
              {formCategory === 'daily_wage' && (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={formUpdateDailyWage}
                    onChange={(e) => setFormUpdateDailyWage(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-surface-800 border-surface-700"
                  />
                  <span className="text-xs text-slate-300">
                    Set this as the guard's permanent base daily wage rate
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
      {/* MODAL: EDIT DAILY WAGE RATE                              */}
      {/* ──────────────────────────────────────────────────────── */}
      {showEditWageModal && selectedWatchman && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Update Daily Wage Rate</h3>
              <button
                onClick={() => setShowEditWageModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">
                Set base daily rate for <strong>{selectedWatchman.full_name}</strong> ({selectedWatchman.employee_id}):
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                <input
                  type="number"
                  value={newWageInput}
                  onChange={(e) => setNewWageInput(e.target.value)}
                  placeholder="500"
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
                    toast.error('Please enter a valid wage amount');
                    return;
                  }
                  updateWageMutation.mutate({
                    watchmanId: selectedWatchman._id,
                    daily_wage: wage,
                  });
                }}
                disabled={updateWageMutation.isPending}
                className="px-4 py-1.5 text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow disabled:opacity-50"
              >
                {updateWageMutation.isPending ? 'Updating...' : 'Update Wage'}
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

            {/* Official Payslip Content (Clean Printable Layout) */}
            <div className="p-6 sm:p-8 space-y-6 print:p-4">
              {/* Slip Top Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xl">
                    🛡️
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                      {salarySlipData.agency?.name || 'Security Agency'}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Workforce Payroll & Attendance Management System
                    </p>
                    {salarySlipData.agency?.phone && (
                      <p className="text-[11px] text-slate-500">Contact: {salarySlipData.agency.phone}</p>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded bg-slate-900 text-white font-bold text-xs uppercase tracking-wider">
                    Payslip
                  </span>
                  <p className="text-xs font-semibold text-slate-700 mt-1">
                    Period: {salarySlipData.period?.startDate} to {salarySlipData.period?.endDate}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Guard & Deployment Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Guard Name</span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{salarySlipData.watchman?.full_name}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Employee ID</span>
                  <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                    {salarySlipData.watchman?.employee_id}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Designated Society</span>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {salarySlipData.society?.name || 'General Deployment'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Base Daily Wage</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">
                    ₹{salarySlipData.financials?.dailyWageRate} / day
                  </p>
                </div>
              </div>

              {/* Attendance Summary */}
              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-slate-200">
                  <span className="text-slate-800">
                    Attendance Log: <strong>{salarySlipData.attendanceSummary?.presentDaysCount} Days Present</strong> out of{' '}
                    {salarySlipData.attendanceSummary?.totalDays} Calendar Days
                  </span>
                  <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-mono font-bold">
                    {salarySlipData.attendanceSummary?.attendanceRate}% Attendance
                  </span>
                </div>

                {/* Present Dates explicitly enumerated */}
                <div className="mt-2.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                    Dates Verified Present on Duty:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {salarySlipData.presentDates?.map((d: any, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-mono text-slate-800"
                      >
                        {d.date.split('-')[2]} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.date.split('-')[1])-1]} ({d.dayOfWeek})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Earnings & Deductions Comparison Table */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="p-3 border-r border-slate-300 w-1/2">Earnings & Allowances</th>
                      <th className="p-3 w-1/2">Agency Expenses & Deductions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-3 border-r border-slate-200 align-top space-y-2">
                        <div className="flex items-center justify-between font-semibold">
                          <span>
                            Basic Daily Wages ({salarySlipData.attendanceSummary?.presentDaysCount} Days × ₹
                            {salarySlipData.financials?.dailyWageRate})
                          </span>
                          <span className="font-mono font-bold">
                            ₹{salarySlipData.financials?.earnedBasicWage.toLocaleString('en-IN')}
                          </span>
                        </div>
                        {salarySlipData.financials?.earnings?.items?.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-slate-600">
                            <span>{item.title}</span>
                            <span className="font-mono">₹{Number(item.amount).toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </td>

                      <td className="p-3 align-top space-y-2">
                        {salarySlipData.financials?.deductions?.clothesTotal > 0 && (
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Uniform / Clothes Expense</span>
                            <span className="font-mono text-rose-700 font-semibold">
                              -₹{salarySlipData.financials?.deductions?.clothesTotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                        {salarySlipData.financials?.deductions?.foodTotal > 0 && (
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Food / Mess Expenses</span>
                            <span className="font-mono text-rose-700 font-semibold">
                              -₹{salarySlipData.financials?.deductions?.foodTotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                        {salarySlipData.financials?.deductions?.advanceTotal > 0 && (
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Salary Advance</span>
                            <span className="font-mono text-rose-700 font-semibold">
                              -₹{salarySlipData.financials?.deductions?.advanceTotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                        {salarySlipData.financials?.deductions?.otherDeductionsTotal > 0 && (
                          <div className="flex items-center justify-between text-slate-700">
                            <span>Other Miscellaneous</span>
                            <span className="font-mono text-rose-700 font-semibold">
                              -₹{salarySlipData.financials?.deductions?.otherDeductionsTotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                        {salarySlipData.financials?.deductions?.totalDeductions === 0 && (
                          <span className="text-slate-400 italic">No deductions recorded</span>
                        )}
                      </td>
                    </tr>
                    <tr className="bg-slate-50 font-bold">
                      <td className="p-3 border-r border-slate-300">
                        <div className="flex items-center justify-between">
                          <span>Total Gross Earnings:</span>
                          <span className="font-mono text-emerald-800">
                            ₹{salarySlipData.financials?.grossSalary.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-between">
                          <span>Total Deductions:</span>
                          <span className="font-mono text-rose-800">
                            -₹{salarySlipData.financials?.deductions?.totalDeductions.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Net Disbursable Box */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    Net Salary Payable
                  </span>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Calculated for {salarySlipData.attendanceSummary?.presentDaysCount} present days minus expenses
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ₹{salarySlipData.financials?.netSalary.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200">
                <div>
                  <div className="border-b border-slate-400 pb-8"></div>
                  <p className="text-xs font-bold text-slate-800 mt-1.5">Authorized Signatory / HR</p>
                  <p className="text-[10px] text-slate-500">{salarySlipData.agency?.name || 'Security Agency'}</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8"></div>
                  <p className="text-xs font-bold text-slate-800 mt-1.5">Employee / Guard Signature</p>
                  <p className="text-[10px] text-slate-500">I acknowledge receipt of the payment & deductions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
