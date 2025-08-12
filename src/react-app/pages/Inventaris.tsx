import { useState, useEffect } from 'react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { Inventaris, Kategori, Lokasi, Kondisi } from '@/shared/types';
import { supabase } from '@/lib/supabase';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import React from 'react';

export default function InventarisPage() {
  const { user } = useAuth();
  const [inventaris, setInventaris] = useState<Inventaris[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Modal visibility state - used to show/hide the form modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Inventaris | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKategori, setFilterKategori] = useState<string>('');
  const [filterLokasi, setFilterLokasi] = useState<string>('');
  const [filterKondisi, setFilterKondisi] = useState<string>('');

  // Display helper: rename TK -> TBSD for UI only
  const displayLokasi = (l: string) => (l === 'TK' ? 'TBSD' : l);

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
    nama_barang: '',
    kategori: 'Peralatan' as Kategori,
    jumlah: 0,
    lokasi: getUserDefaultLocation(),
    kondisi: 'Baik' as Kondisi,
    keterangan: ''
  });

  useEffect(() => {
    fetchInventaris();
  }, [user]);

  const fetchInventaris = async () => {
    if (!user) return;
    
    try {
      // Try with soft-delete filter first
      let { data, error } = await supabase
        .from('inventaris')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('fetchInventaris: falling back without deleted_at filter:', (error as any)?.message || error);
        const retry = await supabase
          .from('inventaris')
          .select('*')
          .order('created_at', { ascending: false });
        if (retry.error) throw retry.error;
        data = retry.data;
      }
      setInventaris((data || []) as Inventaris[]);
    } catch (error) {
      console.error('Error fetching inventaris:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form submission for both create and update operations
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) {
      toast('Sedang memproses...', { icon: '⏳' });
      return;
    }
    
    setIsSubmitting(true);
    const loadingToast = toast.loading(editingItem ? 'Memperbarui data inventaris...' : 'Menyimpan data inventaris...');
    
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('inventaris')
          .update({
            nama_barang: formData.nama_barang,
            kategori: formData.kategori,
            jumlah: formData.jumlah,
            lokasi: formData.lokasi,
            kondisi: formData.kondisi,
            keterangan: formData.keterangan || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('Data inventaris berhasil diperbarui', { id: loadingToast });
      } else {
        const { error } = await supabase
          .from('inventaris')
          .insert([
            {
              nama_barang: formData.nama_barang,
              kategori: formData.kategori,
              jumlah: formData.jumlah,
              lokasi: formData.lokasi,
              kondisi: formData.kondisi,
              keterangan: formData.keterangan || null,
              created_by_user_id: user?.id || null,
              created_at: new Date().toISOString()
            },
          ]);
        if (error) throw error;
        toast.success('Data inventaris berhasil disimpan', { id: loadingToast });
      }

      await fetchInventaris();
      setShowModal(false);
      resetForm();
    } catch (error: unknown) {
      console.error('Error saving inventaris:', error);
      const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan';
      toast.error(`Gagal menyimpan data: ${errorMessage}`, { 
        id: loadingToast,
        duration: 5000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (item: Inventaris) => {
    setEditingItem(item);
    setFormData({
      nama_barang: item.nama_barang,
      kategori: item.kategori,
      jumlah: item.jumlah,
      lokasi: item.lokasi,
      kondisi: item.kondisi,
      keterangan: item.keterangan || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (item: Inventaris) => {
    const ok = window.confirm(`Hapus item "${item.nama_barang}"? Tindakan ini tidak bisa dibatalkan.`);
    if (!ok) return;
    
    const loadingToast = toast.loading('Menghapus data inventaris...');
    
    try {
      const { error } = await supabase
        .from('inventaris')
        .update({ 
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);
      if (error) throw error;
      
      toast.success('Data inventaris berhasil dihapus', { id: loadingToast });
      await fetchInventaris();
    } catch (err) {
      console.error('Error deleting inventaris:', err);
      const errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error(`Gagal menghapus data inventaris: ${errorMessage}`, { 
        id: loadingToast,
        duration: 5000
      });
    }
  };

  const resetForm = () => {
    setFormData({
      nama_barang: '',
      kategori: 'Peralatan',
      jumlah: 0,
      lokasi: getUserDefaultLocation(),
      kondisi: 'Baik',
      keterangan: ''
    });
    setEditingItem(null);
  };

  const filteredInventaris = inventaris.filter(item => {
    const matchesSearch = item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.keterangan?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesKategori = !filterKategori || item.kategori === filterKategori;
    const matchesLokasi = !filterLokasi || item.lokasi === filterLokasi;
    const matchesKondisi = !filterKondisi || item.kondisi === filterKondisi;
    
    return matchesSearch && matchesKategori && matchesLokasi && matchesKondisi;
  });

  const getKondisiIcon = (kondisi: string) => {
    switch (kondisi) {
      case 'Baik':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'Rusak Ringan':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'Rusak Berat':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Package className="w-4 h-4 text-gray-500" />;
    }
  };

  const getKondisiColor = (kondisi: string) => {
    switch (kondisi) {
      case 'Baik':
        return 'bg-green-100 text-green-800';
      case 'Rusak Ringan':
        return 'bg-yellow-100 text-yellow-800';
      case 'Rusak Berat':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Main component render
  return (
    <div className="p-6">
      {/* Toast Notifications */}
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#fff',
            color: '#1F2937',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Inventaris</h1>
            <p className="text-gray-600 mt-1">Kelola data inventaris sekolah</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            aria-label="Tambah Inventaris"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Inventaris</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className={`grid grid-cols-1 md:grid-cols-2 ${user?.role === 'admin' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cari barang..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            
            <select
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Semua Kategori</option>
              <option value="Peralatan">Peralatan</option>
              <option value="Perabot">Perabot</option>
              <option value="Elektronik">Elektronik</option>
              <option value="Buku">Buku</option>
            </select>

            {/* Only show location filter for admin */}
            {user?.role === 'admin' && (
              <select
                value={filterLokasi}
                onChange={(e) => setFilterLokasi(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Semua Lokasi</option>
                <option value="PAUD">PAUD</option>
                <option value="TK">TBSD</option>
                <option value="SD">SD</option>
                <option value="SMP">SMP</option>
              </select>
            )}

            <select
              value={filterKondisi}
              onChange={(e) => setFilterKondisi(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Semua Kondisi</option>
              <option value="Baik">Baik</option>
              <option value="Rusak Ringan">Rusak Ringan</option>
              <option value="Rusak Berat">Rusak Berat</option>
            </select>

            <div className="flex items-center text-sm text-gray-600">
              <Filter className="w-4 h-4 mr-2" />
              {filteredInventaris.length} dari {inventaris.length} item
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Nama Barang
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Jumlah
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Lokasi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Kondisi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Tanggal Input
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-primary-700 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInventaris.map((item) => (
                  <tr key={item.id} className="hover:bg-accent-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.nama_barang}</p>
                        {item.keterangan && (
                          <p className="text-sm text-gray-500">{item.keterangan}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                        {item.kategori}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {item.jumlah}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {displayLokasi(item.lokasi)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {getKondisiIcon(item.kondisi)}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getKondisiColor(item.kondisi)}`}>
                          {item.kondisi}
                        </span>
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
                          onClick={() => handleEdit(item)}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
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
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {editingItem ? 'Edit Inventaris' : 'Tambah Inventaris'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Form fields here */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Barang
                  </label>
                  <input
                    type="text"
                    value={formData.nama_barang}
                    onChange={(e) => setFormData({...formData, nama_barang: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors ${isSubmitting ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                        {editingItem ? 'Memperbarui...' : 'Menyimpan...'}
                      </div>
                    ) : (
                      <span>{editingItem ? 'Perbarui' : 'Simpan'}</span>
                    )}
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
    </div>
  );
}
