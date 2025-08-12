import { useState } from 'react';
// Import jsPDF dan autoTable
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Inventaris, Obat } from '@/shared/types';

// Extend the Obat type to include satuan
interface ExtendedObat extends Obat {
  satuan?: string;
}

// Extend jsPDF type to include lastAutoTable info from jspdf-autotable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}

interface ExportData {
  inventaris: Inventaris[];
  obat: Obat[];
}

interface ReportStats {
  total_inventaris: number;
  total_obat: number;
  kondisi_barang: { [key: string]: number };
  kategori_inventaris: { [key: string]: number };
  lokasi_distribution: { [key: string]: number };
  low_stock_count: number;
  damaged_items_count: number;
}

type ReportType = 'overview' | 'inventory' | 'medicine' | 'condition' | 'all';

interface UseReportExport {
  exportToPDF: (data: ExportData, stats: ReportStats, reportType?: ReportType, period?: string) => Promise<boolean>;
  exportToExcel: (data: ExportData, stats: ReportStats, reportType?: ReportType, period?: string) => Promise<void>;
  isExporting: boolean;
}

const useReportExport = (): UseReportExport => {
  const [isExporting, setIsExporting] = useState(false);

  // Display helper: rename TK -> TBSD for outputs only
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
      // Urutkan berdasarkan lokasi terlebih dahulu (PAUD -> TKB -> SD -> SMP)
      const orderA = getLokasiOrder(a.lokasi);
      const orderB = getLokasiOrder(b.lokasi);
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Jika lokasi sama, urutkan berdasarkan nama obat (A-Z)
      return a.nama_obat.localeCompare(b.nama_obat);
    });
  };

  const formatTanggalInput = (item: any): string => {
    const src = item?.tanggal_input || item?.created_at || item?.updated_at;
    if (!src) return '-';
    const d = new Date(src);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID');
  };

  // Fungsi untuk menambahkan header halaman
  const addHeader = (doc: jsPDF, title: string, period: string) => {
    doc.setFontSize(20);
    doc.text(title, 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Periode: ${period}`, 20, 30);
    doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 20, 38);
    
    // Tambahkan garis pemisah
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(20, 45, 190, 45);
    
    return 50; // Return Y position after header
  };

  // Fungsi untuk menambahkan section dengan judul
  const addSection = (doc: jsPDF, title: string, y: number) => {
    doc.setFontSize(16);
    doc.text(title, 20, y);
    return y + 10;
  };

  const exportToPDF = async (
    data: ExportData, 
    _stats: ReportStats, // Prefixed with _ to indicate it's intentionally unused
    reportType: ReportType = 'overview',
    period: string = 'Bulan Ini'
  ): Promise<boolean> => {
    setIsExporting(true);
    try {
      // Inisialisasi jsPDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // Pastikan autoTable tersedia
      if (typeof autoTable !== 'function') {
        console.error('AutoTable plugin is not available');
        throw new Error('Plugin AutoTable tidak tersedia. Pastikan jspdf-autotable terinstal dengan benar.');
      }
      let currentY = addHeader(doc, 'Laporan Inventaris Sekolah', period);

      // Export data obat jika diperlukan
      if (reportType === 'medicine' || reportType === 'overview' || reportType === 'all') {
        currentY = await exportObatToPDF(doc, data, currentY);
      }

      // Export data inventaris jika diperlukan
      if (reportType === 'inventory' || reportType === 'all') {
        // Jika bukan halaman pertama, tambahkan halaman baru
        if (currentY > 40) {
          doc.addPage();
          currentY = addHeader(doc, 'Laporan Inventaris Sekolah', period);
        }
        currentY = await exportInventoryToPDF(doc, data, currentY);
      }

      // Export data kondisi barang jika diperlukan
      if (reportType === 'condition' || reportType === 'all') {
        // Jika bukan halaman pertama, tambahkan halaman baru
        if (currentY > 40) {
          doc.addPage();
          currentY = addHeader(doc, 'Laporan Inventaris Sekolah', period);
        }
        currentY = await exportConditionToPDF(doc, data, currentY);
      }

      // Tambahkan nomor halaman di setiap halaman
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(
          `Halaman ${i} dari ${pageCount}`, 
          doc.internal.pageSize.getWidth() - 50, 
          doc.internal.pageSize.getHeight() - 10
        );
      }

      // Simpan PDF
      doc.save(`laporan-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`);
      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Terjadi kesalahan saat membuat PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  // Fungsi untuk mengekspor data obat ke PDF
  const exportObatToPDF = async (doc: jsPDF, data: ExportData, startY: number): Promise<number> => {
    let currentY = startY;
    
    // Tambahkan judul section
    currentY = addSection(doc, 'Laporan Obat-obatan', currentY);
    
    // Urutkan data obat
    const sortedObat = getSortedObat(data.obat);
    
    // Siapkan data untuk tabel
    const obatData = sortedObat.map(obat => [
      obat.nama_obat,
      obat.jumlah.toString(),
      (obat as ExtendedObat).satuan || '-',
      displayLokasi(obat.lokasi),
      obat.batas_minimal.toString(),
      obat.jumlah <= obat.batas_minimal ? 'Stok Menipis' : 'Stok Aman',
      formatTanggalInput(obat)
    ]);
    
    // Buat tabel
    autoTable(doc as any, {
      startY: currentY,
      head: [['Nama Obat', 'Stok', 'Satuan', 'Lokasi', 'Batas Min', 'Status', 'Terakhir Diperbarui']],
      body: obatData,
      margin: { left: 15, right: 15 },
      styles: { 
        fontSize: 8,
        cellPadding: 3,
        lineWidth: 0.1,
        lineColor: [220, 220, 220],
        textColor: [40, 40, 40]
      },
      headStyles: { 
        fillColor: [59, 130, 246],
        textColor: 255,
        fontSize: 9,
        cellPadding: 4,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { cellWidth: 'auto', halign: 'right' },
        2: { cellWidth: 'auto', halign: 'center' },
        3: { cellWidth: 'auto', halign: 'center' },
        4: { cellWidth: 'auto', halign: 'right' },
        5: { cellWidth: 'auto', halign: 'center' },
        6: { cellWidth: 'auto', halign: 'center' }
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      didDrawPage: function(data: any) {
        // Update currentY setelah menggambar tabel
        currentY = data.cursor?.y || currentY + 20;
      }
    });
    
    return (doc as any).lastAutoTable?.finalY + 10 || currentY + 10;
  };

  // Fungsi untuk mengekspor data inventaris ke PDF
  const exportInventoryToPDF = async (doc: any, data: ExportData, startY: number): Promise<number> => {
    let currentY = startY;
    
    // Tambahkan judul section
    currentY = addSection(doc, 'Data Inventaris', currentY);
    
    // Siapkan data untuk tabel
    const inventoryData = data.inventaris.map(item => [
      item.nama_barang,
      item.kategori,
      item.jumlah.toString(),
      displayLokasi(item.lokasi as any),
      item.kondisi,
      formatTanggalInput(item)
    ]);
    
    // Buat tabel
    autoTable(doc as any, {
      startY: currentY,
      head: [['Nama Barang', 'Kategori', 'Jumlah', 'Lokasi', 'Kondisi', 'Terakhir Diperbarui']],
      body: inventoryData,
      margin: { left: 15, right: 15 },
      styles: { 
        fontSize: 8,
        cellPadding: 3,
        lineWidth: 0.1,
        lineColor: [220, 220, 220],
        textColor: [40, 40, 40]
      },
      headStyles: { 
        fillColor: [59, 130, 246],
        textColor: 255,
        fontSize: 9,
        cellPadding: 4,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 'auto', halign: 'right' },
        3: { cellWidth: 'auto', halign: 'center' },
        4: { cellWidth: 'auto', halign: 'center' },
        5: { cellWidth: 'auto', halign: 'center' }
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      didDrawPage: function(data: any) {
        // Update currentY setelah menggambar tabel
        currentY = data.cursor?.y || currentY + 20;
      }
    });
    
    return (doc as any).lastAutoTable?.finalY + 10 || currentY + 10;
  };

  // Fungsi untuk mengekspor data kondisi barang ke PDF
  const exportConditionToPDF = async (doc: any, data: ExportData, startY: number): Promise<number> => {
    let currentY = startY;
    
    // Tambahkan judul section
    currentY = addSection(doc, 'Barang yang Perlu Perhatian', currentY);
    
    // Siapkan data untuk tabel
    const conditionData = data.inventaris
      .filter(item => item.kondisi !== 'Baik')
      .map(item => [
        item.nama_barang,
        item.kategori,
        item.kondisi,
        item.jumlah.toString(),
        displayLokasi(item.lokasi as any),
        item.keterangan || '-',
        formatTanggalInput(item)
      ]);
    
    // Jika tidak ada data, tampilkan pesan
    if (conditionData.length === 0) {
      doc.setFontSize(12);
      doc.text('Tidak ada barang yang perlu perhatian.', 20, currentY);
      return currentY + 10;
    }
    
    // Buat tabel
    autoTable(doc as any, {
      startY: currentY,
      head: [['Nama Barang', 'Kategori', 'Kondisi', 'Jumlah', 'Lokasi', 'Keterangan', 'Terakhir Diperbarui']],
      body: conditionData,
      margin: { left: 15, right: 15 },
      styles: { 
        fontSize: 8,
        cellPadding: 3,
        lineWidth: 0.1,
        lineColor: [220, 220, 220],
        textColor: [40, 40, 40]
      },
      headStyles: { 
        fillColor: [239, 68, 68],
        textColor: 255,
        fontSize: 9,
        cellPadding: 4,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 'auto', halign: 'center' },
        3: { cellWidth: 'auto', halign: 'right' },
        4: { cellWidth: 'auto', halign: 'center' },
        5: { cellWidth: 'auto', halign: 'left' },
        6: { cellWidth: 'auto', halign: 'center' }
      },
      alternateRowStyles: {
        fillColor: [255, 245, 245]
      },
      didDrawPage: function(data: any) {
        // Update currentY setelah menggambar tabel
        currentY = data.cursor?.y || currentY + 20;
      }
    });
    
    return (doc as any).lastAutoTable?.finalY + 10 || currentY + 10;
  };

  const exportToExcel = async (
    data: ExportData, 
    _stats: ReportStats, // Prefixed with _ to indicate it's intentionally unused
    reportType: ReportType = 'overview',
    period: string = 'Bulan Ini'
  ): Promise<void> => {
    setIsExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      
      // Tambahkan worksheet ringkasan
      if (reportType === 'overview' || reportType === 'all') {
        // Define summary data with proper type
        const summaryData: (string | number | (string | number)[])[] = [
          ['Laporan Inventaris Sekolah'],
          [`Periode: ${period}`],
          [`Tanggal: ${new Date().toLocaleDateString('id-ID')}`],
          [],
          ['RINGKASAN STATISTIK'],
          ['Kategori', 'Jumlah'],
          ['Total Inventaris', _stats.total_inventaris],
          ['Total Obat-obatan', _stats.total_obat],
          ['Barang Rusak', _stats.damaged_items_count],
          ['Stok Obat Menipis', _stats.low_stock_count],
          [],
          ['DISTRIBUSI KATEGORI'],
          ['Kategori', 'Jumlah'],
          ...Object.entries(_stats.kategori_inventaris || {}).map(([kategori, jumlah]) => [kategori, jumlah] as [string, number]),
          [],
          ['DISTRIBUSI LOKASI'],
          ['Lokasi', 'Jumlah'],
          ...Object.entries(_stats.lokasi_distribution || {}).map(([lokasi, jumlah]) => [displayLokasi(lokasi), jumlah] as [string, number])
        ];
        
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData as any[][]);
        XLSX.utils.book_append_sheet(workbook, wsSummary, 'Ringkasan');
      }
      

      // Tambahkan worksheet obat jika diperlukan
      if (reportType === 'medicine' || reportType === 'all') {
        const sortedObat = getSortedObat(data.obat);
        const obatData: (string | number | boolean | (string | number | boolean)[])[] = [
          ['Nama Obat', 'Stok', 'Satuan', 'Lokasi', 'Batas Minimal', 'Status', 'Terakhir Diperbarui'] as string[],
          ...sortedObat.map(obat => [
            obat.nama_obat,
            obat.jumlah,
            (obat as ExtendedObat).satuan || '-',
            displayLokasi(obat.lokasi),
            obat.batas_minimal,
            obat.jumlah <= (obat.batas_minimal || 0) ? 'Stok Menipis' : 'Stok Aman',
            formatTanggalInput(obat)
          ] as (string | number | boolean)[])
        ];
        
        const wsObat = XLSX.utils.aoa_to_sheet(obatData as any[][]);
        XLSX.utils.book_append_sheet(workbook, wsObat, 'Data Obat');
      }

      // Tambahkan worksheet inventaris jika diperlukan
      if (reportType === 'inventory' || reportType === 'all') {
        const inventarisData: (string | number | (string | number)[])[] = [
          ['Nama Barang', 'Kategori', 'Jumlah', 'Lokasi', 'Kondisi', 'Keterangan', 'Tanggal Input'] as string[],
          ...data.inventaris.map(item => [
            item.nama_barang,
            item.kategori,
            item.jumlah,
            displayLokasi(item.lokasi as string),
            item.kondisi,
            item.keterangan || '-',
            formatTanggalInput(item)
          ] as (string | number)[])
        ];
        
        const wsInventaris = XLSX.utils.aoa_to_sheet(inventarisData as any[][]);
        XLSX.utils.book_append_sheet(workbook, wsInventaris, 'Data Inventaris');
      }
      

      // Export data obat jika diperlukan
      if (reportType === 'medicine' || reportType === 'overview' || reportType === 'all') {
        // Urutkan data obat sebelum di-export
        const sortedObat = getSortedObat(data.obat);
        // Medicine sheet
        const medicineData = sortedObat.map(item => {
          const isExpired = item.tanggal_kadaluarsa && new Date(item.tanggal_kadaluarsa) < new Date();
          const isExpiringSoon = item.tanggal_kadaluarsa && new Date(item.tanggal_kadaluarsa) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          
          let status = item.jumlah <= item.batas_minimal ? 'Stok Menipis' : 'Stok Aman';
          if (isExpired) status += ', Kadaluarsa';
          else if (isExpiringSoon) status += ', Akan Kadaluarsa';
          
          return {
            'Nama Obat': item.nama_obat,
            'Stok': item.jumlah,
            'Satuan': (item as any).satuan || '',
            'Lokasi': displayLokasi(item.lokasi as any),
            'Batas Minimal': item.batas_minimal,
            'Tanggal Kadaluarsa': item.tanggal_kadaluarsa ? new Date(item.tanggal_kadaluarsa).toLocaleDateString('id-ID') : '',
            'Status': status,
            'Tanggal Input': formatTanggalInput(item),
            'Keterangan': item.keterangan || ''
          };
        });
        
        const medicineSheet = XLSX.utils.json_to_sheet(medicineData);
        XLSX.utils.book_append_sheet(workbook, medicineSheet, 'Obat-obatan');
      }
      
      // Tambahkan worksheet kondisi barang jika diperlukan
      if (reportType === 'condition' || reportType === 'all') {
        const conditionData: (string | number | (string | number)[])[] = [
          ['Nama Barang', 'Kategori', 'Kondisi', 'Jumlah', 'Lokasi', 'Keterangan', 'Terakhir Diperbarui'] as string[],
          ...data.inventaris
            .filter(item => item.kondisi !== 'Baik')
            .map(item => [
              item.nama_barang,
              item.kategori,
              item.kondisi,
              item.jumlah,
              displayLokasi(item.lokasi as string),
              item.keterangan || '-',
              formatTanggalInput(item)
            ] as (string | number)[])
        ];
        
        const wsCondition = XLSX.utils.aoa_to_sheet(conditionData as any[][]);
        XLSX.utils.book_append_sheet(workbook, wsCondition, 'Kondisi Barang');
      }
      
      // Generate nama file dengan format yang benar
      const fileName = `laporan-${reportType}-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      console.error('Error generating Excel:', error);
      alert('Terjadi kesalahan saat membuat Excel: ' + (error instanceof Error ? error.message : 'Unknown error'));
      throw error; // Re-throw error untuk penanganan lebih lanjut jika diperlukan
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportToPDF,
    exportToExcel,
    isExporting
  };
};

export default useReportExport;
