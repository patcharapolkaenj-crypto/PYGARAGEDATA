// server.js
// Backend API - Express + SQLite + Multer (อัปโหลดรูป)
// รันด้วยคำสั่ง: npm install แล้วตามด้วย npm start
// เปิดเว็บที่ http://localhost:3000

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function pickEmployee(b) {
  return {
    photo_url: b.photo_url || '',
    full_name: b.full_name || '',
    phone: b.phone || '',
    email: b.email || '',
    id_card: b.id_card || '',
    address: b.address || '',
    facebook: b.facebook || '',
    instagram: b.instagram || '',
    tiktok: b.tiktok || '',
    license_no: b.license_no || '',
    position: b.position || '',
    department: b.department || '',
    start_date: b.start_date || '',
    is_active: b.is_active ? 1 : 0,
    notes: b.notes || '',
    extra_data: b.extra_data ? JSON.stringify(b.extra_data) : null,
  };
}

// ---------- Auth ----------
app.post('/api/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก username และ password' });
  }

  const row = db.prepare(`
    SELECT a.*, e.full_name AS employee_name, e.photo_url
    FROM accounts a
    LEFT JOIN employees e ON e.id = a.employee_id
    WHERE a.username = ? AND a.password = ? AND a.is_active = 1
  `).get(username, password);

  if (!row) {
    return res.status(401).json({ error: 'username หรือ password ไม่ถูกต้อง' });
  }

  res.json({
    user: {
      id: row.id,
      employee_id: row.employee_id,
      username: row.username,
      role: row.role,
      employee_name: row.employee_name || row.username,
      photo_url: row.photo_url || ''
    }
  });
});

app.post('/api/auth/forgot', (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'กรุณากรอก username ก่อน' });
  }

  const row = db.prepare(`SELECT * FROM accounts WHERE username = ?`).get(username);
  if (!row) {
    return res.json({ message: 'หาก username นี้ถูกต้อง ระบบจะส่งข้อมูลการกู้คืนรหัสผ่านให้ภายในเวลาอันสั้น' });
  }

  return res.json({
    message: 'หาก username นี้ถูกต้อง ระบบจะส่งข้อมูลการกู้คืนรหัสผ่านให้ภายในเวลาอันสั้น',
    username: row.username
  });
});

// ---------- Employee / Account ----------
app.get('/api/employees', (req, res) => {
  const { q } = req.query;
  let sql = `SELECT * FROM employees WHERE 1=1`;
  const params = [];

  if (q) {
    sql += ` AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ? OR id_card LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ` ORDER BY id DESC`;
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/employees/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id);
  if (!row) return notFound(res, 'ไม่พบพนักงาน');
  res.json(row);
});

app.post('/api/employees', (req, res) => {
  const employee = pickEmployee(req.body);
  const stmt = db.prepare(`
    INSERT INTO employees (photo_url, full_name, phone, email, id_card, address, facebook, instagram, tiktok, license_no, position, department, start_date, is_active, notes, extra_data)
    VALUES (@photo_url, @full_name, @phone, @email, @id_card, @address, @facebook, @instagram, @tiktok, @license_no, @position, @department, @start_date, @is_active, @notes, @extra_data)
  `);
  const info = stmt.run(employee);

  const username = String(req.body.account_username || '').trim();
  const password = String(req.body.account_password || '').trim();
  const role = 'staff';

  if (username && password) {
    if (username.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'บัญชีหลักสามารถเปลี่ยนได้เฉพาะผ่าน DATABASE เท่านั้น' });
    }

    const exists = db.prepare(`SELECT id FROM accounts WHERE username = ?`).get(username);
    if (exists) {
      return res.status(400).json({ error: 'username นี้ถูกใช้งานแล้ว' });
    }

    db.prepare(`
      INSERT INTO accounts (employee_id, username, password, role, is_active, created_by)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(info.lastInsertRowid, username, password, role, req.body.created_by || null);
  }

  res.json(db.prepare(`SELECT * FROM employees WHERE id = ?`).get(info.lastInsertRowid));
});

