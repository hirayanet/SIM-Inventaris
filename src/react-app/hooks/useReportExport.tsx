import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Inventaris, Obat } from '@/shared/types';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: typeof autoTable;
    lastAutoTable: {
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

export const useReportExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  const formatTanggalInput = (item: any): string => {
    const src = item?.tanggal_input || item?.created_at || item?.updated_at;
    if (!src) return '-';
    const d = new Date(src);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID');
  };

  const exportToPDF = async (
    data: ExportData, 
    stats: ReportStats, 
    reportType: string = 'overview',
    period: string = 'Bulan Ini'
  ) => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      
      // Add autoTable plugin
      doc.autoTable = autoTable;
      
      // Header
      doc.setFontSize(20);
      doc.text('Laporan Inventaris Sekolah', 20, 20);
      
      doc.setFontSize(12);
      doc.text(`Periode: ${period}`, 20, 30);
      doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 20, 35);
      
      let yPosition = 50;
      
      if (reportType === 'overview') {
        // Summary Statistics
        doc.setFontSize(16);
        doc.text('Ringkasan Statistik', 20, yPosition);
        yPosition += 10;
        
        const summaryData = [
          ['Total Inventaris', stats.total_inventaris.toLocaleString()],
          ['Total Obat-obatan', stats.total_obat.toLocaleString()],
          ['Barang Rusak', stats.damaged_items_count.toLocaleString()],
          ['Stok Obat Menipis', stats.low_stock_count.toLocaleString()]
        ];
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Kategori', 'Jumlah']],
          body: summaryData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        yPosition = doc.lastAutoTable.finalY + 20;
        
        // Category Distribution
        doc.setFontSize(16);
        doc.text('Distribusi Kategori', 20, yPosition);
        yPosition += 10;
        
        const categoryData = Object.entries(stats.kategori_inventaris).map(([kategori, jumlah]) => [
          kategori, jumlah.toLocaleString()
        ]);
        
        if (categoryData.length > 0) {
          autoTable(doc, {
            startY: yPosition,
            head: [['Kategori', 'Jumlah']],
            body: categoryData,
            theme: 'striped',
            headStyles: { fillColor: [16, 185, 129] }
          });
        }
      }
      
      if (reportType === 'inventory') {
        doc.setFontSize(16);
        doc.text('Detail Inventaris', 20, yPosition);
        yPosition += 10;
        
        const inventoryData = data.inventaris.slice(0, 50).map(item => [
          item.nama_barang,
          item.kategori,
          item.jumlah.toString(),
          item.lokasi,
          item.kondisi,
          formatTanggalInput(item)
        ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Nama Barang', 'Kategori', 'Jumlah', 'Lokasi', 'Kondisi', 'Tanggal']],
          body: inventoryData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 8 }
        });
      }
      
      if (reportType === 'medicine') {
        doc.setFontSize(16);
        doc.text('Detail Obat-obatan', 20, yPosition);
        yPosition += 10;
        
        const medicineData = data.obat.slice(0, 50).map(item => [
          item.nama_obat,
          item.jumlah.toString(),
          item.lokasi,
          item.batas_minimal.toString(),
          item.tanggal_kadaluarsa ? new Date(item.tanggal_kadaluarsa).toLocaleDateString('id-ID') : '-',
          item.jumlah <= item.batas_minimal ? 'Stok Menipis' : 'Stok Aman',
          formatTanggalInput(item)
        ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Nama Obat', 'Stok', 'Lokasi', 'Batas Min', 'Kadaluarsa', 'Status', 'Tanggal']],
          body: medicineData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 8 }
        });
      }

      if (reportType === 'condition') {
        doc.setFontSize(16);
        doc.text('Barang yang Perlu Perhatian', 20, yPosition);
        yPosition += 10;
        
        const conditionData = data.inventaris
          .filter(item => item.kondisi !== 'Baik')
          .slice(0, 50)
          .map(item => [
            item.nama_barang,
            item.kategori,
            item.kondisi,
            item.jumlah.toString(),
            item.lokasi,
            item.keterangan || '-'
          ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Nama Barang', 'Kategori', 'Kondisi', 'Jumlah', 'Lokasi', 'Keterangan']],
          body: conditionData,
          theme: 'striped',
          headStyles: { fillColor: [245, 158, 11] },
          styles: { fontSize: 8 }
        });
      }
      
      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Halaman ${i} dari ${pageCount}`, doc.internal.pageSize.getWidth() - 50, doc.internal.pageSize.getHeight() - 10);
      }
      
      doc.save(`laporan-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Terjadi kesalahan saat membuat PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async (
    data: ExportData, 
    stats: ReportStats, 
    reportType: string = 'overview',
    period: string = 'Bulan Ini'
  ) => {
    setIsExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      
      if (reportType === 'overview' || reportType === 'all') {
        // Summary sheet
        const summaryData = [
          ['Laporan Inventaris Sekolah'],
          [`Periode: ${period}`],
          [`Tanggal: ${new Date().toLocaleDateString('id-ID')}`],
          [],
          ['RINGKASAN STATISTIK'],
          ['Kategori', 'Jumlah'],
          ['Total Inventaris', stats.total_inventaris],
          ['Total Obat-obatan', stats.total_obat],
          ['Barang Rusak', stats.damaged_items_count],
          ['Stok Obat Menipis', stats.low_stock_count],
          [],
          ['DISTRIBUSI KATEGORI'],
          ['Kategori', 'Jumlah'],
          ...Object.entries(stats.kategori_inventaris).map(([kategori, jumlah]) => [kategori, jumlah]),
          [],
          ['DISTRIBUSI LOKASI'],
          ['Lokasi', 'Jumlah'],
          ...Object.entries(stats.lokasi_distribution).map(([lokasi, jumlah]) => [lokasi, jumlah])
        ];
        
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan');
      }
      
      if (reportType === 'inventory' || reportType === 'all') {
        // Inventory sheet
        const inventoryData = data.inventaris.map(item => ({
          'Nama Barang': item.nama_barang,
          'Kategori': item.kategori,
          'Jumlah': item.jumlah,
          'Lokasi': item.lokasi,
          'Kondisi': item.kondisi,
          'Tanggal Input': formatTanggalInput(item),
          'Keterangan': item.keterangan || ''
        }));
        
        const inventorySheet = XLSX.utils.json_to_sheet(inventoryData);
        XLSX.utils.book_append_sheet(workbook, inventorySheet, 'Inventaris');
      }
      
      if (reportType === 'medicine' || reportType === 'all') {
        // Medicine sheet
        const medicineData = data.obat.map(item => {
          const isExpired = item.tanggal_kadaluarsa && new Date(item.tanggal_kadaluarsa) < new Date();
          const isExpiringSoon = item.tanggal_kadaluarsa && new Date(item.tanggal_kadaluarsa) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          
          let status = item.jumlah <= item.batas_minimal ? 'Stok Menipis' : 'Stok Aman';
          if (isExpired) status += ', Kadaluarsa';
          else if (isExpiringSoon) status += ', Akan Kadaluarsa';
          
          return {
            'Nama Obat': item.nama_obat,
            'Stok': item.jumlah,
            'Lokasi': item.lokasi,
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
      
      if (reportType === 'condition') {
        // Condition sheet - damaged items
        const damagedInventory = data.inventaris
          .filter(item => item.kondisi !== 'Baik')
          .map(item => ({
            'Nama Barang': item.nama_barang,
            'Kategori': item.kategori,
            'Kondisi': item.kondisi,
            'Jumlah': item.jumlah,
            'Lokasi': item.lokasi,
            'Tanggal Input': formatTanggalInput(item),
            'Keterangan': item.keterangan || ''
          }));
        
        const conditionSheet = XLSX.utils.json_to_sheet(damagedInventory);
        XLSX.utils.book_append_sheet(workbook, conditionSheet, 'Kondisi Barang');
      }
      
      XLSX.writeFile(workbook, `laporan-${reportType}-${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Terjadi kesalahan saat membuat Excel: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
