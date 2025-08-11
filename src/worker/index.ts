import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { 
  LoginRequestSchema, 
  CreateInventarisRequestSchema, 
  CreateObatRequestSchema,
  ObatUsageRequestSchema,
  DashboardStatsSchema
} from "@/shared/types";

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Utility functions
function getUserLocationFilter(role: string): string[] {
  switch (role) {
    case 'admin':
      return ['PAUD', 'TK', 'SD', 'SMP'];
    case 'operator_paud':
      return ['PAUD'];
    case 'operator_tk':
      return ['TK'];
    case 'operator_sd':
      return ['SD'];
    case 'operator_smp':
      return ['SMP'];
    default:
      return [];
  }
}



// Authentication endpoints
app.post('/api/login', zValidator('json', LoginRequestSchema), async (c) => {
  const { username, password } = c.req.valid('json');
  
  try {
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE username = ? AND is_active = 1'
    ).bind(username).first();

    if (!user) {
      return c.json({ error: 'Username atau password salah' }, 401);
    }

    // Simple password check for demo
    if (user.password !== password) {
      return c.json({ error: 'Username atau password salah' }, 401);
    }

    // Create user response without password, converting is_active to boolean
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      is_active: Boolean(user.is_active),
      created_at: user.created_at,
      updated_at: user.updated_at
    };
    return c.json({ user: userResponse });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Server error' }, 500);
  }
});