app.put('/api/employees/:id', (req, res) => {
  const exists = db.prepare(`SELECT id FROM employees WHERE id = ?`).get(req.params.id);
  if (!exists) return notFound(res, 'ไม่พบพนักงาน');

  const employee = pickEmployee(req.body);
  employee.id = req.params.id;
  db.prepare(`
    UPDATE employees SET
      photo_url=@photo_url, full_name=@full_name, phone=@phone, email=@email, id_card=@id_card,
      address=@address, facebook=@facebook, instagram=@instagram, tiktok=@tiktok, license_no=@license_no,
      position=@position, department=@department, start_date=@start_date, is_active=@is_active,
      notes=@notes, extra_data=@extra_data, updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run(employee);

  const username = String(req.body.account_username || '').trim();
  const password = String(req.body.account_password || '').trim();
  const role = 'staff';

  if (username) {
    if (username.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'บัญชีหลักสามารถเปลี่ยนได้เฉพาะผ่าน DATABASE เท่านั้น' });
    }

    const row = db.prepare(`SELECT * FROM accounts WHERE employee_id = ?`).get(req.params.id);
    if (row) {
      if (password) {
        db.prepare(`UPDATE accounts SET username = ?, password = ?, role = ?, updated_at = datetime('now','localtime') WHERE employee_id = ?`).run(username, password, role, req.params.id);
      } else {
        db.prepare(`UPDATE accounts SET username = ?, role = ?, updated_at = datetime('now','localtime') WHERE employee_id = ?`).run(username, role, req.params.id);
      }
    } else if (password) {
      db.prepare(`INSERT INTO accounts (employee_id, username, password, role, is_active, created_by) VALUES (?, ?, ?, ?, 1, ?)`).run(req.params.id, username, password, role, req.body.created_by || null);
    }
  }

  res.json(db.prepare(`SELECT * FROM employees WHERE id = ?`).get(req.params.id));
});

app.delete('/api/employees/:id', (req, res) => {
  db.prepare(`DELETE FROM employees WHERE id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM accounts WHERE employee_id = ?`).run(req.params.id);
  res.json({ success: true });
});

app.get('/api/accounts', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, e.full_name AS employee_name
    FROM accounts a
    LEFT JOIN employees e ON e.id = a.employee_id
    ORDER BY a.id DESC
  `).all();
  res.json(rows);
});

app.get('/api/settings', (req, res) => {
  const row = db.prepare(`SELECT * FROM app_settings WHERE id = 1`).get();
  res.json(row || { id: 1, app_name: 'PY GARAGE MENU', app_subtitle: 'Rental Ops', app_title: 'PY GARAGE MENU' });
});

app.put('/api/settings', (req, res) => {
  const role = String(req.body.role || '').trim();
  if (role !== 'admin') {
    return res.status(403).json({ error: 'เฉพาะผู้ใช้งาน Admin เท่านั้นที่สามารถเปลี่ยนข้อมูลแบรนด์ได้' });
  }

  const appName = String(req.body.app_name || 'PY GARAGE MENU').trim() || 'PY GARAGE MENU';
  const appSubtitle = String(req.body.app_subtitle || 'Rental Ops').trim() || 'Rental Ops';
  const appTitle = String(req.body.app_title || 'PY GARAGE MENU').trim() || 'PY GARAGE MENU';

  db.prepare(`
    UPDATE app_settings
    SET app_name = ?, app_subtitle = ?, app_title = ?, updated_at = datetime('now','localtime')
    WHERE id = 1
  `).run(appName, appSubtitle, appTitle);

  const row = db.prepare(`SELECT * FROM app_settings WHERE id = 1`).get();
  res.json(row);
});

// ---------- อัปโหลดรูปภาพ ----------
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('อัปโหลดได้เฉพาะไฟล์รูปภาพเท่านั้น'));
  },
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- Helper ----------
function notFound(res, name = 'ไม่พบข้อมูล') {
  return res.status(404).json({ error: name });
}

// ================= CUSTOMERS =================
app.get('/api/customers', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    rows = db.prepare(
      `SELECT * FROM customers WHERE full_name LIKE ? OR phone LIKE ? OR id_card LIKE ? ORDER BY id DESC`
    ).all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare(`SELECT * FROM customers ORDER BY id DESC`).all();
  }
  res.json(rows);
});

app.get('/api/customers/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
  if (!row) return notFound(res, 'ไม่พบลูกค้า');
  res.json(row);
});

