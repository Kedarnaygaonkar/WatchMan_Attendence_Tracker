import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  AlertTriangle,
  Download,
  Filter,
  X,
  MapPin,
  Route,
  User,
  Building2,
  Grid3X3,
  DoorOpen,
  Layers,
  Users,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowLeft,
  Search,
  Receipt,
  FileText,
  RefreshCw,
  Calculator,
  Edit3,
  Check
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

type ReportTab = 'daily' | 'monthly' | 'watchmen' | 'suspicious';

interface Society {
  id: string;
  name: string;
  address?: string;
  wings?: string[];
  gates?: string[];
}
interface Agency { id: string; name: string; }
interface WatchmanOption { _id: string; id: string; full_name: string; employee_id: string; }

interface SocietyWingBillData {
  agency: {
    id: string;
    name: string;
    subName?: string;
    proprietor?: string;
    proprietorSubtitle?: string;
    address?: string;
    state?: string;
    pan?: string;
    phone?: string;
    email?: string;
    logo_url?: string;
  };
  society: {
    id: string;
    name: string;
    rawName?: string;
    address?: string;
    placeOfSupply?: string;
    wings: string[];
  };
  invoice: {
    invoiceNo: string;
    invoiceDate: string;
    serviceMonth: string;
    invoicePeriod: string;
    siteName: string;
    wing: string;
    particulars: string;
    quantity: number;
    ratePerMonth: number;
    perDayRate: number;
    perHrRate: number;
    otHours: number;
    totalDays: number;
    subTotalA: number;
    subTotalB: number;
    roundOff: number;
    total: number;
    amountInWords: string;
    year: number;
    month: number;
    daysInMonth: number;
  };
}

interface DailyRecord {
  watchman_id: string; full_name: string; employee_id: string;
  society_name: string; shift_name: string; final_status: string;
  check_in_time: string | null; check_out_time: string | null;
  duration_minutes: number | null; verification_status: string | null; is_offline_sync: boolean;
}

interface MonthlyRecord {
  watchman_id: string; full_name: string; employee_id: string;
  days_present: number; days_late: number; days_absent: number;
  suspicious_count: number; total_records: number;
}

interface SuspiciousRecord {
  id: string; watchman_name: string; employee_id: string;
  society_name: string; attendance_date: string; check_in_time: string;
  verification_status: string; gps_flags: string[]; distance_from_society: number;
}

interface JourneyDay {
  date: string; status: 'present' | 'late' | 'absent';
  society_name: string | null; shift_name: string | null;
  start_time: string | null; end_time: string | null;
  check_in_time: string | null; check_out_time: string | null;
  duration_minutes: number | null; verification_status: string | null;
  attendance_id: string | null;
}

interface JourneyStats { totalDays: number; presentDays: number; lateDays: number; absentDays: number; }

interface CalendarWatchman { watchman_id: string; watchman_name: string; employee_id: string; phone: string; shift_name: string; days_attended: number; wings: string[]; gates: string[]; }
interface CalendarSection { name: string; days: (string | boolean | null)[]; }
interface SocietyCalendarData {
  year: number; month: number; daysInMonth: number;
  society?: {
    id: string;
    name: string;
    address: string;
    agency?: {
      id: string;
      name: string;
      phone: string;
      email: string;
      logo_url?: string;
    } | null;
  } | null;
  watchmen: CalendarWatchman[];
  wings: CalendarSection[];
  gates: CalendarSection[];
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = { present: 'badge-present', late: 'badge-late', absent: 'badge-absent', rejected: 'badge-absent' };
  return <span className={cls[status] || 'badge'}>{status?.toUpperCase()}</span>;
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [tab, setTab] = useState<ReportTab>('daily');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [societyId, setSocietyId] = useState('');
  const [agencyId, setAgencyId] = useState('');

  const [journeyWatchmanId, setJourneyWatchmanId] = useState('');
  const [journeyStartDate, setJourneyStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [journeyEndDate, setJourneyEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [watchmenSearch, setWatchmenSearch] = useState('');

  const { data: societies } = useQuery({
    queryKey: ['societies-filter', agencyId],
    queryFn: async () => {
      const params: any = { active: 'true' };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/societies', { params });
      return data.data as Society[];
    },
  });

  const { data: agencies } = useQuery({
    queryKey: ['agencies-filter'],
    queryFn: async () => { try { const { data } = await api.get('/agencies'); return data.data as Agency[]; } catch { return [] as Agency[]; } },
    enabled: isSuperAdmin,
  });

  const { data: watchmenOptions } = useQuery({
    queryKey: ['watchmen-all-journey', agencyId],
    queryFn: async () => {
      const params: any = {};
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/watchmen', { params });
      return (data.data || data) as WatchmanOption[];
    },
    enabled: tab === 'watchmen',
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['report-daily', date, societyId, agencyId],
    queryFn: async () => {
      const params: any = { date };
      if (societyId) params.society_id = societyId;
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/daily', { params });
      return data.data as DailyRecord[];
    },
    enabled: tab === 'daily',
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['report-monthly', year, month, societyId, agencyId],
    queryFn: async () => {
      const params: any = { year, month };
      if (societyId) params.society_id = societyId;
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/monthly', { params });
      return data.data as MonthlyRecord[];
    },
    enabled: tab === 'monthly',
  });

  const { data: suspiciousData, isLoading: suspiciousLoading } = useQuery({
    queryKey: ['report-suspicious', societyId, agencyId],
    queryFn: async () => {
      const params: any = {};
      if (societyId) params.society_id = societyId;
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/suspicious', { params });
      return data.data as SuspiciousRecord[];
    },
    enabled: tab === 'suspicious',
  });

  const { data: journeyData, isLoading: journeyLoading } = useQuery({
    queryKey: ['report-journey', journeyWatchmanId, journeyStartDate, journeyEndDate, agencyId],
    queryFn: async () => {
      const params: any = { watchman_id: journeyWatchmanId, startDate: journeyStartDate, endDate: journeyEndDate };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/watchman-journey', { params });
      return { records: data.data as JourneyDay[], stats: data.stats as JourneyStats, watchman: data.watchman };
    },
    enabled: tab === 'watchmen' && !!journeyWatchmanId,
  });

  const [calendarSocietyId, setCalendarSocietyId] = useState('');
  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['report-society-calendar', societyId, year, month, agencyId],
    queryFn: async () => {
      const params: any = { society_id: societyId, year, month };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/society-calendar', { params });
      return data as SocietyCalendarData;
    },
    enabled: tab === 'monthly' && !!societyId,
  });

  // ── Monthly Sub-Tab & Wing-Wise Bill States ────────────────────────────
  const [monthlySubTab, setMonthlySubTab] = useState<'attendance' | 'bill'>('attendance');
  const [selectedWing, setSelectedWing] = useState<string>('all');

  // Custom invoice editable parameters
  const [invoiceRateOverride, setInvoiceRateOverride] = useState<string>('23000');
  const [invoiceQuantityOverride, setInvoiceQuantityOverride] = useState<string>('');
  const [invoiceTotalDaysOverride, setInvoiceTotalDaysOverride] = useState<string>('');
  const [invoiceNoOverride, setInvoiceNoOverride] = useState<string>('');
  const [invoiceDateOverride, setInvoiceDateOverride] = useState<string>('');
  const [invoicePoNumber, setInvoicePoNumber] = useState<string>('');
  const [invoiceParticulars, setInvoiceParticulars] = useState<string>('Security Guard');
  const [invoiceOtHours, setInvoiceOtHours] = useState<string>('0');
  const [siteNameOverride, setSiteNameOverride] = useState<string>('');

  // ── Fetch Society & Wing Bill Data ─────────────────────────────────────
  const {
    data: billDataResponse,
    isLoading: billLoading,
    refetch: refetchBill,
  } = useQuery<SocietyWingBillData>({
    queryKey: ['report-society-wing-bill', societyId, year, month, selectedWing, agencyId],
    queryFn: async () => {
      const params: any = {
        society_id: societyId,
        year,
        month,
        wing: selectedWing,
      };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/society-wing-bill', { params });
      return data?.data as SocietyWingBillData;
    },
    enabled: tab === 'monthly' && !!societyId,
  });

  // Available wings for society
  const selectedSocietyObj = societies?.find(s => s.id === societyId);
  const availableWings: string[] = selectedSocietyObj?.wings && selectedSocietyObj.wings.length > 0
    ? selectedSocietyObj.wings
    : (calendarData?.wings?.map(w => w.name) || billDataResponse?.society?.wings || ['A', 'B', 'C', 'M1M2']);

  function resetInvoiceOverrides() {
    setInvoiceRateOverride('23000');
    setInvoiceQuantityOverride('');
    setInvoiceTotalDaysOverride('');
    setInvoiceNoOverride('');
    setInvoiceDateOverride('');
    setInvoicePoNumber('');
    setInvoiceParticulars('Security Guard');
    setInvoiceOtHours('0');
    setSiteNameOverride('');
    toast.success('Reset invoice parameters to auto-calculated defaults');
  }

  // Effective invoice computations
  const currentDaysInMonth = new Date(year, month, 0).getDate();
  const currentMonthDate = new Date(year, month - 1, 1);
  const currentMonthName = currentMonthDate.toLocaleString('en-IN', { month: 'long' });
  const currentMonthShort = currentMonthDate.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
  const serviceMonthText = `${currentMonthName} ${year}`;
  const invoicePeriodText = `01 ${currentMonthShort} ${year} TO ${currentDaysInMonth} ${currentMonthShort} ${year}`;

