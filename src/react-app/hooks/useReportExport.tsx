import { useState } from 'react';
// Import jsPDF dan autoTable
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
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

  // Helper: create styled worksheet with merged title and colored header row (ExcelJS)
  const createStyledSheet = (
    workbook: ExcelJS.Workbook,
    sheetName: string,
    title: string,
    period: string,
    headers: string[],
    rows: (string | number | boolean | null)[][],
    headerColor: string = 'FF10B981' // ARGB (FF + primary emerald 500)
  ) => {
    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      properties: { defaultRowHeight: 18 },
    });

    // Title row
    const titleRow = sheet.addRow([title]);
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center' };
    sheet.mergeCells(1, 1, 1, Math.max(1, headers.length));

    // Period and date rows
    const periodRow = sheet.addRow([`Periode: ${period}`]);
    const dateRow = sheet.addRow([`Tanggal: ${new Date().toLocaleDateString('id-ID')}`]);
    periodRow.alignment = { horizontal: 'left' };
    dateRow.alignment = { horizontal: 'left' };

    sheet.addRow([]); // empty spacer

    // Header row
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell: ExcelJS.Cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } } as ExcelJS.Fill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      } as ExcelJS.Borders;
    });

    // Column widths
    sheet.columns = headers.map((h) => ({ width: Math.max(12, String(h).length + 4) }));

    // Data rows
    rows.forEach((r, idx) => {
      const row = sheet.addRow(r);
      row.eachCell((cell: ExcelJS.Cell) => {
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } },
          left: { style: 'hair', color: { argb: 'FFE0E0E0' } },
          right: { style: 'hair', color: { argb: 'FFE0E0E0' } },
        } as ExcelJS.Borders;
      });
      // Simple zebra striping
      if (idx % 2 === 1) {
        row.eachCell((cell: ExcelJS.Cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } } as ExcelJS.Fill;
        });
      }
    });

    return sheet;
  };

  // Fungsi untuk menambahkan header halaman
  const addHeader = (doc: jsPDF, title: string, period: string) => {
    doc.setFontSize(20);
    doc.text(title, 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Periode: ${period}`, 20, 30);
    doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 20, 38);
    
    // Tambahkan garis pemisah
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.7);
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
        fillColor: [16, 185, 129],
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
        fillColor: [16, 185, 129],
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
        fillColor: [16, 185, 129],
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
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SIM-Inventaris';
      workbook.created = new Date();
      
      // Tambahkan worksheet ringkasan
      if (reportType === 'overview' || reportType === 'all') {
        const summarySheet = workbook.addWorksheet('Ringkasan', {
          pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
        });
        const tRow = summarySheet.addRow(['Laporan Inventaris Sekolah']);
        tRow.font = { size: 16, bold: true };
        tRow.alignment = { horizontal: 'center' };
        summarySheet.mergeCells(1, 1, 1, 2);
        summarySheet.addRow([`Periode: ${period}`]);
        summarySheet.addRow([`Tanggal: ${new Date().toLocaleDateString('id-ID')}`]);
        summarySheet.addRow([]);
        // Kategori ringkasan
        summarySheet.addRow(['RINGKASAN STATISTIK']);
        summarySheet.addRow(['Kategori', 'Jumlah']);
        summarySheet.addRow(['Total Inventaris', _stats.total_inventaris]);
        summarySheet.addRow(['Total Obat-obatan', _stats.total_obat]);
        summarySheet.addRow(['Barang Rusak', _stats.damaged_items_count]);
        summarySheet.addRow(['Stok Obat Menipis', _stats.low_stock_count]);
        summarySheet.addRow([]);
        summarySheet.addRow(['DISTRIBUSI KATEGORI']);
        summarySheet.addRow(['Kategori', 'Jumlah']);
        Object.entries(_stats.kategori_inventaris || {}).forEach(([kategori, jumlah]) => {
          summarySheet.addRow([kategori, jumlah as number]);
        });
        summarySheet.addRow([]);
        summarySheet.addRow(['DISTRIBUSI LOKASI']);
        summarySheet.addRow(['Lokasi', 'Jumlah']);
        Object.entries(_stats.lokasi_distribution || {}).forEach(([lokasi, jumlah]) => {
          summarySheet.addRow([displayLokasi(lokasi), jumlah as number]);
        });
        summarySheet.columns = [{ width: 30 }, { width: 20 }];
      }
      

      // Tambahkan worksheet obat jika diperlukan (dengan template dan header berwarna)
      if (reportType === 'medicine' || reportType === 'overview' || reportType === 'all') {
        const sortedObat = getSortedObat(data.obat);
        const headers = ['Nama Obat', 'Stok', 'Satuan', 'Lokasi', 'Batas Minimal', 'Status', 'Terakhir Diperbarui'];
        const rows = sortedObat.map((obat) => [
          obat.nama_obat,
          obat.jumlah,
          (obat as ExtendedObat).satuan || '-',
          displayLokasi(obat.lokasi),
          obat.batas_minimal,
          obat.jumlah <= (obat.batas_minimal || 0) ? 'Stok Menipis' : 'Stok Aman',
          formatTanggalInput(obat),
        ] as (string | number | boolean | null)[]);

        createStyledSheet(workbook, 'Data Obat', 'Laporan Obat-obatan', period, headers, rows, 'FF10B981');
      }

      // Tambahkan worksheet inventaris jika diperlukan (dengan template dan header berwarna)
      if (reportType === 'inventory' || reportType === 'all') {
        const headers = ['Nama Barang', 'Kategori', 'Jumlah', 'Lokasi', 'Kondisi', 'Keterangan', 'Tanggal Input'];
        const rows = data.inventaris.map((item) => [
          item.nama_barang,
          item.kategori,
          item.jumlah,
          displayLokasi(item.lokasi as string),
          item.kondisi,
          item.keterangan || '-',
          formatTanggalInput(item),
        ] as (string | number | boolean | null)[]);

        createStyledSheet(workbook, 'Data Inventaris', 'Data Inventaris', period, headers, rows, 'FF10B981');
      }
      

      // Export data obat untuk overview/all juga sudah tercakup pada sheet "Data Obat" di atas.
      
      // Tambahkan worksheet kondisi barang jika diperlukan (dengan template dan header berwarna)
      if (reportType === 'condition' || reportType === 'all') {
        const headers = ['Nama Barang', 'Kategori', 'Kondisi', 'Jumlah', 'Lokasi', 'Keterangan', 'Terakhir Diperbarui'];
        const filtered = data.inventaris.filter((item) => item.kondisi !== 'Baik');
        const rows = filtered.map((item) => [
          item.nama_barang,
          item.kategori,
          item.kondisi,
          item.jumlah,
          displayLokasi(item.lokasi as string),
          item.keterangan || '-',
          formatTanggalInput(item),
        ] as (string | number | boolean | null)[]);

        createStyledSheet(workbook, 'Kondisi Barang', 'Barang yang Perlu Perhatian', period, headers, rows, 'FF10B981');
      }
      
      // Generate nama file dan simpan (browser download)
      const fileName = `laporan-${reportType}-${new Date().toISOString().split('T')[0]}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
