import { useState, useEffect } from 'react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { Obat, RiwayatObat, Lokasi } from '@/shared/types';
import { supabase } from '@/lib/supabase';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  AlertTriangle,
  History,
  ArrowDown
} from 'lucide-react';

export default function ObatPage() {
  const { user } = useAuth();
  const [obat, setObat] = useState<Obat[]>([]);
  const [riwayat, setRiwayat] = useState<RiwayatObat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Obat | null>(null);
  const [selectedObat, setSelectedObat] = useState<Obat | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLokasi, setFilterLokasi] = useState<string>('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [satuanOptions, setSatuanOptions] = useState<string[]>(['pcs','botol','tablet','strip','box','roll']);

  // Form state
  const getUserDefaultLocation = (): Lokasi => {
    if (!user) return 'PAUD';
    switch (user.role) {
      case 'operator_paud': return 'PAUD';
      case 'operator_tk': return 'TK';
      case 'operator_sd': return 'SD';
      case 'operator_smp': return 'SMP';
      default: return 'PAUD';
    }
  };

  const [formData, setFormData] = useState({
    nama_obat: '',
    jumlah: 0,
    lokasi: getUserDefaultLocation(),
    satuan: 'pcs',
    tanggal_kadaluarsa: '',
    batas_minimal: 5,
    keterangan: ''
  });

  // Usage form state
  const [usageData, setUsageData] = useState({
    jumlah_keluar: 0,
    keterangan: ''
  });

  useEffect(() => {
    fetchObat();
    fetchRiwayat();
    fetchSatuan();
  }, [user]);

  const fetchSatuan = async () => {
    try {
      const { data, error } = await supabase
        .from('master_satuan')
        .select('nama, is_active')
        .eq('is_active', true)
        .order('nama', { ascending: true });
      if (error) throw error;
      const list = (data || [])
        .map((r: any) => (r?.nama || '').toString().trim())
        .filter((v: string) => v.length > 0);
      if (list.length > 0) setSatuanOptions(list);
    } catch (err) {
      console.warn('fetchSatuan failed, using defaults:', err);
    }
  };

  const fetchObat = async () => {
    if (!user) return;
    
    try {
      // Try with soft-delete filter first
      let { data, error } = await supabase
        .from('obat')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) {
        // If column deleted_at doesn't exist yet, retry without filter
        console.warn('fetchObat: falling back without deleted_at filter:', error?.message || error);
        const retry = await supabase
          .from('obat')
          .select('*')
          .order('created_at', { ascending: false });
        if (retry.error) throw retry.error;
        data = retry.data;
      }
      setObat((data || []) as Obat[]);
    } catch (error) {
      console.error('Error fetching obat:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRiwayat = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('riwayat_obat')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRiwayat(data as RiwayatObat[]);
    } catch (error) {
      console.error('Error fetching riwayat:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('obat')
          .update({
            nama_obat: formData.nama_obat,
            jumlah: formData.jumlah,
            lokasi: formData.lokasi,
            satuan: formData.satuan || null,
            tanggal_kadaluarsa: formData.tanggal_kadaluarsa || null,
            batas_minimal: formData.batas_minimal,
            keterangan: formData.keterangan || null,
          })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('obat')
          .insert([
            {
              nama_obat: formData.nama_obat,
              jumlah: formData.jumlah,
              lokasi: formData.lokasi,
              satuan: formData.satuan || null,
              tanggal_kadaluarsa: formData.tanggal_kadaluarsa || null,
              batas_minimal: formData.batas_minimal,
              keterangan: formData.keterangan || null,
              created_by_user_id: user?.id || null,
            },
          ]);
        if (error) throw error;
      }

      await fetchObat();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving obat:', error);
    }
  };

  const handleUsageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedObat) return;

    try {
      // validasi stok cukup
      if (usageData.jumlah_keluar <= 0) throw new Error('Jumlah keluar harus > 0');
      if (usageData.jumlah_keluar > selectedObat.jumlah) throw new Error('Stok tidak mencukupi');

      // Kurangi stok obat
      const { error: updErr } = await supabase
        .from('obat')
        .update({ jumlah: selectedObat.jumlah - usageData.jumlah_keluar })
        .eq('id', selectedObat.id);
      if (updErr) throw updErr;

      // Catat riwayat pemakaian
      const { error: insErr } = await supabase
        .from('riwayat_obat')
        .insert([
          {
            obat_id: selectedObat.id,
            jumlah_keluar: usageData.jumlah_keluar,
            tanggal_keluar: new Date().toISOString(),
            keterangan: usageData.keterangan || null,
            created_by_user_id: user?.id || null,
          },
        ]);
      if (insErr) throw insErr;

      await fetchObat();
      await fetchRiwayat();
      setShowUsageModal(false);
      setUsageData({ jumlah_keluar: 0, keterangan: '' });
      setSelectedObat(null);
    } catch (error) {
      console.error('Error recording usage:', error);
    }
  };

  const handleEdit = (item: Obat) => {
    setEditingItem(item);
    setFormData({
      nama_obat: item.nama_obat,
      jumlah: item.jumlah,
      lokasi: item.lokasi,
      satuan: (item as any).satuan || 'pcs',
      tanggal_kadaluarsa: item.tanggal_kadaluarsa ? item.tanggal_kadaluarsa.split('T')[0] : '',
      batas_minimal: item.batas_minimal,
      keterangan: item.keterangan || ''
    });
    // ensure current satuan exists in options for edit view
    const current = (item as any).satuan;
    if (current && !satuanOptions.includes(current)) {
      setSatuanOptions(prev => [...prev, current]);
    }
    setShowModal(true);
  };

  const handleUsage = (item: Obat) => {
    setSelectedObat(item);
    setUsageData({ jumlah_keluar: 0, keterangan: '' });
    setShowUsageModal(true);
  };

  const handleDelete = async (item: Obat) => {
    const ok = window.confirm(`Hapus obat "${item.nama_obat}"? Tindakan ini tidak bisa dibatalkan.`);
    if (!ok) return;
    try {
      const { error } = await supabase
        .from('obat')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      await fetchObat();
    } catch (err) {
      console.error('Error deleting obat:', err);
      alert('Gagal menghapus data obat. Coba lagi atau hubungi admin.');
    }
  };

  const resetForm = () => {
    setFormData({
      nama_obat: '',
      jumlah: 0,
      lokasi: getUserDefaultLocation(),
      satuan: 'pcs',
      tanggal_kadaluarsa: '',
      batas_minimal: 5,
      keterangan: ''
    });
    setEditingItem(null);
  };

  const filteredObat = obat.filter(item => {
    const matchesSearch = item.nama_obat.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.keterangan?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLokasi = !filterLokasi || item.lokasi === filterLokasi;
    const matchesLowStock = !showLowStock || item.jumlah <= item.batas_minimal;
    
    return matchesSearch && matchesLokasi && matchesLowStock;
  });

  const isLowStock = (item: Obat) => item.jumlah <= item.batas_minimal;
  
  const isExpiringSoon = (item: Obat) => {
    if (!item.tanggal_kadaluarsa) return false;
    const expiryDate = new Date(item.tanggal_kadaluarsa);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  };

  const isExpired = (item: Obat) => {
    if (!item.tanggal_kadaluarsa) return false;
    const expiryDate = new Date(item.tanggal_kadaluarsa);
    const today = new Date();
    return expiryDate < today;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Obat-obatan</h1>
          <p className="text-gray-600 mt-1">Kelola stok obat-obatan sekolah</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <History className="w-4 h-4" />
            <span>Riwayat Penggunaan</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Obat</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className={`grid grid-cols-1 md:grid-cols-2 ${user?.role === 'admin' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Cari obat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* Only show location filter for admin */}
          {user?.role === 'admin' && (
            <select
              value={filterLokasi}
              onChange={(e) => setFilterLokasi(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Semua Lokasi</option>
              <option value="PAUD">PAUD</option>
              <option value="TK">TK</option>
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
            </select>
          )}

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showLowStock}
              onChange={(e) => setShowLowStock(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Stok Menipis</span>
          </label>

          <div className="flex items-center text-sm text-gray-600">
            <Filter className="w-4 h-4 mr-2" />
            {filteredObat.length} dari {obat.length} obat
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nama Obat
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stok
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Satuan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lokasi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Batas Min
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kadaluarsa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tanggal Input
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredObat.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nama_obat}</p>
                      {item.keterangan && (
                        <p className="text-sm text-gray-500">{item.keterangan}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-medium ${isLowStock(item) ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.jumlah}
                      </span>
                      {isLowStock(item) && (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {(item as any).satuan || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {item.lokasi}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {item.batas_minimal}
                  </td>
                  <td className="px-6 py-4">
                    {item.tanggal_kadaluarsa ? (
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm ${
                          isExpired(item) ? 'text-red-600 font-medium' :
                          isExpiringSoon(item) ? 'text-orange-600 font-medium' :
                          'text-gray-900'
                        }`}>
                          {new Date(item.tanggal_kadaluarsa).toLocaleDateString('id-ID')}
                        </span>
                        {(isExpired(item) || isExpiringSoon(item)) && (
                          <AlertTriangle className="w-4 h-4 text-orange-500" />
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isLowStock(item) 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isLowStock(item) ? 'Stok Menipis' : 'Stok Aman'}
                      </span>
                      {isExpired(item) && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Kadaluarsa
                        </span>
                      )}
                      {!isExpired(item) && isExpiringSoon(item) && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          Akan Kadaluarsa
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {(() => {
                      const src = (item as any).tanggal_input || (item as any).created_at || (item as any).updated_at;
                      if (!src) return '-';
                      const d = new Date(src);
                      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID');
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleUsage(item)}
                        className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                        title="Catat Penggunaan"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        onClick={() => handleDelete(item)}
                        aria-label="Hapus"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {editingItem ? 'Edit Obat' : 'Tambah Obat'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Obat
                  </label>
                  <input
                    type="text"
                    value={formData.nama_obat}
                    onChange={(e) => setFormData({...formData, nama_obat: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jumlah
                  </label>
                  <input
                    type="number"
                    value={formData.jumlah}
                    onChange={(e) => setFormData({...formData, jumlah: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                    required
                  />
                </div>

                {/* Only show location field for admin */}
                {user?.role === 'admin' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lokasi
                    </label>
                    <select
                      value={formData.lokasi}
                      onChange={(e) => setFormData({...formData, lokasi: e.target.value as Lokasi})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="PAUD">PAUD</option>
                      <option value="TK">TK</option>
                      <option value="SD">SD</option>
                      <option value="SMP">SMP</option>
                    </select>
                  </div>
                )}
                
                {/* Show location info for operators */}
                {user?.role !== 'admin' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lokasi
                    </label>
                    <div className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                      {formData.lokasi}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Lokasi otomatis berdasarkan role Anda</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Satuan
                  </label>
                  <select
                    value={formData.satuan}
                    onChange={(e) => setFormData({...formData, satuan: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="pcs">pcs</option>
                    <option value="botol">botol</option>
                    <option value="tablet">tablet</option>
                    <option value="strip">strip</option>
                    <option value="box">box</option>
                    <option value="roll">roll</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Kadaluarsa
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal_kadaluarsa}
                    onChange={(e) => setFormData({...formData, tanggal_kadaluarsa: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Kosongkan jika tidak ada tanggal kadaluarsa</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batas Minimal
                  </label>
                  <input
                    type="number"
                    value={formData.batas_minimal}
                    onChange={(e) => setFormData({...formData, batas_minimal: parseInt(e.target.value) || 5})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keterangan
                  </label>
                  <textarea
                    value={formData.keterangan}
                    onChange={(e) => setFormData({...formData, keterangan: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingItem ? 'Update' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Usage Modal */}
      {showUsageModal && selectedObat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Catat Penggunaan Obat
              </h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-blue-900">{selectedObat.nama_obat}</h3>
                <p className="text-sm text-blue-700">Stok tersedia: {selectedObat.jumlah}</p>
                {selectedObat.tanggal_kadaluarsa && (
                  <p className={`text-sm ${
                    isExpired(selectedObat) ? 'text-red-700' :
                    isExpiringSoon(selectedObat) ? 'text-orange-700' :
                    'text-blue-700'
                  }`}>
                    Kadaluarsa: {new Date(selectedObat.tanggal_kadaluarsa).toLocaleDateString('id-ID')}
                    {isExpired(selectedObat) && ' (SUDAH KADALUARSA)'}
                    {!isExpired(selectedObat) && isExpiringSoon(selectedObat) && ' (AKAN KADALUARSA)'}
                  </p>
                )}
              </div>
              
              <form onSubmit={handleUsageSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jumlah Keluar
                  </label>
                  <input
                    type="number"
                    value={usageData.jumlah_keluar}
                    onChange={(e) => setUsageData({...usageData, jumlah_keluar: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    max={selectedObat.jumlah}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keterangan
                  </label>
                  <textarea
                    value={usageData.keterangan}
                    onChange={(e) => setUsageData({...usageData, keterangan: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Untuk apa obat digunakan..."
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Catat Penggunaan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUsageModal(false);
                      setSelectedObat(null);
                      setUsageData({ jumlah_keluar: 0, keterangan: '' });
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Riwayat Penggunaan Obat
                </h2>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Nama Obat
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Lokasi
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Jumlah Keluar
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Tanggal
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Keterangan
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {riwayat.map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {item.nama_obat}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {item.lokasi}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.jumlah_keluar}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(item.tanggal_keluar).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {item.keterangan || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