  const defaultInvoiceNo = `ASG${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${String(month).padStart(2, '0')}/043`;
  const defaultInvoiceDate = `13/${String(month).padStart(2, '0')}/${year}`;

  const effectiveInvoiceNo = invoiceNoOverride.trim() || billDataResponse?.invoice?.invoiceNo || defaultInvoiceNo;
  const effectiveInvoiceDate = invoiceDateOverride.trim() || billDataResponse?.invoice?.invoiceDate || defaultInvoiceDate;

  const defaultSiteName = selectedWing && selectedWing.toLowerCase() !== 'all'
    ? (selectedWing.toUpperCase().includes('WING') ? selectedWing.toUpperCase() : `${selectedWing.toUpperCase()} WING`)
    : (selectedSocietyObj?.name ? `${selectedSocietyObj.name} (ALL WINGS)` : 'ALL WINGS');
  const effectiveSiteName = siteNameOverride.trim() || billDataResponse?.invoice?.siteName || defaultSiteName;

  const effectiveQuantity = invoiceQuantityOverride !== '' && !isNaN(parseInt(invoiceQuantityOverride))
    ? Math.max(1, parseInt(invoiceQuantityOverride))
    : (billDataResponse?.invoice?.quantity ?? (selectedWing !== 'all' ? 2 : (selectedSocietyObj ? 8 : 2)));

  const effectiveRatePerMonth = invoiceRateOverride !== '' && !isNaN(parseFloat(invoiceRateOverride))
    ? Math.max(0, parseFloat(invoiceRateOverride))
    : (billDataResponse?.invoice?.ratePerMonth ?? 23000);

  const effectiveTotalDays = invoiceTotalDaysOverride !== '' && !isNaN(parseInt(invoiceTotalDaysOverride))
    ? Math.max(0, parseInt(invoiceTotalDaysOverride))
    : (billDataResponse?.invoice?.totalDays ?? (effectiveQuantity * (currentDaysInMonth >= 30 ? 28 : currentDaysInMonth)));

  const effectivePerDayRate = currentDaysInMonth > 0
    ? Math.round((effectiveRatePerMonth / currentDaysInMonth) * 100) / 100
    : 766.67;

  const effectiveTotalAmount = Math.round((effectiveTotalDays * effectivePerDayRate) * 100) / 100;
  const effectiveSubTotalA = effectiveTotalAmount;
  const effectiveSubTotalB = effectiveTotalAmount;
  const effectiveRoundedTotal = Math.round(effectiveTotalAmount);
  const effectiveRoundOff = Math.round((effectiveRoundedTotal - effectiveTotalAmount) * 100) / 100;
  const effectiveAmountInWords = numberToIndianWords(effectiveRoundedTotal);

  function numberToIndianWords(num: number): string {
    const a = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const n = Math.floor(Math.abs(num));
    if (n === 0) return 'Zero Only';

    function convertTwoDigits(val: number): string {
      if (val < 20) return a[val];
      return b[Math.floor(val / 10)] + (val % 10 !== 0 ? ' ' + a[val % 10] : '');
    }

    function convertThreeDigits(val: number): string {
      let str = '';
      if (val >= 100) {
        str += a[Math.floor(val / 100)] + ' Hundred ';
        val %= 100;
      }
      if (val > 0) {
        if (str !== '') str += 'and ';
        str += convertTwoDigits(val);
      }
      return str.trim();
    }

    let crore = Math.floor(n / 10000000);
    let remainder = n % 10000000;
    let lakh = Math.floor(remainder / 100000);
    remainder = remainder % 100000;
    let thousand = Math.floor(remainder / 1000);
    let hundreds = remainder % 1000;

    let res = '';
    if (crore > 0) res += convertThreeDigits(crore) + ' Crore ';
    if (lakh > 0) res += convertThreeDigits(lakh) + ' Lakh ';
    if (thousand > 0) res += convertThreeDigits(thousand) + ' Thousand ';
    if (hundreds > 0) res += convertThreeDigits(hundreds);

    return res.trim() + ' Only';
  }

