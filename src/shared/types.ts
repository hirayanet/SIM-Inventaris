import z from "zod";

// User types
export const UserRoleSchema = z.enum(['admin', 'operator_paud', 'operator_tk', 'operator_sd', 'operator_smp']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: UserRoleSchema,
  full_name: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// Inventory types
export const LokasiSchema = z.enum(['PAUD', 'TK', 'SD', 'SMP']);
export type Lokasi = z.infer<typeof LokasiSchema>;

export const KategoriSchema = z.enum(['Peralatan', 'Perabot', 'Elektronik', 'Buku', 'Obat-obatan']);
export type Kategori = z.infer<typeof KategoriSchema>;

export const KondisiSchema = z.enum(['Baik', 'Rusak Ringan', 'Rusak Berat']);
export type Kondisi = z.infer<typeof KondisiSchema>;

export const InventarisSchema = z.object({
  id: z.number(),
  nama_barang: z.string(),
  kategori: KategoriSchema,
  jumlah: z.number(),
  lokasi: LokasiSchema,
  kondisi: KondisiSchema,
  tanggal_input: z.string(),
  keterangan: z.string().nullable(),
  created_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Inventaris = z.infer<typeof InventarisSchema>;

// Medicine types
export const ObatSchema = z.object({
  id: z.number(),
  nama_obat: z.string(),
  jumlah: z.number(),
  lokasi: LokasiSchema,
  tanggal_input: z.string(),
  tanggal_kadaluarsa: z.string().nullable(),
  satuan: z.string().nullable().optional(),
  keterangan: z.string().nullable(),
  batas_minimal: z.number(),
  created_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Obat = z.infer<typeof ObatSchema>;

export const RiwayatObatSchema = z.object({
  id: z.number(),
  obat_id: z.number(),
  jumlah_keluar: z.number(),
  tanggal_keluar: z.string(),
  keterangan: z.string().nullable(),
  created_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RiwayatObat = z.infer<typeof RiwayatObatSchema>;

// API request types
export const LoginRequestSchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CreateInventarisRequestSchema = z.object({
  nama_barang: z.string(),
  kategori: KategoriSchema,
  jumlah: z.number(),
  lokasi: LokasiSchema,
  kondisi: KondisiSchema,
  keterangan: z.string().optional(),
});
export type CreateInventarisRequest = z.infer<typeof CreateInventarisRequestSchema>;

export const CreateObatRequestSchema = z.object({
  nama_obat: z.string(),
  jumlah: z.number(),
  lokasi: LokasiSchema,
  tanggal_kadaluarsa: z.string().optional(),
  batas_minimal: z.number().default(5),
  keterangan: z.string().optional(),
});
export type CreateObatRequest = z.infer<typeof CreateObatRequestSchema>;

export const ObatUsageRequestSchema = z.object({
  obat_id: z.number(),
  jumlah_keluar: z.number(),
  keterangan: z.string().optional(),
});
export type ObatUsageRequest = z.infer<typeof ObatUsageRequestSchema>;

// Dashboard stats
export const DashboardStatsSchema = z.object({
  total_peralatan: z.number(),
  total_perabot: z.number(),
  total_elektronik: z.number(),
  total_buku: z.number(),
  total_obat: z.number(),
  low_stock_medicines: z.array(ObatSchema),
  damaged_items: z.array(InventarisSchema),
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