const customerFields = ['photo_url','full_name','phone','email','id_card','address','facebook','instagram','tiktok','license_no','is_blacklisted','blacklist_reason','notes','extra_data'];
function pickCustomer(b) {
  return {
    photo_url: b.photo_url || '',
    full_name: b.full_name || '',
    phone: b.phone || '',
    email: b.email || '',
    id_card: b.id_card || '',
    address: b.address || '',
    facebook: b.facebook || '',
    instagram: b.instagram || '',
    tiktok: b.tiktok || '',
    license_no: b.license_no || '',
    is_blacklisted: b.is_blacklisted ? 1 : 0,
    blacklist_reason: b.blacklist_reason || '',
    notes: b.notes || '',
    extra_data: b.extra_data ? JSON.stringify(b.extra_data) : null,
  };
}

app.post('/api/customers', (req, res) => {
  const data = pickCustomer(req.body);
  const stmt = db.prepare(`
    INSERT INTO customers (photo_url, full_name, phone, email, id_card, address, facebook, instagram, tiktok, license_no, is_blacklisted, blacklist_reason, notes, extra_data)
    VALUES (@photo_url, @full_name, @phone, @email, @id_card, @address, @facebook, @instagram, @tiktok, @license_no, @is_blacklisted, @blacklist_reason, @notes, @extra_data)
  `);
  const info = stmt.run(data);
  res.json(db.prepare(`SELECT * FROM customers WHERE id = ?`).get(info.lastInsertRowid));
});

app.put('/api/customers/:id', (req, res) => {
  const exists = db.prepare(`SELECT id FROM customers WHERE id = ?`).get(req.params.id);
  if (!exists) return notFound(res, 'ไม่พบลูกค้า');
  const data = pickCustomer(req.body);
  data.id = req.params.id;
  db.prepare(`
    UPDATE customers SET
      photo_url=@photo_url, full_name=@full_name, phone=@phone, email=@email, id_card=@id_card,
      address=@address, facebook=@facebook, instagram=@instagram, tiktok=@tiktok, license_no=@license_no,
      is_blacklisted=@is_blacklisted, blacklist_reason=@blacklist_reason, notes=@notes,
      extra_data=@extra_data, updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run(data);
  res.json(db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id));
});

app.delete('/api/customers/:id', (req, res) => {
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// ประวัติการเช่าทั้งหมดของลูกค้ารายนี้
app.get('/api/customers/:id/rentals', (req, res) => {
  const rows = db.prepare(`
    SELECT rentals.*, vehicles.type AS vehicle_type, vehicles.brand AS vehicle_brand,
           vehicles.model AS vehicle_model, vehicles.license_plate AS vehicle_plate,
           vehicles.photo_url AS vehicle_photo
    FROM rentals JOIN vehicles ON vehicles.id = rentals.vehicle_id
    WHERE rentals.customer_id = ?
    ORDER BY rentals.start_datetime DESC
  `).all(req.params.id);
  res.json(rows);
});

// ================= VEHICLES =================
app.get('/api/vehicles', (req, res) => {
  const { type, status, q } = req.query;
  let sql = `SELECT * FROM vehicles WHERE 1=1`;
  const params = [];
  if (type) { sql += ` AND type = ?`; params.push(type); }
  if (status) { sql += ` AND status = ?`; params.push(status); }
  if (q) { sql += ` AND (brand LIKE ? OR model LIKE ? OR license_plate LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ` ORDER BY id DESC`;
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/vehicles/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!row) return notFound(res, 'ไม่พบรถ');
  res.json(row);
});

// ผู้เช่าปัจจุบันของรถคันนี้ (ถ้ามี) + ข้อมูลลูกค้าเต็ม + ประวัติการเช่าทั้งหมดของคันนี้
app.get('/api/vehicles/:id/status', (req, res) => {
  const vehicle = db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!vehicle) return notFound(res, 'ไม่พบรถ');

  const currentRental = db.prepare(`
    SELECT rentals.*, customers.* , rentals.id AS rental_id, customers.id AS customer_id
    FROM rentals JOIN customers ON customers.id = rentals.customer_id
    WHERE rentals.vehicle_id = ? AND rentals.status = 'active'
    ORDER BY rentals.start_datetime DESC LIMIT 1
  `).get(req.params.id);

  const history = db.prepare(`
    SELECT rentals.*, customers.full_name AS customer_name, customers.phone AS customer_phone
    FROM rentals JOIN customers ON customers.id = rentals.customer_id
    WHERE rentals.vehicle_id = ?
    ORDER BY rentals.start_datetime DESC
  `).all(req.params.id);

  res.json({ vehicle, currentRental: currentRental || null, history });
});

