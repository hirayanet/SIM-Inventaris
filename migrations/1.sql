
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventaris (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_barang TEXT NOT NULL,
  kategori TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 0,
  lokasi TEXT NOT NULL,
  kondisi TEXT NOT NULL,
  tanggal_input DATE DEFAULT CURRENT_DATE,
  keterangan TEXT,
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE obat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_obat TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 0,
  lokasi TEXT NOT NULL,
  tanggal_input DATE DEFAULT CURRENT_DATE,
  keterangan TEXT,
  batas_minimal INTEGER DEFAULT 5,
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE riwayat_obat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obat_id INTEGER NOT NULL,
  jumlah_keluar INTEGER NOT NULL,
  tanggal_keluar DATE DEFAULT CURRENT_DATE,
  keterangan TEXT,
  created_by_user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user
INSERT INTO users (username, password, role, full_name) VALUES 
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'Administrator');