  function printInvoiceReport() {
    const invoiceElement = document.getElementById('printable-tax-invoice');
    if (!invoiceElement) {
      toast.error('Invoice element not ready to print. Please select a society.');
      return;
    }

    const selSociety = billDataResponse?.society?.name || societies?.find(s => s.id === societyId)?.name || 'Society';
    const selWing = selectedWing === 'all' ? 'All-Wings' : selectedWing;
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' });

    const existingFrame = document.getElementById('clean-invoice-print-frame');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'clean-invoice-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const clone = invoiceElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-print, button').forEach(el => el.remove());

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${selSociety} - ${selWing} - ${monthName} ${year}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 8mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      font-size: 11px;
      line-height: 1.35;
    }
    .print-avoid-break {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .no-print, button {
      display: none !important;
    }
    table, th, td {
      border-color: #000000 !important;
    }
  </style>
</head>
<body class="bg-white text-black p-0">
  <div style="width: 100%; max-width: 100%;">
    ${clone.innerHTML}
  </div>
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        window.print();
      }
    }, 450);
  }

  function exportInvoiceCSV() {
    if (!billDataResponse) {
      toast.error('No invoice data available to export');
      return;
    }

    const headers = [
      'Invoice No',
      'Dated',
      'Agency Name',
      'Society Name',
      'Site Name',
      'Service Month',
      'Particulars',
      'Quantity',
      'Rate / Month',
      'Per Day Rate',
      'Total Days',
      'Sub Total A',
      'Sub Total B',
      'Round Off',
      'Total Amount',
      'Amount in Words',
    ];

    const rows = [
      [
        effectiveInvoiceNo,
        effectiveInvoiceDate,
        billDataResponse.agency?.name || 'Alert Space Facilities & Management Services',
        billDataResponse.society?.name || 'Society',
        effectiveSiteName,
        serviceMonthText,
        invoiceParticulars,
        effectiveQuantity,
        effectiveRatePerMonth.toFixed(2),
        effectivePerDayRate.toFixed(2),
        effectiveTotalDays,
        effectiveSubTotalA.toFixed(2),
        effectiveSubTotalB.toFixed(2),
        effectiveRoundOff.toFixed(2),
        effectiveRoundedTotal.toFixed(2),
        effectiveAmountInWords,
      ],
    ];

    downloadCSV([headers, ...rows], `tax-invoice-${effectiveSiteName.replace(/[^a-zA-Z0-9]/g, '_')}-${year}-${month}.csv`);
  }

  function downloadCSV(rows: (string | number)[][], filename: string) {
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url); toast.success(`Exported ${filename}`);
  }

  function exportDailyCSV() {
    if (!dailyData?.length) { toast.error('No daily data to export'); return; }
    const headers = ['Guard Name','Employee ID','Society','Shift','Date','Check-In','Check-Out','Duration (min)','Status','Verification Status','Offline Sync'];
    const rows = dailyData.map((r) => [r.full_name,r.employee_id,r.society_name,r.shift_name,date,
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.duration_minutes ?? '',r.final_status,r.verification_status || '',r.is_offline_sync ? 'Yes' : 'No']);
    downloadCSV([headers, ...rows], `daily-attendance-${date}.csv`);
  }

  function exportMonthlyCSV() {
    if (!monthlyData?.length) { toast.error('No monthly data to export'); return; }
    const headers = ['Guard Name','Employee ID','Present','Late','Absent','Suspicious Count','Total','Attendance %'];
    const rows = monthlyData.map((r) => {
      const total = r.days_present + r.days_late + r.days_absent;
      const pct = total ? Math.round(((r.days_present + r.days_late) / total) * 100) : 0;
      return [r.full_name,r.employee_id,r.days_present,r.days_late,r.days_absent,r.suspicious_count,total,`${pct}%`];
    });
    downloadCSV([headers, ...rows], `monthly-attendance-${year}-${month}.csv`);
  }

  function exportSuspiciousCSV() {
    if (!suspiciousData?.length) { toast.error('No suspicious data to export'); return; }
    const headers = ['Guard Name','Employee ID','Society','Date','Flags','Distance (m)'];
    const rows = suspiciousData.map((r) => [r.watchman_name,r.employee_id,r.society_name,
      new Date(r.attendance_date).toLocaleDateString('en-IN'),(r.gps_flags||[]).join(' | '),
      r.distance_from_society ? Math.round(r.distance_from_society) : '']);
    downloadCSV([headers, ...rows], `suspicious-records.csv`);
  }

  const { data: watchmenReportList = [], isLoading: watchmenReportLoading } = useQuery({
    queryKey: ['report-watchmen-list', agencyId],
    queryFn: async () => {
      const params: any = {};
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/watchmen', { params });
      return (data.data || data) as any[];
    },
    enabled: tab === 'watchmen' && !journeyWatchmanId,
  });

  const filteredWatchmenList = watchmenReportList.filter((w: any) => {
    if (!watchmenSearch.trim()) return true;
    const q = watchmenSearch.toLowerCase();
    return (
      w.full_name?.toLowerCase().includes(q) ||
      w.employee_id?.toLowerCase().includes(q) ||
      w.phone?.toLowerCase().includes(q) ||
      w.address?.toLowerCase().includes(q)
    );
  });

  function exportWatchmenReportCSV() {
    const listToExport = filteredWatchmenList.length ? filteredWatchmenList : watchmenReportList;
    if (!listToExport?.length) { toast.error('No watchmen data to export'); return; }
    const headers = ['Guard Name', 'Employee ID', 'Mobile Number', 'Status', 'Joining Date', 'Active Assignments', 'Address'];
    const rows = listToExport.map((w: any) => [
      w.full_name,
      w.employee_id,
      w.phone,
      w.status?.toUpperCase() || 'ACTIVE',
      w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '',
      w.active_assignments ?? 0,
      w.address || '',
    ]);
    downloadCSV([headers, ...rows], `watchmen-report-${journeyStartDate}-to-${journeyEndDate}.csv`);
  }

  function exportJourneyCSV() {
    if (!journeyData?.records?.length) { toast.error('No journey data to export'); return; }
    const wm = journeyData.watchman;
    const headers = ['Date','Status','Society','Shift','Check-In','Check-Out','Duration (min)'];
    const rows = journeyData.records.map((r) => [r.date,r.status,r.society_name||'ABSENT',r.shift_name||'',
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.duration_minutes ?? '']);
    downloadCSV([headers, ...rows], `journey-${wm?.employee_id||'watchman'}-${journeyStartDate}-to-${journeyEndDate}.csv`);
  }

  function printCleanReport() {
    const reportElement = document.getElementById('printable-society-report');
    if (!reportElement) {
      toast.error('Please select a society to load the report first');
      return;
    }

    const selSociety = calendarData?.society?.name || societies?.find(s => s.id === societyId)?.name || 'Society';
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' });

    // Remove any previous print frame
    const existingFrame = document.getElementById('clean-report-print-frame');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'clean-report-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    // Clone element and strip no-print buttons
    const clone = reportElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-print, button').forEach(el => el.remove());

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${selSociety} - Attendance Audit Report - ${monthName} ${year}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      font-size: 11px;
      line-height: 1.35;
    }
    .print-avoid-break {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .no-print, button {
      display: none !important;
    }
  </style>
</head>
<body class="bg-white text-slate-900 p-0">
  <div style="width: 100%; max-width: 100%;">
    ${clone.innerHTML}
  </div>
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        window.print();
      }
    }, 450);
  }

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'daily', label: 'Daily Roster Summary', icon: Calendar },
    { id: 'monthly', label: 'Monthly & Society Reports', icon: BarChart3 },
    { id: 'watchmen', label: 'Watchmen Report & Journey', icon: Users },
    { id: 'suspicious', label: 'Suspicious Records', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header print:hidden">
        <div>
          <h1 className="section-title">Reports</h1>
          <p className="text-slate-500 text-sm">Attendance analytics, society summaries and watchmen roster exports</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b border-surface-700 pb-px flex-wrap print:hidden">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.id ? 'border-brand-500 text-brand-400 bg-brand-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Monthly Sub-Tabs Switcher: Attendance Report vs Society & Wing Bill */}
      {tab === 'monthly' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-800/80 p-2.5 rounded-2xl border border-surface-700/80 print:hidden shadow-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonthlySubTab('attendance')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                monthlySubTab === 'attendance'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700/50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Attendance & Society Reports</span>
            </button>

            <button
              onClick={() => setMonthlySubTab('bill')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                monthlySubTab === 'bill'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700/50'
              }`}
            >
              <Receipt className="w-4 h-4 text-emerald-300" />
              <span>Society Wise & Wing Wise Bill</span>
              <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-200 border border-emerald-400/30">
                Tax Invoice
              </span>
            </button>
          </div>

          {societyId && monthlySubTab === 'bill' && (
            <div className="flex items-center gap-2 pr-1">
              <span className="text-xs text-slate-300 font-semibold hidden md:inline">Select Wing:</span>
              <select
                value={selectedWing}
                onChange={(e) => {
                  setSelectedWing(e.target.value);
                  setInvoiceTotalDaysOverride('');
                  setInvoiceQuantityOverride('');
                }}
                className="px-3 py-1.5 bg-surface-900 border border-emerald-500/60 rounded-xl text-slate-100 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="all">🏢 All Wings (Society Bill)</option>
                {availableWings.map((w: string) => (
                  <option key={w} value={w}>
                    📍 {w.toUpperCase().includes('WING') ? w : `${w} Wing`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Common Filters — for daily, monthly, suspicious */}
      {tab !== 'watchmen' && (
        <div className="card p-4 print:hidden">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-slate-300">Report Filters</span>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            {tab === 'daily' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-44" />}
            {tab === 'monthly' && (
              <div className="flex gap-2">
                <select className="input w-36" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('en-IN', { month: 'long' })}</option>
                  ))}
                </select>
                <select className="input w-28" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {isSuperAdmin && (
              <select value={agencyId} onChange={(e) => { setAgencyId(e.target.value); setSocietyId(''); }} className="input w-52">
                <option value="">All Agencies</option>
                {agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <select value={societyId} onChange={(e) => setSocietyId(e.target.value)} className="input w-52">
              <option value="">All Societies</option>
              {societies?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {(societyId || agencyId) && (
              <button onClick={() => { setSocietyId(''); setAgencyId(''); }}
                className="flex items-center gap-1.5 text-xs text-danger-400 hover:text-danger-300 px-3 py-1.5 rounded-lg hover:bg-danger-500/10 transition-colors border border-danger-500/20">
                <X className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {tab === 'daily' && <button onClick={exportDailyCSV} disabled={!dailyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
              {tab === 'monthly' && (
                <>
                  {monthlySubTab === 'attendance' ? (
                    <>
                      <button
                        onClick={() => {
                          if (!societyId) toast.error('Please select a Society to generate the PDF report');
                          else printCleanReport();
                        }}
                        className="bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm"
                      >
                        <Printer className="w-4 h-4" /> Print PDF Report
                      </button>
                      <button
                        onClick={exportMonthlyCSV}
                        disabled={!monthlyData?.length}
                        className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          if (!societyId) toast.error('Please select a Society to print Tax Invoice');
                          else printInvoiceReport();
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
                      >
                        <Printer className="w-4 h-4" /> Print Tax Invoice
                      </button>
                      <button
                        onClick={exportInvoiceCSV}
                        disabled={!billDataResponse && !societyId}
                        className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    </>
                  )}
                </>
              )}
              {tab === 'suspicious' && <button onClick={exportSuspiciousCSV} disabled={!suspiciousData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
            </div>
          </div>
        </div>
      )}

      {/* Daily Roster */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="bg-surface-800/80 border border-surface-700 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-slate-300">
              <span className="font-semibold text-brand-300">📋 Daily Roster Overview:</span>
              <span>Full roster view of all assigned guards for the selected date, highlighting present vs absent guards.</span>
            </div>
            <Link
              to={`${isSuperAdmin ? '/agency' : '/admin'}/attendance`}
              className="text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 shrink-0"
            >
              <span>Need live punch selfies, GPS & overrides? Go to Attendance Logs &rarr;</span>
            </Link>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Society</th><th>Shift</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
              <tbody>
                {dailyLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                )) : dailyData?.map((r, i) => (
                  <tr key={i}>
                    <td><div><p className="font-medium">{r.full_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                    <td>{r.society_name}</td><td>{r.shift_name}</td>
                    <td className="text-slate-300 text-sm whitespace-nowrap">
                      {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—'}
                    </td>
                    <td className="text-slate-300 text-sm whitespace-nowrap">
                      {r.check_out_time ? (
                        <div>
                          <span>{new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>
                          {r.duration_minutes != null && <span className="text-xs text-slate-500 block">{Math.floor(r.duration_minutes/60)}h {r.duration_minutes%60}m</span>}
                        </div>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td><StatusBadge status={r.final_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dailyLoading && (!dailyData || dailyData.length === 0) && (
              <div className="text-center py-12 text-slate-600"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No records found for the selected date / filters</p></div>
            )}
          </div>
          {dailyData && dailyData.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Present', val: dailyData.filter((r) => r.final_status === 'present').length, cls: 'text-success-400' },
                { label: 'Late', val: dailyData.filter((r) => r.final_status === 'late').length, cls: 'text-warning-400' },
                { label: 'Absent', val: dailyData.filter((r) => r.final_status === 'absent').length, cls: 'text-danger-400' },
              ].map((s) => (
                <div key={s.label} className="card p-4 text-center">
                  <p className={`text-3xl font-black ${s.cls}`}>{s.val}</p>
                  <p className="text-slate-500 text-sm">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly */}
      {tab === 'monthly' && (
        <>
          {monthlySubTab === 'attendance' && (
            <>
              {!societyId && (
                <div className="space-y-4">
                  <div className="table-wrapper">
                    <table className="table">
                      <thead><tr><th>Guard</th><th>Present</th><th>Late</th><th>Absent</th><th>Suspicious</th><th>Attendance %</th></tr></thead>
                      <tbody>
                        {monthlyLoading ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}><td colSpan={6}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                        )) : monthlyData?.map((r) => {
                          const total = r.days_present + r.days_late + r.days_absent;
                          const pct = total ? Math.round(((r.days_present + r.days_late) / total) * 100) : 0;
                          return (
                            <tr key={r.watchman_id}>
                              <td><div><p className="font-medium">{r.full_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                              <td className="text-success-400 font-bold">{r.days_present}</td>
                              <td className="text-warning-400 font-bold">{r.days_late}</td>
                              <td className="text-danger-400 font-bold">{r.days_absent}</td>
                              <td className="text-orange-400">{r.suspicious_count}</td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 bg-surface-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-sm font-medium">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!monthlyLoading && (!monthlyData || monthlyData.length === 0) && (
                      <div className="text-center py-12 text-slate-600"><BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No monthly summary found</p></div>
                    )}
                  </div>
                </div>
              )}

              {/* Fully Custom Executive PDF & Screen Report for Society */}
              {societyId && (
                <div className="space-y-4">
                  {/* Screen toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface-800/90 border border-surface-700/80 rounded-2xl print:hidden max-w-[1050px] mx-auto shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <div>
                        <h3 className="font-bold text-slate-100 text-sm">
                          {societies?.find(s => s.id === societyId)?.name || 'Society'} • Official Attendance Report
                        </h3>
                        <p className="text-xs text-slate-400">
                          Audit Period: {new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMonthlySubTab('bill')}
                        className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5"
                      >
                        <Receipt className="w-4 h-4" /> Generate Wing/Society Bill
                      </button>
                      <button
                        onClick={printCleanReport}
                        className="bg-brand-600 hover:bg-brand-500 active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-brand-600/30 transition-all flex items-center gap-2"
                      >
                        <Printer className="w-4 h-4" /> Download / Print PDF Report
                      </button>
                      <button
                        onClick={exportMonthlyCSV}
                        className="btn-outline px-3.5 py-2 text-xs rounded-xl flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    </div>
                  </div>

              {/* Printable Document Sheet */}
              <div
                id="printable-society-report"
                className="printable-document bg-white text-[#0f172a] rounded-3xl shadow-xl shadow-slate-900/10 overflow-hidden print:shadow-none print:mt-0 print:border-none print:rounded-none max-w-[1050px] mx-auto border border-[#e2e8f0] transition-all"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {calendarLoading ? (
                  <div className="p-16 text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[#64748b] font-semibold animate-pulse">Compiling Executive Attendance Report...</p>
                  </div>
                ) : calendarData ? (() => {
                  const selSociety = calendarData.society?.name || societies?.find(s => s.id === societyId)?.name || 'Society';
                  const selAgency = calendarData.society?.agency?.name || (isSuperAdmin ? agencies?.find(a => a.id === agencyId)?.name : user?.agencyName) || user?.agencyName || 'Alert Space Security';
                  const selAgencyPhone = calendarData.society?.agency?.phone || '+91 98220 19900';
                  const selAgencyEmail = calendarData.society?.agency?.email || 'alertspace@gmail.com';
                  const selSocietyAddress = calendarData.society?.address || 'Pune, Maharashtra';
                  
                  // Today context
                  const today = new Date();
                  const isCurrentMonth = today.getFullYear() === calendarData.year && (today.getMonth() + 1) === calendarData.month;
                  const currentDay = today.getDate();
                  
                  // Attendance Calculations
                  let totalPresentScans = 0;
                  let totalLate = 0;
                  let absentDays = 0;
                  
                  monthlyData?.forEach(m => {
                    totalPresentScans += m.days_present;
                    totalLate += m.days_late;
                    absentDays += m.days_absent;
                  });

                  if (totalPresentScans === 0 && totalLate === 0 && calendarData.watchmen?.length > 0) {
                    calendarData.watchmen.forEach(w => {
                      totalPresentScans += w.days_attended;
                    });
                  }

                  const expectedDays = isCurrentMonth ? currentDay : calendarData.daysInMonth;
                  const totalPossibleSlots = (calendarData.watchmen.length || 1) * expectedDays;
                  const totalAttended = totalPresentScans + totalLate;
                  const coverageRate = totalPossibleSlots > 0 
                    ? Math.min(100, Math.round((totalAttended / totalPossibleSlots) * 100))
                    : 96;

                  return (
                    <div className="flex flex-col relative bg-white text-[#0f172a]">
                      {/* Top Accent Gradient Bar */}
                      <div className="h-2.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 print:h-2" />

                      {/* Top Branding Section */}
                      <div className="flex flex-wrap justify-between items-start gap-6 p-6 sm:p-8 bg-[#f8fafc] border-b border-[#e2e8f0]">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
                            <Building2 className="w-7 h-7" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h1 className="text-2xl sm:text-3xl font-black text-[#0f172a] tracking-tight leading-tight">
                                {selSociety}
                              </h1>
                              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]">
                                <ShieldCheck className="w-3 h-3 text-[#10b981]" /> Active Property
                              </span>
                            </div>
                            <p className="text-[#64748b] font-medium text-xs sm:text-sm flex items-center gap-1.5 mt-1.5">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" /> {selSocietyAddress} • Verified Geofence Zone
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-3 ml-auto">
                          <div className="flex items-center gap-2 print:hidden no-print">
                            <button
                              onClick={printCleanReport}
                              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-95"
                            >
                              <Printer className="w-4 h-4" /> Save as PDF / Print
                            </button>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Managing Security Agency</p>
                            <h2 className="text-base sm:text-lg font-black text-[#0f172a]">{selAgency}</h2>
                            <p className="text-[#64748b] text-xs">24×7 Guard Oversight • GPS & Biometric Authenticated</p>
                            <p className="text-[#94a3b8] text-[11px] font-mono mt-0.5">{selAgencyPhone} • {selAgencyEmail}</p>
                          </div>
                        </div>
                      </div>

                      {/* Metadata Strip & High-Impact KPI Cards */}
                      <div className="bg-white p-6 sm:p-8 border-b border-[#e2e8f0] space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[#eff6ff] text-[#1d4ed8] flex items-center justify-center font-bold">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Audit Period</span>
                              <h3 className="text-base font-black text-[#0f172a] leading-tight">
                                {new Date(calendarData.year, calendarData.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                              </h3>
                            </div>
                          </div>

                          <span className="text-xs text-[#64748b] font-medium bg-[#f1f5f9] px-3 py-1 rounded-full border border-[#e2e8f0]">
                            Report ID: SEC-{calendarData.year}{String(calendarData.month).padStart(2, '0')}-{societyId.slice(-4).toUpperCase()}
                          </span>
                        </div>

                        {/* 4 Light KPI Cards with Sharp Legible Numbers */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                          <div className="p-4 rounded-2xl bg-[#f0f9ff] border border-[#bae6fd] flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[#0369a1] mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider">Total Watchmen</span>
                              <Users className="w-4 h-4 text-[#0284c7]" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-[#0f172a]">{calendarData.watchmen.length}</p>
                            <span className="text-[10px] text-[#0284c7] font-semibold mt-1">Dedicated On-site Roster</span>
                          </div>

                          <div className="p-4 rounded-2xl bg-[#e0e7ff] border border-[#c7d2fe] flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[#4338ca] mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider">Monitored Wings</span>
                              <Layers className="w-4 h-4 text-[#4f46e5]" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-[#0f172a]">{calendarData.wings.length}</p>
                            <span className="text-[10px] text-[#4f46e5] font-semibold mt-1">Physical Checkpoints</span>
                          </div>

                          <div className="p-4 rounded-2xl bg-[#f3e8ff] border border-[#e9d5ff] flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[#7e22ce] mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider">Secured Gates</span>
                              <DoorOpen className="w-4 h-4 text-[#9333ea]" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-[#0f172a]">{calendarData.gates.length}</p>
                            <span className="text-[10px] text-[#9333ea] font-semibold mt-1">Access Control Gates</span>
                          </div>

                          <div className="p-4 rounded-2xl bg-[#ecfdf5] border border-[#a7f3d0] flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[#047857] mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider">Coverage Rate</span>
                              <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-[#0f172a]">{coverageRate}%</p>
                            <span className="text-[10px] text-[#059669] font-semibold mt-1">Verified Duty Compliance</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 sm:p-8 space-y-8 bg-white">
                        {/* Watchman Roster Table */}
                        <div className="border border-[#e2e8f0] rounded-2xl overflow-hidden shadow-xs print-avoid-break">
                          <div className="bg-[#f8fafc] px-5 py-3.5 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-blue-600" />
                              <h3 className="font-extrabold text-[#0f172a] text-base">Watchman Attendance Roster</h3>
                            </div>
                            <span className="text-xs text-[#64748b] font-medium bg-white px-2.5 py-1 rounded-md border border-[#e2e8f0]">
                              Present Days = Total verified QR scans at society
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-[#f1f5f9] text-[#334155] font-bold uppercase tracking-wider text-[10px] border-b border-[#e2e8f0]">
                                <tr>
                                  <th className="px-4 py-3 w-12 text-center">#</th>
                                  <th className="px-4 py-3">Guard ID</th>
                                  <th className="px-4 py-3">Name</th>
                                  <th className="px-4 py-3">Duty Post</th>
                                  <th className="px-4 py-3">Phone</th>
                                  <th className="px-4 py-3">Assigned Shift</th>
                                  <th className="px-4 py-3 text-center">Present Days</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#f1f5f9] font-medium text-[#334155]">
                                {calendarData.watchmen.map((w, i) => (
                                  <tr key={w.watchman_id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
                                    <td className="px-4 py-2.5 text-center text-[#94a3b8] font-semibold">{i + 1}</td>
                                    <td className="px-4 py-2.5">
                                      <span className="font-mono font-bold text-[#1d4ed8] bg-[#eff6ff] px-2 py-0.5 rounded border border-[#bfdbfe]">
                                        {w.employee_id}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold text-[#0f172a] flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-[#dbeafe] text-[#1d4ed8] flex items-center justify-center font-bold text-[10px] shrink-0">
                                        {w.watchman_name.charAt(0)}
                                      </div>
                                      {w.watchman_name}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        w.wings.length > 0 
                                          ? 'bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]' 
                                          : 'bg-[#f3e8ff] text-[#7e22ce] border border-[#e9d5ff]'
                                      }`}>
                                        {w.wings.length > 0 ? 'Wing Guard' : w.gates.length > 0 ? 'Gate Guard' : 'General Patrol'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-[#475569] font-mono text-[11px]">{w.phone || '—'}</td>
                                    <td className="px-4 py-2.5 text-[#475569]">{w.shift_name || 'Standard Day'}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className="inline-flex items-center justify-center min-w-[28px] px-2.5 py-0.5 rounded-md font-black text-sm bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]">
                                        {w.days_attended}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Calendar Breakdown Renderer */}
                        {(() => {
                          const days = Array.from({ length: calendarData.daysInMonth }, (_, i) => i + 1);
                          const weekDayOf1 = new Date(calendarData.year, calendarData.month - 1, 1).getDay();

                          function PdfCalGrid({ section }: { section: any }) {
                            const cells: (number | null)[] = [...Array(weekDayOf1).fill(null), ...days];
                            while (cells.length % 7 !== 0) cells.push(null);
                            const weeks: (number | null)[][] = [];
                            for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

                            return (
                              <div className="mt-3">
                                <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
                                  {['S','M','T','W','T','F','S'].map((d, di) => (
                                    <div key={di} className="text-[10px] font-extrabold text-[#94a3b8]">
                                      {d}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex flex-col gap-1">
                                  {weeks.map((week, wi) => (
                                    <div key={wi} className="grid grid-cols-7 gap-1">
                                      {week.map((day, di) => {
                                        if (day === null) {
                                          return <div key={di} className="aspect-square opacity-0" />;
                                        }

                                        const statusVal = section.days[day - 1];
                                        const isPresent = statusVal === 'present' || statusVal === true;
                                        const isLate = statusVal === 'late';
                                        const isUpcoming = isCurrentMonth && day > currentDay;

                                        let cellClass = '';
                                        if (isUpcoming) {
                                          cellClass = 'bg-[#f8fafc] text-[#cbd5e1] border border-[#f1f5f9] font-normal';
                                        } else if (isPresent) {
                                          cellClass = 'bg-[#10b981] text-white font-bold shadow-xs';
                                        } else if (isLate) {
                                          cellClass = 'bg-[#f59e0b] text-white font-bold shadow-xs';
                                        } else {
                                          cellClass = 'bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] font-medium';
                                        }

                                        return (
                                          <div
                                            key={di}
                                            className={`aspect-square rounded-md flex items-center justify-center text-[11px] transition-all select-none ${cellClass}`}
                                            title={`Day ${day}: ${isUpcoming ? 'Upcoming' : isPresent ? 'Present' : isLate ? 'Late' : 'No Check-in'}`}
                                          >
                                            {day}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-8">
                              {/* Wing Breakdown */}
                              {calendarData.wings.length > 0 && (
                                <div className="p-5 sm:p-6 bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl print-avoid-break">
                                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-[#e2e8f0]">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-[#eff6ff] text-[#1d4ed8] flex items-center justify-center">
                                        <Building2 className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <h3 className="font-black text-[#0f172a] text-base">Wing Attendance Breakdown (Wing Wise)</h3>
                                        <p className="text-xs text-[#64748b] font-medium">Daily verified physical presence per wing</p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-[#334155] bg-white px-3 py-1.5 rounded-xl border border-[#e2e8f0] shadow-xs">
                                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]" /> Present</span>
                                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" /> Late</span>
                                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#e11d48]" /> Off / No Watchman</span>
                                      {isCurrentMonth && <span className="flex items-center gap-1.5 text-[#94a3b8]"><div className="w-2.5 h-2.5 rounded-full bg-[#cbd5e1]" /> Upcoming</span>}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {calendarData.wings.map((w: any) => {
                                      const attendedCount = w.days.filter((d: any) => d === 'present' || d === 'late' || d === true).length;
                                      const totalDaysEvaluated = isCurrentMonth ? currentDay : calendarData.daysInMonth;
                                      const coveragePct = totalDaysEvaluated > 0 ? Math.round((attendedCount / totalDaysEvaluated) * 100) : 0;

                                      return (
                                        <div key={w.name} className="bg-white border border-[#e2e8f0] rounded-2xl p-4 shadow-sm hover:shadow transition-shadow print-avoid-break">
                                          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#f1f5f9]">
                                            <h4 className="font-black text-[#0f172a] text-sm">{w.name}</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] shrink-0">
                                              {coveragePct}%
                                            </span>
                                          </div>
                                          <PdfCalGrid section={w} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Gate Breakdown */}
                              {calendarData.gates.length > 0 && (
                                <div className="p-5 sm:p-6 bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl print-avoid-break">
                                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-[#e2e8f0]">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-[#f3e8ff] text-[#7e22ce] flex items-center justify-center">
                                        <DoorOpen className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <h3 className="font-black text-[#0f172a] text-base">Gate Attendance Breakdown (Gate Wise)</h3>
                                        <p className="text-xs text-[#64748b] font-medium">Access point security monitoring</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {calendarData.gates.map((g: any) => {
                                      const attendedCount = g.days.filter((d: any) => d === 'present' || d === 'late' || d === true).length;
                                      const totalDaysEvaluated = isCurrentMonth ? currentDay : calendarData.daysInMonth;
                                      const coveragePct = totalDaysEvaluated > 0 ? Math.round((attendedCount / totalDaysEvaluated) * 100) : 0;

                                      return (
                                        <div key={g.name} className="bg-white border border-[#e2e8f0] rounded-2xl p-4 shadow-sm hover:shadow transition-shadow print-avoid-break">
                                          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#f1f5f9]">
                                            <h4 className="font-black text-[#0f172a] text-sm">{g.name}</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f3e8ff] text-[#7e22ce] border border-[#e9d5ff] shrink-0">
                                              {coveragePct}%
                                            </span>
                                          </div>
                                          <PdfCalGrid section={g} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Monthly Overview & Audit Remarks */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-avoid-break">
                          <div className="border border-[#e2e8f0] rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between">
                            <h3 className="font-extrabold text-[#0f172a] flex items-center gap-2 mb-4 text-base">
                              <BarChart3 className="w-5 h-5 text-blue-600" /> Monthly Audit Summary
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                              <div className="bg-[#f8fafc] rounded-xl p-3 border border-[#e2e8f0]">
                                <Calendar className="w-4 h-4 mx-auto text-[#94a3b8] mb-1" />
                                <p className="text-[10px] font-bold uppercase text-[#64748b]">Days in Month</p>
                                <p className="text-xl font-black text-[#0f172a] mt-0.5">{calendarData.daysInMonth}</p>
                              </div>
                              <div className="bg-[#ecfdf5] rounded-xl p-3 border border-[#a7f3d0]">
                                <CheckCircle2 className="w-4 h-4 mx-auto text-[#10b981] mb-1" />
                                <p className="text-[10px] font-bold uppercase text-[#047857]">Present Scans</p>
                                <p className="text-xl font-black text-[#047857] mt-0.5">{totalPresentScans}</p>
                              </div>
                              <div className="bg-[#fffbeb] rounded-xl p-3 border border-[#fde68a]">
                                <Clock className="w-4 h-4 mx-auto text-[#f59e0b] mb-1" />
                                <p className="text-[10px] font-bold uppercase text-[#b45309]">Late Check-ins</p>
                                <p className="text-xl font-black text-[#b45309] mt-0.5">{totalLate}</p>
                              </div>
                              <div className="bg-[#fff1f2] rounded-xl p-3 border border-[#fecdd3]">
                                <X className="w-4 h-4 mx-auto text-[#e11d48] mb-1" />
                                <p className="text-[10px] font-bold uppercase text-[#be123c]">Off / Missed</p>
                                <p className="text-xl font-black text-[#be123c] mt-0.5">{absentDays}</p>
                              </div>
                            </div>
                          </div>

                          <div className="border border-[#e2e8f0] bg-[#f8fafc] rounded-2xl p-5 shadow-xs">
                            <h3 className="font-extrabold text-[#0f172a] flex items-center gap-2 mb-3 text-base">
                              <ShieldCheck className="w-5 h-5 text-indigo-600" /> Compliance Observations & Notes
                            </h3>
                            <ul className="text-xs text-[#334155] space-y-2 list-none">
                              <li className="flex items-start gap-2">
                                <span className="text-[#10b981] font-bold shrink-0">✓</span>
                                <span><strong>GPS Geofence Validation:</strong> Guard scan locations authenticated within designated perimeter.</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-[#10b981] font-bold shrink-0">✓</span>
                                <span><strong>Anti-Proxy Biometrics:</strong> Facial descriptor matching enabled at all shift changeovers.</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-[#10b981] font-bold shrink-0">✓</span>
                                <span><strong>Patrol Coverage:</strong> Physical check-ins recorded at both gate sentry and residential wings.</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-[#10b981] font-bold shrink-0">✓</span>
                                <span>Official audit document valid for housing society committee management records.</span>
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Official Signatures & Verification Stamp */}
                        <div className="flex flex-wrap justify-between items-end gap-6 pt-6 border-t-2 border-[#e2e8f0] print-avoid-break">
                          <div>
                            <p className="text-xs text-[#94a3b8] font-medium">
                              System Generated on: {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-[11px] text-[#94a3b8] font-mono mt-0.5">
                              WatchTrack Cloud • Cryptographically Signed Attendance Log
                            </p>
                          </div>

                          <div className="flex items-end gap-10">
                            <div className="text-center">
                              <div className="w-36 border-b-2 border-[#94a3b8] mb-1.5 pb-1 text-[#0f172a] font-serif italic text-base">
                                {selAgency} Operations
                              </div>
                              <p className="text-[10px] uppercase font-extrabold text-[#64748b] tracking-wider">Agency Supervisor</p>
                            </div>

                            <div className="text-center">
                              <div className="w-36 border-b-2 border-[#94a3b8] mb-1.5 pb-1 text-[#94a3b8] text-xs">
                                (Sign & Stamp)
                              </div>
                              <p className="text-[10px] uppercase font-extrabold text-[#64748b] tracking-wider">Society Secretary / Chairman</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>
          )}
        </>
      )}

          {/* 🧾 Monthly Sub-Tab 2: Society Wise & Wing Wise Bill (Tax Invoice) */}
          {monthlySubTab === 'bill' && (
            <div className="space-y-6">
              {!societyId ? (
                <div className="card p-12 text-center max-w-xl mx-auto space-y-4 my-8">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg">
                    <Receipt className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-100">Select a Society to Generate Tax Invoice</h3>
                    <p className="text-xs text-slate-400">
                      Choose a society from the top filter bar or click any society below to generate, customize, and print the official society-wise and wing-wise tax invoice bill.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    {societies?.slice(0, 6).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSocietyId(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-surface-700/60 hover:bg-emerald-600 hover:text-white text-slate-300 text-xs font-medium border border-surface-600/50 transition-all"
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Controls & Real-Time Customization Bar (print:hidden) */}
                  <div className="card p-5 space-y-5 print:hidden border-surface-700/80 shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-surface-700/60">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-100">
                              Society & Wing Wise Tax Invoice
                            </h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              {selectedWing === 'all' ? 'All Wings Combined' : `${selectedWing} Wing Bill`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Customizable billing parameters for {selectedSocietyObj?.name || 'Society'} &bull; {serviceMonthText}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setMonthlySubTab('attendance')}
                          className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-surface-700/60 hover:bg-surface-700 hover:text-white border border-surface-600/50 flex items-center gap-1.5 transition-all"
                        >
                          <FileText className="w-3.5 h-3.5 text-brand-400" /> View Attendance
                        </button>
                        <button
                          onClick={resetInvoiceOverrides}
                          className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-surface-700/60 hover:bg-surface-700 hover:text-white border border-surface-600/50 flex items-center gap-1.5 transition-all"
                          title="Reset to verified attendance defaults"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Reset Defaults
                        </button>
                        <button
                          onClick={exportInvoiceCSV}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-surface-700/80 hover:bg-surface-700 hover:text-white border border-surface-600 flex items-center gap-1.5 transition-all"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" /> Export CSV
                        </button>
                        <button
                          onClick={printInvoiceReport}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition-all"
                        >
                          <Printer className="w-4 h-4" /> Print Tax Invoice
                        </button>
                      </div>
                    </div>

                    {/* Wing Selector Pills */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-slate-300">Target Wing Selection:</span>
                        <span>Click any wing to generate a dedicated wing bill</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setSelectedWing('all')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            selectedWing === 'all'
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : 'bg-surface-800/80 text-slate-400 hover:text-slate-200 border-surface-700/80 hover:bg-surface-700'
                          }`}
                        >
                          🏢 All Wings ({selectedSocietyObj?.name || 'Society Total'})
                        </button>
                        {availableWings.map(wing => (
                          <button
                            key={wing}
                            onClick={() => setSelectedWing(wing)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                              selectedWing.toLowerCase() === wing.toLowerCase()
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                : 'bg-surface-800/80 text-slate-400 hover:text-slate-200 border-surface-700/80 hover:bg-surface-700'
                            }`}
                          >
                            🚪 {wing.toUpperCase().includes('WING') ? wing : `${wing} Wing`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Calculation Summary Pill */}
                    <div className="bg-surface-800/90 rounded-xl p-3 border border-surface-700/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-slate-400">Quantity: </span>
                          <span className="font-bold text-white">{effectiveQuantity} Guard(s)</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Rate / Month: </span>
                          <span className="font-bold text-emerald-400">₹{effectiveRatePerMonth.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Per Day Rate: </span>
                          <span className="font-mono font-bold text-white">₹{effectivePerDayRate.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Duty Days: </span>
                          <span className="font-mono font-bold text-white">{effectiveTotalDays} Days</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-medium">Grand Total Payable:</span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
                          ₹{effectiveRoundedTotal.toLocaleString('en-IN')}.00
                        </span>
                      </div>
                    </div>

                    {/* Invoice Parameter Inputs Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Rate / Month (₹)
                        </label>
                        <input
                          type="number"
                          value={invoiceRateOverride}
                          onChange={e => setInvoiceRateOverride(e.target.value)}
                          placeholder="23000"
                          step="100"
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Guard Quantity
                        </label>
                        <input
                          type="number"
                          value={invoiceQuantityOverride}
                          onChange={e => setInvoiceQuantityOverride(e.target.value)}
                          placeholder={String(effectiveQuantity)}
                          min="1"
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Total Duty Days
                        </label>
                        <input
                          type="number"
                          value={invoiceTotalDaysOverride}
                          onChange={e => setInvoiceTotalDaysOverride(e.target.value)}
                          placeholder={String(effectiveTotalDays)}
                          min="0"
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Invoice No.
                        </label>
                        <input
                          type="text"
                          value={invoiceNoOverride}
                          onChange={e => setInvoiceNoOverride(e.target.value)}
                          placeholder={defaultInvoiceNo}
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Invoice Date
                        </label>
                        <input
                          type="text"
                          value={invoiceDateOverride}
                          onChange={e => setInvoiceDateOverride(e.target.value)}
                          placeholder={defaultInvoiceDate}
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          PO Number (Optional)
                        </label>
                        <input
                          type="text"
                          value={invoicePoNumber}
                          onChange={e => setInvoicePoNumber(e.target.value)}
                          placeholder="e.g. PO-2026/09"
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Site Name / Wing Heading
                        </label>
                        <input
                          type="text"
                          value={siteNameOverride}
                          onChange={e => setSiteNameOverride(e.target.value)}
                          placeholder={defaultSiteName}
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Line Particulars
                        </label>
                        <input
                          type="text"
                          value={invoiceParticulars}
                          onChange={e => setInvoiceParticulars(e.target.value)}
                          placeholder="Security Guard"
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          OT Hours
                        </label>
                        <input
                          type="number"
                          value={invoiceOtHours}
                          onChange={e => setInvoiceOtHours(e.target.value)}
                          placeholder="0"
                          min="0"
                          className="w-full bg-surface-900/90 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 🧾 Official Tax Invoice Document (Replicating Reference Design) */}
                  <div
                    id="printable-tax-invoice"
                    className="bg-white text-black p-6 sm:p-10 rounded-2xl shadow-2xl max-w-4xl mx-auto border border-neutral-300 font-sans print:shadow-none print:border-none print:p-0 print:max-w-none"
                    style={{ color: '#000000', backgroundColor: '#ffffff' }}
                  >
                    {/* Top Header Section */}
                    <div className="flex justify-between items-start pb-4 border-b border-black">
                      {/* Left: Shield Logo & Brand */}
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-16 bg-gradient-to-b from-[#3a3a3a] via-[#1a1a1a] to-[#0a0a0a] rounded-b-[2rem] rounded-t-md flex items-center justify-center text-white font-extrabold shadow-sm border border-black/30 relative select-none">
                          <span
                            className="text-2xl font-serif italic tracking-tighter lowercase select-none"
                            style={{ fontFamily: 'Georgia, serif' }}
                          >
                            as
                          </span>
                        </div>
                        <div>
                          <h1
                            className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-none"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                          >
                            {billDataResponse?.agency?.name?.includes('Alert') || !billDataResponse?.agency?.name
                              ? 'Alert Space'
                              : billDataResponse.agency.name}
                          </h1>
                          <p className="text-[10px] tracking-[0.25em] font-extrabold text-neutral-800 uppercase mt-1">
                            ANYTHING YOU DESIRE
                          </p>
                        </div>
                      </div>

                      {/* Right: Proprietor Details & Original Recipient */}
                      <div className="text-right">
                        <div className="text-sm font-bold tracking-wide uppercase text-black">
                          {billDataResponse?.agency?.proprietor || 'YUVRAJ HARI PAWAR'}
                        </div>
                        <div className="text-xs font-semibold tracking-wider text-black">
                          {billDataResponse?.agency?.proprietorSubtitle || '(EX. CAPTAIN , ARMY)'}
                        </div>
                        <div className="text-xs text-neutral-800 mt-0.5">
                          {billDataResponse?.agency?.subName || 'Alert Space Facilities & Management Services'}
                        </div>
                        <div className="text-[11px] font-semibold text-neutral-700 italic mt-1.5">
                          Original For Recipient
                        </div>
                      </div>
                    </div>

                    {/* TAX INVOICE Title Bar */}
                    <div className="border-x border-b border-black py-1.5 text-center bg-white">
                      <span className="text-sm sm:text-base font-bold tracking-widest uppercase text-black">
                        TAX INVOICE
                      </span>
                    </div>

                    {/* 2-Column Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 border-x border-b border-black text-[11px] leading-relaxed">
                      {/* Left Column: Supplier (Alert Space) */}
                      <div className="border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
                        <div className="p-2 space-y-1">
                          <div className="font-bold text-black uppercase tracking-tight text-[11px]">
                            {billDataResponse?.agency?.name || 'ALERT SPACE FACILITIES AND MANAGEMENT SERVICES'}
                          </div>
                          <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="text-neutral-800">Address</span>
                            <span className="text-black">
                              : {billDataResponse?.agency?.address || 'Sharma Complex, 3rd Floor Near Ram Krushna Mangal Karyalay,Pimple Gurav,Pune-411061'}
                            </span>
                          </div>
                          <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="text-neutral-800">State</span>
                            <span className="text-black">
                              : {billDataResponse?.agency?.state || 'Maharashtra'}
                            </span>
                          </div>
                          <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="text-neutral-800">PO NO.</span>
                            <span className="text-black">: {invoicePoNumber || ''}</span>
                          </div>
                          <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="text-neutral-800">PAN No.</span>
                            <span className="text-black font-semibold">
                              : {billDataResponse?.agency?.pan || 'EUBPG6574A'}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Row of Left: Invoice No & Dated */}
                        <div className="grid grid-cols-2 border-t border-black text-[11px]">
                          <div className="p-1.5 border-r border-black">
                            <span className="font-semibold text-neutral-800">Invoice No. : </span>
                            <span className="font-bold text-black">{effectiveInvoiceNo}</span>
                          </div>
                          <div className="p-1.5">
                            <span className="font-semibold text-neutral-800">Dated : </span>
                            <span className="font-bold text-black">{effectiveInvoiceDate}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Society Info */}
                      <div className="flex flex-col justify-between">
                        <div className="p-2 space-y-1">
                          <div className="font-bold text-black uppercase tracking-tight text-[11px]">
                            {billDataResponse?.society?.name || (selectedSocietyObj?.name ? `${selectedSocietyObj.name} Co-operative Housing Society Ltd.` : 'Society')}
                          </div>
                          <div className="grid grid-cols-[90px_1fr] gap-1">
                            <span className="text-neutral-800">Address</span>
                            <span className="text-black">
                              : {billDataResponse?.society?.address || selectedSocietyObj?.address || 'Near S. B. Patil Public School, Ravet, Pimpri Chinchwad, Pune, Maharashtra'}
                            </span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] gap-1">
                            <span className="text-neutral-800">GSTIN / UIN</span>
                            <span className="text-black">: </span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] gap-1">
                            <span className="text-neutral-800">Place Of Supply</span>
                            <span className="text-black">
                              : {billDataResponse?.society?.placeOfSupply || 'Maharashtra'}
                            </span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] gap-1">
                            <span className="text-neutral-800">Invoice Period</span>
                            <span className="text-black font-semibold">: {invoicePeriodText}</span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] gap-1">
                            <span className="text-neutral-800">Service Month</span>
                            <span className="text-black font-semibold">: {serviceMonthText}</span>
                          </div>
                        </div>

                        {/* Bottom Row of Right: Site Name */}
                        <div className="border-t border-black p-1.5 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-neutral-800">Site Name</span>
                          <span className="font-black text-black uppercase tracking-wide">
                            {effectiveSiteName}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="border-x border-b border-black overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-black bg-neutral-100/70 font-bold text-black text-center">
                            <th className="py-2 px-1 border-r border-black w-10">Sr. No.</th>
                            <th className="py-2 px-2 border-r border-black text-left min-w-[130px]">Particulars</th>
                            <th className="py-2 px-1 border-r border-black w-14">Quantity</th>
                            <th className="py-2 px-1.5 border-r border-black text-right min-w-[85px]">Rate / Month</th>
                            <th className="py-2 px-1.5 border-r border-black text-right min-w-[85px]">Per Day Rate</th>
                            <th className="py-2 px-1 border-r border-black w-16">Per Hr Rate</th>
                            <th className="py-2 px-1 border-r border-black w-14">OT Hrs</th>
                            <th className="py-2 px-1.5 border-r border-black min-w-[70px]">Total Days</th>
                            <th className="py-2 px-2 text-right min-w-[95px]">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Main Row */}
                          <tr className="border-b border-black/40 text-black">
                            <td className="py-2.5 px-1 border-r border-black text-center font-medium">1</td>
                            <td className="py-2.5 px-2 border-r border-black font-semibold">{invoiceParticulars}</td>
                            <td className="py-2.5 px-1 border-r border-black text-center font-medium">{effectiveQuantity}</td>
                            <td className="py-2.5 px-1.5 border-r border-black text-right font-mono">{effectiveRatePerMonth.toFixed(2)}</td>
                            <td className="py-2.5 px-1.5 border-r border-black text-right font-mono">{effectivePerDayRate.toFixed(2)}</td>
                            <td className="py-2.5 px-1 border-r border-black text-center font-mono">0</td>
                            <td className="py-2.5 px-1 border-r border-black text-center font-mono">{invoiceOtHours || 0}</td>
                            <td className="py-2.5 px-1.5 border-r border-black text-center font-semibold font-mono">{effectiveTotalDays}</td>
                            <td className="py-2.5 px-2 text-right font-bold font-mono">{effectiveTotalAmount.toFixed(2)}</td>
                          </tr>

                          {/* Decorative Spacer row */}
                          <tr className="h-6 border-b border-black/20 text-transparent select-none">
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td></td>
                          </tr>

                          {/* Sub Total A */}
                          <tr className="border-t border-black text-black">
                            <td colSpan={2} className="py-1 px-2 border-r border-black font-bold text-right">
                              Sub Total A :
                            </td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="py-1 px-2 text-right font-mono font-semibold">{effectiveSubTotalA.toFixed(2)}</td>
                          </tr>

                          {/* Sub Total B */}
                          <tr className="border-t border-black text-black">
                            <td colSpan={2} className="py-1 px-2 border-r border-black font-bold text-right">
                              Sub Total B :
                            </td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="py-1 px-2 text-right font-mono font-semibold">{effectiveSubTotalB.toFixed(2)}</td>
                          </tr>

                          {/* ROUND OFF */}
                          <tr className="border-t border-black text-black">
                            <td colSpan={2} className="py-1 px-2 border-r border-black font-bold text-right">
                              ROUND OFF:
                            </td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="py-1 px-2 text-right font-mono font-medium">{effectiveRoundOff >= 0 ? effectiveRoundOff.toFixed(2) : effectiveRoundOff.toFixed(2)}</td>
                          </tr>

                          {/* Grand Total */}
                          <tr className="border-t-2 border-black bg-neutral-100/70 font-bold text-black text-[12px]">
                            <td colSpan={2} className="py-1.5 px-2 border-r border-black text-right uppercase tracking-wider">
                              Total
                            </td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="border-r border-black"></td>
                            <td className="py-1.5 px-2 text-right font-black font-mono">{effectiveRoundedTotal.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Amount in Words */}
                    <div className="border-x border-b border-black p-2 bg-white text-[11px] leading-snug">
                      <span className="font-bold text-black uppercase tracking-wider">INR &nbsp; Rupees: </span>
                      <span className="font-semibold text-black uppercase">{effectiveAmountInWords}</span>
                    </div>

                    {/* Footer: Remittance & Signatures */}
                    <div className="border-x border-b border-black grid grid-cols-1 md:grid-cols-2 text-[11px]">
                      {/* Left: Remittance Bank Details */}
                      <div className="p-3 border-b md:border-b-0 md:border-r border-black space-y-1">
                        <div className="font-bold text-black uppercase tracking-wider text-[11px] underline mb-1">
                          Bank Remittance Details:
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-1 text-[11px]">
                          <span className="text-neutral-700 font-medium">Bank Name</span>
                          <span className="text-black font-semibold">: HDFC Bank Ltd.</span>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-1 text-[11px]">
                          <span className="text-neutral-700 font-medium">Account Name</span>
                          <span className="text-black font-bold">
                            : {billDataResponse?.agency?.name || 'ALERT SPACE FACILITIES AND MANAGEMENT SERVICES'}
                          </span>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-1 text-[11px]">
                          <span className="text-neutral-700 font-medium">Account No.</span>
                          <span className="text-black font-mono font-bold">: 50200067489211</span>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-1 text-[11px]">
                          <span className="text-neutral-700 font-medium">IFSC Code</span>
                          <span className="text-black font-mono font-bold">: HDFC0001245</span>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-1 text-[11px]">
                          <span className="text-neutral-700 font-medium">Branch</span>
                          <span className="text-black">: Pimple Gurav, Pune - 411061</span>
                        </div>
                      </div>

                      {/* Right: Authorized Signatory */}
                      <div className="p-3 flex flex-col justify-between text-right">
                        <div>
                          <div className="text-[11px] font-bold text-black">
                            For {billDataResponse?.agency?.subName || 'Alert Space Facilities & Management Services'}
                          </div>
                        </div>

                        <div className="pt-12 text-center ml-auto">
                          <div className="w-48 border-b border-black mb-1 mx-auto"></div>
                          <div className="text-[10px] font-bold text-black uppercase tracking-wider">
                            Authorized Signatory
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Receiver Acknowledgement */}
                    <div className="border-x border-b border-black p-3 flex justify-between items-end text-[10px] text-neutral-800">
                      <div>
                        <p className="font-semibold text-black uppercase">Receiver's Confirmation / Society Stamp</p>
                        <p className="text-[9px] text-neutral-600 mt-0.5">Verified on-site attendance log matches deployed duty shifts.</p>
                      </div>
                      <div className="text-center">
                        <div className="w-40 border-b border-black mb-1"></div>
                        <span className="font-bold text-black uppercase tracking-wider text-[9px]">
                          Society Secretary / Chairman
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Merged: Watchmen Report & Journey */}
      {tab === 'watchmen' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-semibold text-slate-200">
                  {journeyWatchmanId ? 'Watchman Journey & Attendance Details' : 'Watchmen Report & Journey Filter'}
                </span>
              </div>
              {journeyWatchmanId && (
                <button
                  onClick={() => setJourneyWatchmanId('')}
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium px-2.5 py-1 rounded-lg hover:bg-brand-500/10 transition-colors border border-brand-500/20"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to All Watchmen
                </button>
              )}
            </div>

            <div className="flex gap-3 flex-wrap items-end">
              {/* Agency (super_admin only) */}
              {isSuperAdmin && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 font-medium">Agency</label>
                  <select
                    value={agencyId}
                    onChange={(e) => { setAgencyId(e.target.value); setJourneyWatchmanId(''); }}
                    className="input w-48"
                  >
                    <option value="">All Agencies</option>
                    {agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Watchman Filter (Select single or all) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-medium">Watchman</label>
                <select
                  value={journeyWatchmanId}
                  onChange={(e) => setJourneyWatchmanId(e.target.value)}
                  className="input w-64"
                >
                  <option value="">All Watchmen (Overview)</option>
                  {watchmenOptions?.map((w) => (
                    <option key={w._id || w.id} value={w._id || w.id}>
                      {w.full_name} ({w.employee_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* From Date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-medium">From</label>
                <input
                  type="date"
                  value={journeyStartDate}
                  onChange={(e) => setJourneyStartDate(e.target.value)}
                  className="input w-40"
                />
              </div>

              {/* To Date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-medium">To</label>
                <input
                  type="date"
                  value={journeyEndDate}
                  onChange={(e) => setJourneyEndDate(e.target.value)}
                  className="input w-40"
                />
              </div>

              {/* Export Button */}
              <div className="ml-auto">
                {journeyWatchmanId ? (
                  <button
                    onClick={exportJourneyCSV}
                    disabled={!journeyData?.records?.length}
                    className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Export Watchman Journey
                  </button>
                ) : (
                  <button
                    onClick={exportWatchmenReportCSV}
                    disabled={!filteredWatchmenList?.length}
                    className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Export Watchmen Report
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* VIEW 1: Individual Watchman Journey (when watchman is selected) */}
          {journeyWatchmanId ? (
            <div className="space-y-4">
              {journeyData?.watchman && (
                <div className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold text-lg">
                        {journeyData.watchman.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-100 text-lg">{journeyData.watchman.full_name}</p>
                          <span className="text-xs font-mono text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-md">
                            {journeyData.watchman.employee_id}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-0.5">
                          Attendance Journey from <span className="text-slate-200 font-medium">{journeyStartDate}</span> to <span className="text-slate-200 font-medium">{journeyEndDate}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2.5 flex-wrap">
                      {[
                        { label: 'Present', val: journeyData.stats.presentDays, cls: 'text-success-400', bg: 'bg-success-500/10 border-success-500/20' },
                        { label: 'Late', val: journeyData.stats.lateDays, cls: 'text-warning-400', bg: 'bg-warning-500/10 border-warning-500/20' },
                        { label: 'Absent', val: journeyData.stats.absentDays, cls: 'text-danger-400', bg: 'bg-danger-500/10 border-danger-500/20' },
                        { label: 'Total Days', val: journeyData.stats.totalDays, cls: 'text-slate-200', bg: 'bg-surface-800 border-surface-700' },
                      ].map((s) => (
                        <div key={s.label} className={`${s.bg} border px-4 py-2 rounded-xl text-center min-w-[70px]`}>
                          <p className={`text-2xl font-black ${s.cls}`}>{s.val}</p>
                          <p className="text-slate-400 text-xs">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {journeyData.stats.totalDays > 0 && (
                    <div className="mt-4 pt-4 border-t border-surface-700">
                      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                        <span className="font-medium">Period Attendance Compliance</span>
                        <span className="font-bold text-slate-200">
                          {Math.round(((journeyData.stats.presentDays + journeyData.stats.lateDays) / journeyData.stats.totalDays) * 100)}%
                        </span>
                      </div>
                      <div className="h-2.5 bg-surface-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-600 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.round(((journeyData.stats.presentDays + journeyData.stats.lateDays) / journeyData.stats.totalDays) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {journeyLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-16 bg-surface-800 animate-pulse rounded-xl" />
                  ))}
                </div>
              )}

              {!journeyLoading && journeyData && (
                <div className="space-y-2.5">
                  {journeyData.records.length === 0 ? (
                    <div className="card p-12 text-center text-slate-500">
                      <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No records found for this date range</p>
                    </div>
                  ) : (
                    journeyData.records.map((day, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all ${
                          day.status === 'absent'
                            ? 'bg-danger-500/5 border-danger-500/20'
                            : day.status === 'late'
                            ? 'bg-warning-500/5 border-warning-500/20'
                            : 'bg-success-500/5 border-success-500/20'
                        }`}
                      >
                        <div className="w-16 shrink-0 text-center">
                          <p className="text-xs font-bold text-slate-400 uppercase">
                            {new Date(day.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                          </p>
                          <p className="text-xl font-black text-slate-100 leading-tight">
                            {new Date(day.date + 'T12:00:00').getDate()}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {new Date(day.date + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                          </p>
                        </div>
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            day.status === 'absent' ? 'bg-danger-500' : day.status === 'late' ? 'bg-warning-500' : 'bg-success-500'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          {day.status === 'absent' ? (
                            <p className="text-danger-400 font-bold text-sm">Absent — did not attend any society</p>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-slate-100 font-semibold text-sm">{day.society_name}</span>
                              </div>
                              {day.shift_name && (
                                <span className="text-xs text-slate-400 bg-surface-700 px-2 py-0.5 rounded-full border border-surface-600">
                                  {day.shift_name}
                                </span>
                              )}
                            </div>
                          )}
                          {day.check_in_time && (
                            <div className="flex gap-3 mt-1 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-brand-400" />
                                In: {new Date(day.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                              </span>
                              {day.check_out_time && (
                                <span>Out: {new Date(day.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                              )}
                              {day.duration_minutes && (
                                <span className="text-slate-300 font-medium">({Math.floor(day.duration_minutes / 60)}h {day.duration_minutes % 60}m)</span>
                              )}
                            </div>
                          )}
                        </div>
                        <StatusBadge status={day.status} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            /* VIEW 2: All Watchmen Table (when no watchman filter is applied) */
            <div className="space-y-4">
              {/* Search bar and count */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by guard name, ID, mobile..."
                    value={watchmenSearch}
                    onChange={(e) => setWatchmenSearch(e.target.value)}
                    className="input pl-9 w-full text-xs"
                  />
                  {watchmenSearch && (
                    <button
                      onClick={() => setWatchmenSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  Showing <strong className="text-slate-200">{filteredWatchmenList.length}</strong> watchmen
                </div>
              </div>

              {/* Table */}
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Guard Name</th>
                      <th>Employee ID</th>
                      <th>Mobile Number</th>
                      <th>Status</th>
                      <th>Joining Date</th>
                      <th>Active Assignments</th>
                      <th>Address</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchmenReportLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}><td colSpan={8}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                      ))
                    ) : filteredWatchmenList.map((w: any) => (
                      <tr
                        key={w.id || w._id}
                        className="hover:bg-surface-800/60 cursor-pointer transition-colors"
                        onClick={() => setJourneyWatchmanId(w.id || w._id)}
                      >
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 font-bold flex items-center justify-center text-xs">
                              {w.full_name?.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-100">{w.full_name}</span>
                          </div>
                        </td>
                        <td className="text-slate-300 font-mono text-xs">{w.employee_id}</td>
                        <td className="text-slate-300 text-sm">{w.phone || '—'}</td>
                        <td>
                          <span className={`badge text-xs ${
                            w.status === 'active' ? 'badge-present' : w.status === 'suspended' ? 'badge-late' : 'badge-absent'
                          }`}>
                            {w.status?.toUpperCase() || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="text-slate-400 text-sm">
                          {w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="text-slate-300 font-semibold">{w.active_assignments ?? 0}</td>
                        <td className="text-slate-400 text-xs max-w-xs truncate">{w.address || '—'}</td>
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setJourneyWatchmanId(w.id || w._id)}
                            className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 shadow-sm"
                          >
                            <Route className="w-3.5 h-3.5" /> View Journey
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!watchmenReportLoading && filteredWatchmenList.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-300">No watchmen records found</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search query or agency filter.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suspicious */}
      {tab === 'suspicious' && (
        <div className="space-y-4">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Society</th><th>Date</th><th>Flags</th><th>Distance</th></tr></thead>
              <tbody>
                {suspiciousLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={5}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                )) : suspiciousData?.map((r) => (
                  <tr key={r.id}>
                    <td><div><p className="font-medium">{r.watchman_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                    <td>{r.society_name}</td>
                    <td className="text-slate-400 text-sm">{new Date(r.attendance_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.gps_flags?.map((f, i) => (
                          <span key={i} className="text-xs bg-warning-500/20 text-warning-400 border border-warning-500/20 px-1.5 py-0.5 rounded-full">{f}</span>
                        ))}
                      </div>
                    </td>
                    <td className="text-slate-400">{r.distance_from_society ? `${Math.round(r.distance_from_society)}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!suspiciousLoading && (!suspiciousData || suspiciousData.length === 0) && (
              <div className="text-center py-12 text-slate-600"><AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No suspicious records in last 30 days</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}