const vehicleFields = ['photo_url','type','brand','model','year','license_plate','color','daily_rate','deposit_rate','status','notes','extra_data'];
function pickVehicle(b) {
  return {
    photo_url: b.photo_url || '',
    type: b.type || 'bike',
    brand: b.brand || '',
    model: b.model || '',
    year: b.year || null,
    license_plate: b.license_plate || '',
    color: b.color || '',
    daily_rate: b.daily_rate || 0,
    deposit_rate: b.deposit_rate || 0,
    status: b.status || 'available',
    notes: b.notes || '',
    extra_data: b.extra_data ? JSON.stringify(b.extra_data) : null,
  };
}

app.post('/api/vehicles', (req, res) => {
  const data = pickVehicle(req.body);
  const stmt = db.prepare(`
    INSERT INTO vehicles (photo_url, type, brand, model, year, license_plate, color, daily_rate, deposit_rate, status, notes, extra_data)
    VALUES (@photo_url, @type, @brand, @model, @year, @license_plate, @color, @daily_rate, @deposit_rate, @status, @notes, @extra_data)
  `);
  const info = stmt.run(data);
  res.json(db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(info.lastInsertRowid));
});

app.put('/api/vehicles/:id', (req, res) => {
  const exists = db.prepare(`SELECT id FROM vehicles WHERE id = ?`).get(req.params.id);
  if (!exists) return notFound(res, 'ไม่พบรถ');
  const data = pickVehicle(req.body);
  data.id = req.params.id;
  db.prepare(`
    UPDATE vehicles SET
      photo_url=@photo_url, type=@type, brand=@brand, model=@model, year=@year, license_plate=@license_plate,
      color=@color, daily_rate=@daily_rate, deposit_rate=@deposit_rate, status=@status,
      notes=@notes, extra_data=@extra_data, updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run(data);
  res.json(db.prepare(`SELECT * FROM vehicles WHERE id = ?`).get(req.params.id));
});

app.delete('/api/vehicles/:id', (req, res) => {
  db.prepare(`DELETE FROM vehicles WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// ================= RENTALS =================
const rentalSelect = `
  SELECT rentals.*,
         customers.full_name AS customer_name,
         customers.phone AS customer_phone,
         customers.photo_url AS customer_photo,
         customers.is_blacklisted AS customer_blacklisted,
         vehicles.type AS vehicle_type,
         vehicles.brand AS vehicle_brand,
         vehicles.model AS vehicle_model,
         vehicles.license_plate AS vehicle_plate,
         vehicles.photo_url AS vehicle_photo
  FROM rentals
  JOIN customers ON customers.id = rentals.customer_id
  JOIN vehicles ON vehicles.id = rentals.vehicle_id
`;

app.get('/api/rentals', (req, res) => {
  const { status, customer_id, vehicle_id, from, to } = req.query;
  let sql = rentalSelect + ` WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND rentals.status = ?`; params.push(status); }
  if (customer_id) { sql += ` AND rentals.customer_id = ?`; params.push(customer_id); }
  if (vehicle_id) { sql += ` AND rentals.vehicle_id = ?`; params.push(vehicle_id); }
  if (from) { sql += ` AND rentals.start_datetime >= ?`; params.push(from); }
  if (to) { sql += ` AND rentals.start_datetime <= ?`; params.push(to); }
  sql += ` ORDER BY rentals.start_datetime DESC`;
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/rentals/:id', (req, res) => {
  const row = db.prepare(rentalSelect + ` WHERE rentals.id = ?`).get(req.params.id);
  if (!row) return notFound(res, 'ไม่พบรายการเช่า');
  res.json(row);
});

function pickRental(b) {
  return {
    customer_id: b.customer_id,
    vehicle_id: b.vehicle_id,
    start_datetime: b.start_datetime,
    end_datetime: b.end_datetime,
    actual_return_datetime: b.actual_return_datetime || null,
    total_price: b.total_price || 0,
    deposit_paid: b.deposit_paid || 0,
    status: b.status || 'active',
    pickup_location: b.pickup_location || '',
    return_location: b.return_location || '',
    notes: b.notes || '',
    extra_data: b.extra_data ? JSON.stringify(b.extra_data) : null,
  };
}

app.post('/api/rentals', (req, res) => {
  const data = pickRental(req.body);
  const stmt = db.prepare(`
    INSERT INTO rentals (customer_id, vehicle_id, start_datetime, end_datetime, actual_return_datetime,
      total_price, deposit_paid, status, pickup_location, return_location, notes, extra_data)
    VALUES (@customer_id, @vehicle_id, @start_datetime, @end_datetime, @actual_return_datetime,
      @total_price, @deposit_paid, @status, @pickup_location, @return_location, @notes, @extra_data)
  `);
  const info = stmt.run(data);
  if (data.status === 'active') {
    db.prepare(`UPDATE vehicles SET status = 'rented' WHERE id = ?`).run(data.vehicle_id);
  }
  res.json(db.prepare(rentalSelect + ` WHERE rentals.id = ?`).get(info.lastInsertRowid));
});

app.put('/api/rentals/:id', (req, res) => {
  const exists = db.prepare(`SELECT id FROM rentals WHERE id = ?`).get(req.params.id);
  if (!exists) return notFound(res, 'ไม่พบรายการเช่า');
  const data = pickRental(req.body);
  data.id = req.params.id;
  db.prepare(`
    UPDATE rentals SET
      customer_id=@customer_id, vehicle_id=@vehicle_id, start_datetime=@start_datetime, end_datetime=@end_datetime,
      actual_return_datetime=@actual_return_datetime, total_price=@total_price, deposit_paid=@deposit_paid,
      status=@status, pickup_location=@pickup_location, return_location=@return_location,
      notes=@notes, extra_data=@extra_data, updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run(data);
  // ถ้าคืนรถแล้ว หรือยกเลิก ให้รถกลับเป็น available; ถ้า active ให้เป็น rented
  if (data.status === 'returned' || data.status === 'cancelled') {
    db.prepare(`UPDATE vehicles SET status = 'available' WHERE id = ?`).run(data.vehicle_id);
  } else if (data.status === 'active') {
    db.prepare(`UPDATE vehicles SET status = 'rented' WHERE id = ?`).run(data.vehicle_id);
  }
  res.json(db.prepare(rentalSelect + ` WHERE rentals.id = ?`).get(req.params.id));
});

app.delete('/api/rentals/:id', (req, res) => {
  const rental = db.prepare(`SELECT * FROM rentals WHERE id = ?`).get(req.params.id);
  db.prepare(`DELETE FROM rentals WHERE id = ?`).run(req.params.id);
  if (rental) {
    db.prepare(`UPDATE vehicles SET status = 'available' WHERE id = ?`).run(rental.vehicle_id);
  }
  res.json({ success: true });
});

// ================= DASHBOARD =================
app.get('/api/dashboard', (req, res) => {
  const totalCustomers = db.prepare(`SELECT COUNT(*) c FROM customers`).get().c;
  const totalVehicles = db.prepare(`SELECT COUNT(*) c FROM vehicles`).get().c;
  const availableVehicles = db.prepare(`SELECT COUNT(*) c FROM vehicles WHERE status='available'`).get().c;
  const rentedVehicles = db.prepare(`SELECT COUNT(*) c FROM vehicles WHERE status='rented'`).get().c;
  const activeRentals = db.prepare(`SELECT COUNT(*) c FROM rentals WHERE status='active'`).get().c;
  const overdueRentals = db.prepare(`
    SELECT COUNT(*) c FROM rentals WHERE status='active' AND end_datetime < datetime('now','localtime')
  `).get().c;
  const monthRevenue = db.prepare(`
    SELECT COALESCE(SUM(total_price),0) s FROM rentals
    WHERE strftime('%Y-%m', start_datetime) = strftime('%Y-%m','now','localtime')
  `).get().s;
  const blacklistedCustomers = db.prepare(`SELECT COUNT(*) c FROM customers WHERE is_blacklisted = 1`).get().c;

  res.json({
    totalCustomers, totalVehicles, availableVehicles, rentedVehicles,
    activeRentals, overdueRentals, monthRevenue, blacklistedCustomers
  });
});

app.listen(PORT, () => {
  console.log(`✅ Rental App server running at http://localhost:${PORT}`);
});
