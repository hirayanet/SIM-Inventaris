import { useState, useEffect } from 'react';
import { useAuth } from '@/react-app/hooks/useAuth';
import useReportExport from '@/react-app/hooks/useReportExport';
import { Inventaris, Obat } from '@/shared/types';
import { supabase } from '@/lib/supabase';
import { 
  BarChart3,
  Package,
  Pill,
  AlertTriangle,
  XCircle,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell
} from 'recharts';

interface ReportData {
  inventaris: Inventaris[];
  obat: Obat[];
  statistik: {
    total_inventaris: number;
    total_obat: number;
    kondisi_barang: { [key: string]: number };
    kategori_inventaris: { [key: string]: number };
    lokasi_distribution: { [key: string]: number };
    low_stock_count: number;
    damaged_items_count: number;
  };
}

export default function LaporanPage() {
  const { user } = useAuth();
  const { exportToPDF, exportToExcel, isExporting } = useReportExport();
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');
  const [selectedReport, setSelectedReport] = useState('overview');
  // Filter lokasi per tab (admin only UI)
  const [filterLokasiInventory, setFilterLokasiInventory] = useState<string>('');
  const [filterLokasiMedicine, setFilterLokasiMedicine] = useState<string>('');

  // Display helper: rename TK -> TBSD for UI only
  const displayLokasi = (l: string) => (l === 'TK' ? 'TBSD' : l);

  // Fungsi untuk mendapatkan urutan lokasi
  const getLokasiOrder = (lokasi: string): number => {
    switch (lokasi) {
      case 'PAUD': return 0;
      case 'TK': return 1;
      case 'SD': return 2;
      case 'SMP': return 3;
      default: return 99;
    }
  };

  // Fungsi untuk mengurutkan data obat
  const getSortedObat = (obatList: Obat[]) => {
    return [...obatList].sort((a, b) => {
      // Urutkan berdasarkan lokasi terlebih dahulu (PAUD -> TK -> SD -> SMP)
      const orderA = getLokasiOrder(a.lokasi);
      const orderB = getLokasiOrder(b.lokasi);
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Jika lokasi sama, urutkan berdasarkan nama obat (A-Z)
      return a.nama_obat.localeCompare(b.nama_obat);
    });
  };

  useEffect(() => {
    fetchReportData();
  }, [user, selectedPeriod]);

  const fetchReportData = async () => {
    if (!user) return;
    
    try {
      const [{ data: inventarisData, error: invErr }, { data: obatData, error: obatErr }] = await Promise.all([
        supabase.from('inventaris').select('*'),
        supabase.from('obat').select('*'),
      ]);
      if (invErr) throw invErr;
      if (obatErr) throw obatErr;

      const inventaris = (inventarisData || []) as Inventaris[];
      const obat = (obatData || []) as Obat[];

      // Calculate statistics
      const statistik = {
        total_inventaris: inventaris.reduce((sum: number, item: Inventaris) => sum + item.jumlah, 0),
        total_obat: obat.reduce((sum: number, item: Obat) => sum + item.jumlah, 0),
        kondisi_barang: inventaris.reduce((acc: any, item: Inventaris) => {
          acc[item.kondisi] = (acc[item.kondisi] || 0) + item.jumlah;
          return acc;
        }, {}),
        kategori_inventaris: inventaris.reduce((acc: any, item: Inventaris) => {
          acc[item.kategori] = (acc[item.kategori] || 0) + item.jumlah;
          return acc;
        }, {}),
        lokasi_distribution: [...inventaris, ...obat].reduce((acc: any, item: any) => {
          acc[item.lokasi] = (acc[item.lokasi] || 0) + item.jumlah;
          return acc;
        }, {}),
        low_stock_count: obat.filter((item: Obat) => item.jumlah <= item.batas_minimal).length,
        damaged_items_count: inventaris.filter((item: Inventaris) => item.kondisi === 'Rusak Berat').length
      };

      setData({ inventaris, obat, statistik });
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'this_week': return 'Minggu Ini';
      case 'this_month': return 'Bulan Ini';
      case 'this_quarter': return 'Kuartal Ini';
      case 'this_year': return 'Tahun Ini';
      default: return 'Bulan Ini';
    }
  };

  const generatePDFReport = () => {
    if (!data) return;
    // Tentukan data terfilter untuk export berdasarkan tab aktif
    let exportData = data;
    let periodLabel = getPeriodLabel(selectedPeriod);
    if (selectedReport === 'inventory' && filterLokasiInventory) {
      exportData = {
        ...data,
        inventaris: (data.inventaris || []).filter((i) => i.lokasi === filterLokasiInventory),
      };
      periodLabel = `${periodLabel} • Lokasi: ${displayLokasi(filterLokasiInventory)}`;
    } else if (selectedReport === 'medicine' && filterLokasiMedicine) {
      exportData = {
        ...data,
        obat: (data.obat || []).filter((o) => o.lokasi === filterLokasiMedicine),
      };
      periodLabel = `${periodLabel} • Lokasi: ${displayLokasi(filterLokasiMedicine)}`;
    }

    exportToPDF(
      exportData, 
      exportData.statistik, 
      selectedReport as 'overview' | 'inventory' | 'medicine' | 'condition' | 'all', 
      periodLabel
    );
  };

  const generateExcelReport = () => {
    if (!data) return;
    // Tentukan data terfilter untuk export berdasarkan tab aktif
    let exportData = data;
    let periodLabel = getPeriodLabel(selectedPeriod);
    if (selectedReport === 'inventory' && filterLokasiInventory) {
      exportData = {
        ...data,
        inventaris: (data.inventaris || []).filter((i) => i.lokasi === filterLokasiInventory),
      };
      periodLabel = `${periodLabel} • Lokasi: ${displayLokasi(filterLokasiInventory)}`;
    } else if (selectedReport === 'medicine' && filterLokasiMedicine) {
      exportData = {
        ...data,
        obat: (data.obat || []).filter((o) => o.lokasi === filterLokasiMedicine),
      };
      periodLabel = `${periodLabel} • Lokasi: ${displayLokasi(filterLokasiMedicine)}`;
    }

    exportToExcel(
      exportData, 
      exportData.statistik, 
      selectedReport as 'overview' | 'inventory' | 'medicine' | 'condition' | 'all', 
      periodLabel
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Gagal memuat data laporan</p>
      </div>
    );
  }

  // Prepare chart data
  const kondisiData = Object.entries(data.statistik.kondisi_barang).map(([kondisi, jumlah]) => ({
    name: kondisi,
    value: jumlah
  }));

  const kategoriData = Object.entries(data.statistik.kategori_inventaris).map(([kategori, jumlah]) => ({
    name: kategori,
    value: jumlah
  }));

  const lokasiData = Object.entries(data.statistik.lokasi_distribution).map(([lokasi, jumlah]) => ({
    name: displayLokasi(lokasi),
    value: jumlah
  }));

  const colors = ['#10B981', '#F59E0B', '#34D399', '#FCD34D', '#065F46'];

  // Data terfilter berdasarkan lokasi (untuk tab)
  const filteredInventaris = (data?.inventaris || []).filter((item) => !filterLokasiInventory || item.lokasi === filterLokasiInventory);
  const sortedMedicine = getSortedObat(data?.obat || []);
  const filteredMedicine = sortedMedicine.filter((item) => !filterLokasiMedicine || item.lokasi === filterLokasiMedicine);
  const totalStokMedicine = filteredMedicine.reduce((sum, item) => sum + (item.jumlah || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan</h1>
          <p className="text-gray-600 mt-1">Laporan dan analisis data inventaris</p>
        </div>
        <div className="flex space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="this_week">Minggu Ini</option>
            <option value="this_month">Bulan Ini</option>
            <option value="this_quarter">Kuartal Ini</option>
            <option value="this_year">Tahun Ini</option>
          </select>
          <button
            onClick={generatePDFReport}
            disabled={isExporting}
            className="flex items-center space-x-2 bg-accent-600 text-white px-4 py-2 rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            <span>{isExporting ? 'Memproses...' : 'Export PDF'}</span>
          </button>
          <button
            onClick={generateExcelReport}
            disabled={isExporting}
            className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isExporting ? 'Memproses...' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex space-x-4 overflow-x-auto">
          <button
            onClick={() => setSelectedReport('overview')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedReport === 'overview' 
                ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Ringkasan</span>
          </button>
          <button
            onClick={() => setSelectedReport('inventory')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedReport === 'inventory' 
                ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Inventaris</span>
          </button>
          <button
            onClick={() => setSelectedReport('medicine')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedReport === 'medicine' 
                ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Pill className="w-4 h-4" />
            <span>Obat-obatan</span>
          </button>
          <button
            onClick={() => setSelectedReport('condition')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedReport === 'condition' 
                ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Kondisi Barang</span>
          </button>
        </div>
      </div>

      {/* Overview Report */}
      {selectedReport === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Inventaris</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {data.statistik.total_inventaris.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary-500 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Obat</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {data.statistik.total_obat.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary-500 rounded-lg flex items-center justify-center">
                  <Pill className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Stok Menipis/Kadaluarsa</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {data.statistik.low_stock_count}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    * Otomatis dikurangi jika kadaluarsa
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Barang Rusak</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {data.statistik.damaged_items_count}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Distribution */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Distribusi Kategori Inventaris
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={kategoriData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {kategoriData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Location Distribution */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Distribusi per Lokasi
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lokasiData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Report */}
      {selectedReport === 'inventory' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Detail Inventaris
            </h3>
            {/* Filter Lokasi (Admin) */}
            {user?.role === 'admin' && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <select
                  value={filterLokasiInventory}
                  onChange={(e) => setFilterLokasiInventory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-auto"
                >
                  <option value="">Semua Lokasi</option>
                  <option value="PAUD">PAUD</option>
                  <option value="TK">TBSD</option>
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                </select>
                <div className="text-sm text-gray-600">
                  {filteredInventaris.length} dari {(data?.inventaris || []).length} item
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nama Barang
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Kategori
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Jumlah
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Lokasi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Kondisi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tanggal Input
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInventaris.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {item.nama_barang}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {item.kategori}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {item.jumlah}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {displayLokasi(item.lokasi)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.kondisi === 'Baik' ? 'bg-green-100 text-green-800' :
                        item.kondisi === 'Rusak Ringan' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.kondisi}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(() => {
                        const src = (item as any).tanggal_input || (item as any).created_at || (item as any).updated_at;
                        if (!src) return '-';
                        const d = new Date(src);
                        return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID');
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Medicine Report */}
      {selectedReport === 'medicine' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Detail Obat-obatan
            </h3>
            {/* Filter Lokasi (Admin) */}
            {user?.role === 'admin' && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <select
                  value={filterLokasiMedicine}
                  onChange={(e) => setFilterLokasiMedicine(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-auto"
                >
                  <option value="">Semua Lokasi</option>
                  <option value="PAUD">PAUD</option>
                  <option value="TK">TBSD</option>
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                </select>
                <div className="text-sm text-gray-600">
                  {filteredMedicine.length} dari {(data?.obat || []).length} item • Total stok {totalStokMedicine.toLocaleString('id-ID')}
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nama Obat
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Stok
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Satuan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Lokasi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Batas Minimal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tanggal Input
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMedicine.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {item.nama_obat}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {item.jumlah}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {(item as any).satuan || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {displayLokasi(item.lokasi)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {item.batas_minimal}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.jumlah <= item.batas_minimal 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {item.jumlah <= item.batas_minimal ? 'Stok Menipis' : 'Stok Aman'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(() => {
                        const src = (item as any).tanggal_input || (item as any).created_at || (item as any).updated_at;
                        if (!src) return '-';
                        const d = new Date(src);
                        return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID');
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Condition Report */}
      {selectedReport === 'condition' && (
        <div className="space-y-6">
          {/* Condition Overview */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Distribusi Kondisi Barang
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={kondisiData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {kondisiData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Damaged Items List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Barang yang Perlu Perhatian
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Nama Barang
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Kondisi
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Jumlah
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Lokasi
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.inventaris
                    .filter(item => item.kondisi !== 'Baik')
                    .map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {item.nama_barang}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.kondisi === 'Rusak Ringan' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {item.kondisi}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.jumlah}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {displayLokasi(item.lokasi)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.keterangan || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