// Utility function to automatically expire medicines
async function processExpiredMedicines(db: D1Database, locations: string[]) {
  const locationFilter = locations.map(() => '?').join(',');
  
  // Find expired medicines that still have stock
  const expiredMedicines = await db.prepare(
    `SELECT id, nama_obat, jumlah FROM obat 
     WHERE tanggal_kadaluarsa IS NOT NULL 
     AND DATE(tanggal_kadaluarsa) < DATE('now') 
     AND jumlah > 0 
     AND lokasi IN (${locationFilter})`
  ).bind(...locations).all();

  // Process each expired medicine
  for (const medicine of expiredMedicines.results || []) {
    // Record the automatic expiration
    await db.prepare(
      'INSERT INTO riwayat_obat (obat_id, jumlah_keluar, keterangan) VALUES (?, ?, ?)'
    ).bind(
      medicine.id, 
      medicine.jumlah, 
      `Otomatis dikurangi karena kadaluarsa pada ${new Date().toLocaleDateString('id-ID')}`
    ).run();

    // Set stock to 0
    await db.prepare(
      'UPDATE obat SET jumlah = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(medicine.id).run();
  }
}

// Dashboard endpoints
app.get('/api/dashboard/:role', async (c) => {
  const role = c.req.param('role');
  const locations = getUserLocationFilter(role);
  
  if (locations.length === 0) {
    return c.json({ error: 'Invalid role' }, 403);
  }

  try {
    // Process expired medicines first
    await processExpiredMedicines(c.env.DB, locations);
    
    const locationFilter = locations.map(() => '?').join(',');
    
    // Get inventory stats by category
    const peralatanCount = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM inventaris WHERE kategori = 'Peralatan' AND lokasi IN (${locationFilter})`
    ).bind(...locations).first();
    
    const perabotCount = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM inventaris WHERE kategori = 'Perabot' AND lokasi IN (${locationFilter})`
    ).bind(...locations).first();
    
    const elektronikCount = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM inventaris WHERE kategori = 'Elektronik' AND lokasi IN (${locationFilter})`
    ).bind(...locations).first();
    
    const bukuCount = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM inventaris WHERE kategori = 'Buku' AND lokasi IN (${locationFilter})`
    ).bind(...locations).first();
    
    const obatCount = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM obat WHERE lokasi IN (${locationFilter})`
    ).bind(...locations).first();

    // Get low stock medicines (including those expiring soon)
    const lowStockMedicines = await c.env.DB.prepare(
      `SELECT * FROM obat WHERE (jumlah <= batas_minimal OR (tanggal_kadaluarsa IS NOT NULL AND DATE(tanggal_kadaluarsa) <= DATE('now', '+30 days'))) AND lokasi IN (${locationFilter})`
    ).bind(...locations).all();

    // Get damaged items
    const damagedItems = await c.env.DB.prepare(
      `SELECT * FROM inventaris WHERE kondisi = 'Rusak Berat' AND lokasi IN (${locationFilter})`
    ).bind(...locations).all();

    const stats = DashboardStatsSchema.parse({
      total_peralatan: peralatanCount?.total || 0,
      total_perabot: perabotCount?.total || 0,
      total_elektronik: elektronikCount?.total || 0,
      total_buku: bukuCount?.total || 0,
      total_obat: obatCount?.total || 0,
      low_stock_medicines: lowStockMedicines.results || [],
      damaged_items: damagedItems.results || [],
    });

    return c.json(stats);
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

// Inventory endpoints
app.get('/api/inventaris/:role', async (c) => {
  const role = c.req.param('role');
  const locations = getUserLocationFilter(role);
  
  if (locations.length === 0) {
    return c.json({ error: 'Invalid role' }, 403);
  }

  try {
    // Process expired medicines first (in case admin is viewing)
    if (role === 'admin') {
      await processExpiredMedicines(c.env.DB, ['PAUD', 'TK', 'SD', 'SMP']);
    } else {
      await processExpiredMedicines(c.env.DB, locations);
    }
    
    const locationFilter = locations.map(() => '?').join(',');
    const result = await c.env.DB.prepare(
      `SELECT * FROM inventaris WHERE lokasi IN (${locationFilter}) ORDER BY created_at DESC`
    ).bind(...locations).all();

    return c.json(result.results);
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

app.post('/api/inventaris', zValidator('json', CreateInventarisRequestSchema), async (c) => {
  const data = c.req.valid('json');
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO inventaris (nama_barang, kategori, jumlah, lokasi, kondisi, keterangan) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      data.nama_barang,
      data.kategori,
      data.jumlah,
      data.lokasi,
      data.kondisi,
      data.keterangan || null
    ).run();

    return c.json({ id: result.meta.last_row_id });
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

// Medicine endpoints
app.get('/api/obat/:role', async (c) => {
  const role = c.req.param('role');
  const locations = getUserLocationFilter(role);
  
  if (locations.length === 0) {
    return c.json({ error: 'Invalid role' }, 403);
  }

  try {
    // Process expired medicines first
    await processExpiredMedicines(c.env.DB, locations);
    
    const locationFilter = locations.map(() => '?').join(',');
    const result = await c.env.DB.prepare(
      `SELECT * FROM obat WHERE lokasi IN (${locationFilter}) ORDER BY created_at DESC`
    ).bind(...locations).all();

    return c.json(result.results);
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

app.post('/api/obat', zValidator('json', CreateObatRequestSchema), async (c) => {
  const data = c.req.valid('json');
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO obat (nama_obat, jumlah, lokasi, tanggal_kadaluarsa, batas_minimal, keterangan) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      data.nama_obat,
      data.jumlah,
      data.lokasi,
      data.tanggal_kadaluarsa || null,
      data.batas_minimal,
      data.keterangan || null
    ).run();

    return c.json({ id: result.meta.last_row_id });
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

app.post('/api/obat/usage', zValidator('json', ObatUsageRequestSchema), async (c) => {
  const data = c.req.valid('json');
  
  try {
    // Start transaction
    await c.env.DB.batch([
      // Record usage
      c.env.DB.prepare(
        'INSERT INTO riwayat_obat (obat_id, jumlah_keluar, keterangan) VALUES (?, ?, ?)'
      ).bind(data.obat_id, data.jumlah_keluar, data.keterangan || null),
      // Update stock
      c.env.DB.prepare(
        'UPDATE obat SET jumlah = jumlah - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(data.jumlah_keluar, data.obat_id)
    ]);

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

app.get('/api/obat/riwayat/:role', async (c) => {
  const role = c.req.param('role');
  const locations = getUserLocationFilter(role);
  
  if (locations.length === 0) {
    return c.json({ error: 'Invalid role' }, 403);
  }

  try {
    const locationFilter = locations.map(() => '?').join(',');
    const result = await c.env.DB.prepare(`
      SELECT r.*, o.nama_obat, o.lokasi 
      FROM riwayat_obat r 
      JOIN obat o ON r.obat_id = o.id 
      WHERE o.lokasi IN (${locationFilter}) 
      ORDER BY r.created_at DESC
    `).bind(...locations).all();

    return c.json(result.results);
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

// Fallback: layani aset statis untuk semua path non-API (SPA routes seperti /login)
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  if (!url.pathname.startsWith('/api')) {
    const anyEnv = c.env as any;
    if (anyEnv && anyEnv.ASSETS && typeof anyEnv.ASSETS.fetch === 'function') {
      return anyEnv.ASSETS.fetch(c.req.raw);
    }
  }
  return c.notFound();
});

export default app;
