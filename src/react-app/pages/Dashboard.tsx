import { useState, useEffect } from 'react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { DashboardStats } from '@/shared/types';
import { supabase } from '@/lib/supabase';
import { 
  Package, 
  Sofa, 
  Monitor, 
  BookOpen, 
  Pill, 
  AlertTriangle,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Display helper: rename TK -> TBSD for UI only
  const displayLokasi = (l: string) => (l === 'TK' ? 'TBSD' : l);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        // Ambil data inventaris dan obat langsung dari Supabase
        const [{ data: inventaris, error: invErr }, { data: obat, error: obatErr }] = await Promise.all([
          supabase.from('inventaris').select('*'),
          supabase.from('obat').select('*'),
        ]);
        if (invErr) throw invErr;
        if (obatErr) throw obatErr;

        const inv = (inventaris || []);
        const ob = (obat || []);

        const total_peralatan = inv.filter((i: any) => i.kategori === 'Peralatan').reduce((a: number, b: any) => a + Number(b.jumlah || 0), 0);
        const total_perabot = inv.filter((i: any) => i.kategori === 'Perabot').reduce((a: number, b: any) => a + Number(b.jumlah || 0), 0);
        const total_elektronik = inv.filter((i: any) => i.kategori === 'Elektronik').reduce((a: number, b: any) => a + Number(b.jumlah || 0), 0);
        const total_buku = inv.filter((i: any) => i.kategori === 'Buku').reduce((a: number, b: any) => a + Number(b.jumlah || 0), 0);
        const total_obat = ob.reduce((a: number, b: any) => a + Number(b.jumlah || 0), 0);

        const low_stock_medicines = ob.filter((o: any) => Number(o.jumlah || 0) <= Number(o.batas_minimal || 0));
        const damaged_items = inv.filter((i: any) => i.kondisi === 'Rusak Berat');

        const computed: DashboardStats = {
          total_peralatan,
          total_perabot,
          total_elektronik,
          total_buku,
          total_obat,
          low_stock_medicines,
          damaged_items,
        } as DashboardStats;

        setStats(computed);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Gagal memuat data dashboard</p>
      </div>
    );
  }

  const categoryStats = [
    { name: 'Peralatan', value: stats.total_peralatan, icon: Package, color: 'bg-blue-500' },
    { name: 'Perabot', value: stats.total_perabot, icon: Sofa, color: 'bg-green-500' },
    { name: 'Elektronik', value: stats.total_elektronik, icon: Monitor, color: 'bg-purple-500' },
    { name: 'Buku', value: stats.total_buku, icon: BookOpen, color: 'bg-orange-500' },
    { name: 'Obat-obatan', value: stats.total_obat, icon: Pill, color: 'bg-red-500' },
  ];

  const chartData = categoryStats.map(stat => ({
    name: stat.name,
    value: stat.value
  }));

  const pieColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">
          Selamat Datang, {user?.full_name || user?.username}!
        </h1>
        <p className="text-blue-100">
          Kelola inventaris sekolah dengan mudah dan efisien
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {categoryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value.toLocaleString()}</p>
                </div>
                <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
            Statistik Inventaris
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Distribusi Kategori
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {(stats.low_stock_medicines.length > 0 || stats.damaged_items.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Stock Medicines */}
          {stats.low_stock_medicines.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
                Stok Obat Menipis
              </h3>
              <div className="space-y-3">
                {stats.low_stock_medicines.slice(0, 5).map((obat) => (
                  <div key={obat.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{obat.nama_obat}</p>
                      <p className="text-sm text-gray-600">{obat.lokasi}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-orange-600">
                        {obat.jumlah} tersisa
                      </p>
                      <p className="text-xs text-gray-500">
                        Min: {obat.batas_minimal}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Damaged Items */}
          {stats.damaged_items.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
                Barang Rusak Berat
              </h3>
              <div className="space-y-3">
                {stats.damaged_items.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{item.nama_barang}</p>
                      <p className="text-sm text-gray-600">{item.kategori} - {displayLokasi(item.lokasi as any)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">
                        {item.jumlah} unit
                      </p>
                      <p className="text-xs text-gray-500">
                        Rusak Berat
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
