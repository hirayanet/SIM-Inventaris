
-- Sample inventory data
INSERT INTO inventaris (nama_barang, kategori, jumlah, lokasi, kondisi, keterangan) VALUES 
('Meja Siswa', 'Perabot', 30, 'SD', 'Baik', 'Meja kelas 1'),
('Kursi Siswa', 'Perabot', 30, 'SD', 'Baik', 'Kursi kelas 1'),
('Papan Tulis', 'Peralatan', 5, 'SD', 'Baik', 'Papan tulis kelas'),
('Laptop', 'Elektronik', 3, 'SD', 'Baik', 'Untuk admin'),
('Proyektor', 'Elektronik', 2, 'SD', 'Rusak Ringan', 'Perlu service'),
('Buku Matematika', 'Buku', 50, 'SD', 'Baik', 'Kelas 1-3'),
('Meja Guru', 'Perabot', 5, 'SMP', 'Baik', 'Ruang guru'),
('Komputer', 'Elektronik', 10, 'SMP', 'Baik', 'Lab komputer'),
('Lemari Arsip', 'Perabot', 3, 'SMP', 'Rusak Berat', 'Perlu penggantian'),
('Buku IPA', 'Buku', 40, 'SMP', 'Baik', 'Kelas 7-9');

-- Sample medicine data
INSERT INTO obat (nama_obat, jumlah, lokasi, batas_minimal, keterangan) VALUES 
('Paracetamol', 50, 'SD', 10, 'Demam dan sakit kepala'),
('Betadine', 5, 'SD', 5, 'Antiseptik luka'),
('Hansaplast', 20, 'SD', 10, 'Plester luka'),
('Paracetamol', 30, 'SMP', 10, 'Demam dan sakit kepala'),
('Oralit', 3, 'SMP', 5, 'Diare dan dehidrasi'),
('Minyak Kayu Putih', 8, 'PAUD', 5, 'Masuk angin'),
('Alkohol 70%', 2, 'TK', 3, 'Antiseptik');
