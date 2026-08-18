// app.js — frontend logic ทั้งหมดของระบบ
const API = '/api';

// ---------- Utilities ----------
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error((await res.json()).error || 'เกิดข้อผิดพลาด');
  return res.json();
}

async function uploadPhoto(file) {
  const fd = new FormData();
  fd.append('photo', file);
  const res = await fetch(API + '/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ');
  const data = await res.json();
  return data.url;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function fmtDateTime(dt) {
  if (!dt) return '-';
  const d = new Date(dt.replace(' ', 'T'));
  const thaiYear = d.getFullYear() + 543;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${thaiYear} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtDuration(startStr, endStr) {
  if (!startStr || !endStr) return '-';
  const start = new Date(startStr.replace(' ', 'T'));
  const end = new Date(endStr.replace(' ', 'T'));
  const hrs = Math.max(0, Math.round((end - start) / 3600000));
  const days = Math.floor(hrs / 24);
  const rem = hrs % 24;
  if (days === 0) return `${hrs} ชม.`;
  return rem === 0 ? `${days} วัน` : `${days} วัน ${rem} ชม.`;
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
}
function statusLabel(status) {
  const map = {
    active: 'กำลังเช่า', returned: 'คืนแล้ว', cancelled: 'ยกเลิก', overdue: 'เกินกำหนด',
    available: 'ว่าง', rented: 'ถูกเช่าอยู่', maintenance: 'ซ่อมบำรุง',
  };
  return map[status] || status;
}
function toLocalInput(dt) {
  if (!dt) return '';
  const d = new Date(dt.replace(' ', 'T'));
  const thaiYear = d.getFullYear() + 543;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${thaiYear} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function parseDbDateTime(dt) {
  if (!dt) return { date: '', time: '' };
  const d = new Date(dt.replace(' ', 'T'));
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}
function parseDisplayDateTime(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(\d{1,2}):(\d{2})$/);
  if (!m) return trimmed;
  const [, day, month, yearText, hour, minute] = m;
  let year = Number(yearText);
  if (year > 2400) year = year - 543;
  return `${year}-${pad2(Number(month))}-${pad2(Number(day))} ${pad2(Number(hour))}:${pad2(Number(minute))}`;
}
function toDisplayDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt.replace(' ', 'T'));
  const thaiYear = d.getFullYear() + 543;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${thaiYear} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function combineDateTime(dateValue, timeValue) {
  if (!dateValue) return '';
  const date = String(dateValue).trim();
  const time = String(timeValue || '00:00').trim();
  if (!date) return '';
  return `${date} ${time}`;
}
function fromLocalInput(v) {
  return parseDisplayDateTime(v);
}
const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#EDEEEA"/><text x="40" y="46" font-size="28" text-anchor="middle" fill="#B7B9B2">?</text></svg>`
);

let currentUser = null;

function rememberMeLoad() {
  const remember = localStorage.getItem('garage-remember-me');
  const username = localStorage.getItem('garage-remember-username');
  if (remember === '1' && username) {
    $('#login-username').value = username;
    $('#remember-me').checked = true;
  }
}

function rememberMeSave(username, checked) {
  if (checked) {
    localStorage.setItem('garage-remember-me', '1');
    localStorage.setItem('garage-remember-username', username);
  } else {
    localStorage.removeItem('garage-remember-me');
    localStorage.removeItem('garage-remember-username');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value.trim();
  const remember = $('#remember-me').checked;

  try {
    const user = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    currentUser = user.user;
    rememberMeSave(username, remember);
    $('#login-screen').classList.remove('active');
    $('#app-shell').classList.remove('hidden');
    $('#login-form').reset();
    initLoggedInApp();
  } catch (err) {
    alert(err.message);
  }
}

function applyBranding(settings) {
  const name = settings?.app_name || 'PY GARAGE MENU';
  const subtitle = settings?.app_subtitle || 'Rental Ops';
  const title = settings?.app_title || 'PY GARAGE MENU';

  document.title = title;
  const brandEls = document.querySelectorAll('.brand-name');
  const subEls = document.querySelectorAll('.brand-sub');
  brandEls.forEach(el => el.textContent = name);
  subEls.forEach(el => el.textContent = subtitle);
}

function initLoggedInApp() {
  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  if (!$('#clock')) return;
  tickClock();
  setInterval(tickClock, 30000);
  loadDashboard();

  api('/settings').then(applyBranding).catch(() => {});
}

function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'dashboard') loadDashboard();
  if (view === 'rentals') loadRentals();
  if (view === 'vehicles') loadVehicles();
  if (view === 'customers') loadCustomers();
  if (view === 'calendar') loadCalendar();
  if (view === 'employees') loadEmployees();
  if (view === 'history') loadHistory();
}

// ---------- Clock ----------
function tickClock() {
  if (!$('#clock')) return;
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  $('#today').textContent = now.toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------- Modal ----------
const backdrop = $('#modal-backdrop');
function openModal(title, bodyHtml) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  backdrop.classList.add('open');
}
function closeModal() { backdrop.classList.remove('open'); }
if ($('#modal-close')) $('#modal-close').addEventListener('click', closeModal);

// ---------- Reusable photo upload widget ----------
// vars: fieldName ('photo_url'), currentUrl, round (bool)
function photoUploadHtml(fieldName, currentUrl, round) {
  const id = `${fieldName}-${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="photo-upload" data-field="${fieldName}">
      <img class="photo-preview ${round ? 'round' : ''}" id="preview-${id}" src="${currentUrl || PLACEHOLDER_IMG}">
      <div>
        <label class="btn small photo-upload-btn">
          เลือกรูป...
          <input type="file" accept="image/*" id="file-${id}">
        </label>
        <input type="hidden" name="${fieldName}" id="hidden-${id}" value="${currentUrl || ''}">
      </div>
    </div>
  `;
}
function bindPhotoUpload(id) {
  const fileInput = $(`#file-${id}`);
  if (!fileInput) return;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const url = await uploadPhoto(file);
      $(`#hidden-${id}`).value = url;
      $(`#preview-${id}`).src = url;
    } catch (err) {
      alert(err.message);
    }
  });
}

// =====================================================
// EMPLOYEES
// =====================================================
async function loadEmployees(q = '') {
  const rows = await api('/employees' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  const grid = $('#employee-grid');
  if (rows.length === 0) {
    grid.innerHTML = `<div style="padding:24px;color:var(--ink-soft)">— ยังไม่มีพนักงานในระบบ —</div>`;
    return;
  }

  grid.innerHTML = rows.map(e => `
    <div class="ccard ${e.is_active === 0 ? 'blacklisted' : ''}">
      <img class="cphoto" src="${e.photo_url || PLACEHOLDER_IMG}">
      <div class="cbody">
        <div class="cname">${e.full_name} ${e.is_active === 0 ? '<span class="tag tag-blacklist">ไม่ใช้งาน</span>' : ''}</div>
        <div class="cphone">${e.position || 'พนักงาน'}${e.department ? ' · ' + e.department : ''}</div>
        <div class="csocial">
          ${e.phone ? `<span>Tel: ${e.phone}</span>` : ''}
          ${e.email ? `<span>Email: ${e.email}</span>` : ''}
          ${e.id_card ? `<span>ID: ${e.id_card}</span>` : ''}
        </div>
        <div class="cactions">
          <button class="btn small" onclick="editEmployee(${e.id})">แก้ไข</button>
          <button class="btn small" onclick="viewEmployeeAccount(${e.id}, '${e.full_name.replace(/'/g, "\\'")}')">Account</button>
          <button class="btn small danger" onclick="deleteEmployee(${e.id})">ลบ</button>
        </div>
      </div>
    </div>
  `).join('');
}

let employeeSearchTimer;
$('#search-employee').addEventListener('input', e => {
  clearTimeout(employeeSearchTimer);
  employeeSearchTimer = setTimeout(() => loadEmployees(e.target.value), 250);
});

function employeeFormHtml(e = {}) {
  return `
    <form id="employee-form" class="form-grid">
      <div class="field full">${photoUploadHtml('photo_url', e.photo_url, true)}</div>
      <div class="field full"><label>ชื่อ-นามสกุล *</label><input name="full_name" required value="${e.full_name || ''}"></div>
      <div class="field"><label>ตำแหน่ง</label><input name="position" value="${e.position || ''}"></div>
      <div class="field"><label>แผนก</label><input name="department" value="${e.department || ''}"></div>
      <div class="field"><label>เบอร์โทร</label><input name="phone" value="${e.phone || ''}"></div>
      <div class="field"><label>อีเมล</label><input name="email" value="${e.email || ''}"></div>
      <div class="field"><label>เลขบัตร/พาสปอร์ต</label><input name="id_card" value="${e.id_card || ''}"></div>
      <div class="field"><label>เลขใบขับขี่</label><input name="license_no" value="${e.license_no || ''}"></div>
      <div class="field"><label>วันเริ่มงาน</label><input type="date" name="start_date" value="${e.start_date || ''}"></div>
      <div class="field"><label>สถานะ</label>
        <select name="is_active">
          <option value="1" ${e.is_active === 1 || e.is_active === '1' ? 'selected' : ''}>ใช้งาน</option>
          <option value="0" ${e.is_active === 0 || e.is_active === '0' ? 'selected' : ''}>ไม่ใช้งาน</option>
        </select>
      </div>
      <div class="field"><label>Facebook</label><input name="facebook" value="${e.facebook || ''}"></div>
      <div class="field"><label>Instagram</label><input name="instagram" value="${e.instagram || ''}"></div>
      <div class="field"><label>TikTok</label><input name="tiktok" value="${e.tiktok || ''}"></div>
      <div class="field full"><label>ที่อยู่</label><textarea name="address">${e.address || ''}</textarea></div>
      <div class="field full"><label>Username</label><input name="account_username" value="${e.account_username || ''}"></div>
      <div class="field"><label>Password</label><input type="password" name="account_password" placeholder="เว้นว่างถ้าไม่เปลี่ยน" value=""></div>
      <div class="field full"><label>หมายเหตุ</label><textarea name="notes">${e.notes || ''}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>
  `;
}

$('#btn-new-employee').addEventListener('click', async () => {
  openModal('เพิ่มพนักงานใหม่', employeeFormHtml());
  bindEmployeeModalExtras(null);
});

window.editEmployee = async (id) => {
  const e = await api(`/employees/${id}`);
  const accountRows = await api('/accounts');
  const account = accountRows.find(a => a.employee_id === id) || {};
  e.account_username = account.username || '';
  e.account_role = account.role || 'staff';
  openModal('แก้ไขข้อมูลพนักงาน', employeeFormHtml(e));
  bindEmployeeModalExtras(id);
};

window.deleteEmployee = async (id) => {
  if (!confirm('ลบพนักงานรายนี้ใช่หรือไม่?')) return;
  await api(`/employees/${id}`, { method: 'DELETE' });
  loadEmployees();
};

window.viewEmployeeAccount = async (id, name) => {
  const accounts = await api('/accounts');
  const account = accounts.find(a => a.employee_id === id);
  const employee = await api(`/employees/${id}`);
  const html = `
    <div class="detail-history">
      <div class="detail-head">
        <img src="${employee.photo_url || PLACEHOLDER_IMG}">
        <div>
          <div class="vname">${employee.full_name}</div>
          <div class="vphone">${employee.position || 'พนักงาน'} · ${employee.department || 'ไม่ระบุแผนก'}</div>
        </div>
      </div>
      <div class="detail-current">
        <h4>ข้อมูล Account</h4>
        <div style="line-height:1.8">
          <strong>Username:</strong> ${account ? account.username : '-'}<br>
          <strong>Role:</strong> ${account ? account.role : '-'}<br>
          <strong>Status:</strong> ${account && account.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน'}
        </div>
      </div>
    </div>
  `;
  openModal(`Account — ${name}`, html);
};

function bindEmployeeModalExtras(id) {
  const photoDiv = $('.photo-upload', $('#modal-body'));
  if (photoDiv) {
    const photoId = photoDiv.querySelector('input[type=file]').id.replace('file-', '');
    bindPhotoUpload(photoId);
  }

  $('#employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));
    formData.is_active = Number(formData.is_active);
    formData.account_role = 'staff';
    formData.account_username = (formData.account_username || '').trim();
    formData.account_password = (formData.account_password || '').trim();
    if (formData.account_username.toLowerCase() === 'admin') {
      throw new Error('บัญชีหลักสามารถเปลี่ยนได้เฉพาะผ่าน DATABASE เท่านั้น');
    }
    try {
      await api(id ? `/employees/${id}` : '/employees', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(formData),
      });
      closeModal();
      loadEmployees();
    } catch (err) {
      alert(err.message);
    }
  });
}

// =====================================================
// DASHBOARD
// =====================================================
async function loadDashboard() {
  const d = await api('/dashboard');
  $('#stat-active').textContent = d.activeRentals;
  $('#stat-overdue').textContent = d.overdueRentals;
  $('#stat-available').textContent = d.availableVehicles;
  $('#stat-vehicles').textContent = d.totalVehicles;
  $('#stat-customers').textContent = d.totalCustomers;
  $('#stat-blacklist').textContent = d.blacklistedCustomers;
  $('#stat-revenue').textContent = fmtMoney(d.monthRevenue);

  const rentals = await api('/rentals?status=active');
  const sendSoon = rentals.filter(r => (new Date(r.start_datetime.replace(' ', 'T')) - new Date()) / 3600000 <= 72 && (new Date(r.start_datetime.replace(' ', 'T')) - new Date()) / 3600000 >= 0)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  const dueSoon = rentals.filter(r => (new Date(r.end_datetime.replace(' ', 'T')) - new Date()) / 3600000 <= 72)
    .sort((a, b) => a.end_datetime.localeCompare(b.end_datetime));

  const sendTbody = $('#table-send-soon tbody');
  if (sendSoon.length === 0) {
    sendTbody.innerHTML = `<tr class="empty-row"><td>— ไม่มีรถที่ต้องส่งภายใน 3 วัน —</td></tr>`;
  } else {
    sendTbody.innerHTML = sendSoon.map(r => `
      <tr>
        <td><strong>${r.customer_name}</strong> · ${r.customer_phone || ''}</td>
        <td><span class="plate">${r.vehicle_plate || '-'}</span> ${r.vehicle_brand} ${r.vehicle_model}</td>
        <td>ส่งมอบ ${fmtDateTime(r.start_datetime)}</td>
        <td><span class="tag tag-active">ต้องส่งเร็วๆ นี้</span></td>
      </tr>
    `).join('');
  }

  const dueTbody = $('#table-due-soon tbody');
  if (dueSoon.length === 0) {
    dueTbody.innerHTML = `<tr class="empty-row"><td>— ไม่มีรถที่ต้องคืนเร็วๆ นี้ —</td></tr>`;
  } else {
    dueTbody.innerHTML = dueSoon.map(r => `
      <tr>
        <td><strong>${r.customer_name}</strong> · ${r.customer_phone || ''}</td>
        <td><span class="plate">${r.vehicle_plate || '-'}</span> ${r.vehicle_brand} ${r.vehicle_model}</td>
        <td>กำหนดคืน ${fmtDateTime(r.end_datetime)}</td>
        <td><span class="tag ${new Date(r.end_datetime.replace(' ', 'T')) < new Date() ? 'tag-overdue' : 'tag-active'}">
          ${new Date(r.end_datetime.replace(' ', 'T')) < new Date() ? 'เกินกำหนด' : 'ใกล้ครบกำหนด'}
        </span></td>
      </tr>
    `).join('');
  }
}

// =====================================================
// CUSTOMERS
// =====================================================
async function loadCustomers(q = '') {
  const rows = await api('/customers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  const grid = $('#customer-grid');
  if (rows.length === 0) {
    grid.innerHTML = `<div style="padding:24px;color:var(--ink-soft)">— ยังไม่มีลูกค้าในระบบ —</div>`;
    return;
  }
  grid.innerHTML = rows.map(c => `
    <div class="ccard ${c.is_blacklisted ? 'blacklisted' : ''}">
      <img class="cphoto" src="${c.photo_url || PLACEHOLDER_IMG}">
      <div class="cbody">
        <div class="cname">${c.full_name} ${c.is_blacklisted ? '<span class="tag tag-blacklist">Blacklist</span>' : ''}</div>
        <div class="cphone">${c.phone || 'ไม่มีเบอร์โทร'} ${c.id_card ? '· ' + c.id_card : ''}</div>
        <div class="csocial">
          ${c.facebook ? `<span>FB: ${c.facebook}</span>` : ''}
          ${c.instagram ? `<span>IG: ${c.instagram}</span>` : ''}
          ${c.tiktok ? `<span>TikTok: ${c.tiktok}</span>` : ''}
        </div>
        <div class="cactions">
          <button class="btn small" onclick="editCustomer(${c.id})">แก้ไข</button>
          <button class="btn small" onclick="viewCustomerHistory(${c.id}, '${c.full_name.replace(/'/g, "\\'")}')">ประวัติเช่า</button>
          <button class="btn small danger" onclick="deleteCustomer(${c.id})">ลบ</button>
        </div>
      </div>
    </div>
  `).join('');
}

let searchTimer;
$('#search-customer').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadCustomers(e.target.value), 250);
});

function customerFormHtml(c = {}) {
  return `
    <form id="customer-form" class="form-grid">
      <div class="field full">
        ${photoUploadHtml('photo_url', c.photo_url, true)}
      </div>
      <div class="field full"><label>ชื่อ-นามสกุล *</label><input name="full_name" required value="${c.full_name || ''}"></div>
      <div class="field"><label>เบอร์โทร</label><input name="phone" value="${c.phone || ''}"></div>
      <div class="field"><label>อีเมล</label><input name="email" value="${c.email || ''}"></div>
      <div class="field"><label>เลขบัตร/พาสปอร์ต</label><input name="id_card" value="${c.id_card || ''}"></div>
      <div class="field"><label>เลขใบขับขี่</label><input name="license_no" value="${c.license_no || ''}"></div>
      <div class="field"><label>Facebook</label><input name="facebook" value="${c.facebook || ''}"></div>
      <div class="field"><label>Instagram</label><input name="instagram" value="${c.instagram || ''}"></div>
      <div class="field"><label>TikTok</label><input name="tiktok" value="${c.tiktok || ''}"></div>
      <div class="field full"><label>ที่อยู่</label><textarea name="address">${c.address || ''}</textarea></div>
      <div class="field full">
        <label><input type="checkbox" name="is_blacklisted" ${c.is_blacklisted ? 'checked' : ''} style="width:auto;margin-right:6px;"> ติด Blacklist จากร้านค้า</label>
      </div>
      <div class="field full"><label>เหตุผล Blacklist (ถ้ามี)</label><textarea name="blacklist_reason">${c.blacklist_reason || ''}</textarea></div>
      <div class="field full"><label>หมายเหตุ</label><textarea name="notes">${c.notes || ''}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>
  `;
}

$('#btn-new-customer').addEventListener('click', () => {
  openModal('เพิ่มลูกค้าใหม่', customerFormHtml());
  bindCustomerModalExtras(null);
});
window.editCustomer = async (id) => {
  const c = await api(`/customers/${id}`);
  openModal('แก้ไขข้อมูลลูกค้า', customerFormHtml(c));
  bindCustomerModalExtras(id);
};
window.deleteCustomer = async (id) => {
  if (!confirm('ลบลูกค้ารายนี้ใช่หรือไม่? (รายการเช่าที่เกี่ยวข้องจะถูกลบด้วย)')) return;
  await api(`/customers/${id}`, { method: 'DELETE' });
  loadCustomers();
};
function bindCustomerModalExtras(id) {
  const photoDiv = $('.photo-upload', $('#modal-body'));
  const photoId = photoDiv.querySelector('input[type=file]').id.replace('file-', '');
  bindPhotoUpload(photoId);

  $('#customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.is_blacklisted = e.target.is_blacklisted.checked;
    await api(id ? `/customers/${id}` : '/customers', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(data),
    });
    closeModal();
    loadCustomers();
  });
}

window.viewCustomerHistory = async (id, name) => {
  const rows = await api(`/customers/${id}/rentals`);
  const html = `
    <div class="detail-history">
      <div class="table-wrap">
        <table>
          <thead><tr><th>รถ</th><th>ส่งมอบ</th><th>กำหนดคืน</th><th>ระยะเวลา</th><th>ราคารวม</th><th>สถานะ</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? `<tr class="empty-row"><td colspan="6">— ยังไม่มีประวัติการเช่า —</td></tr>` : rows.map(r => `
              <tr>
                <td><span class="plate">${r.vehicle_plate || '-'}</span> ${r.vehicle_brand} ${r.vehicle_model}</td>
                <td>${fmtDateTime(r.start_datetime)}</td>
                <td>${fmtDateTime(r.end_datetime)}</td>
                <td><span class="duration-badge">${fmtDuration(r.start_datetime, r.end_datetime)}</span></td>
                <td>฿${fmtMoney(r.total_price)}</td>
                <td><span class="tag tag-${r.status}">${statusLabel(r.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  openModal(`ประวัติการเช่า — ${name}`, html);
};

// =====================================================
// VEHICLES
// =====================================================
async function loadVehicles() {
  const type = $('#filter-vehicle-type').value;
  const status = $('#filter-vehicle-status').value;
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  const rows = await api('/vehicles?' + params.toString());
  const grid = $('#vehicle-grid');
  if (rows.length === 0) {
    grid.innerHTML = `<div style="padding:24px;color:var(--ink-soft)">— ไม่มีรถตรงเงื่อนไข —</div>`;
    return;
  }
  grid.innerHTML = rows.map(v => `
    <div class="vcard">
      <img class="photo-preview" style="width:100%;height:120px;margin-bottom:10px;" src="${v.photo_url || PLACEHOLDER_IMG}">
      <div class="vtype">${v.type === 'bike' ? '🏍 บิ๊กไบค์' : '🚗 รถยนต์'}</div>
      <div class="vname">${v.brand} ${v.model} ${v.year || ''}</div>
      <div class="vplate"><span class="plate">${v.license_plate || 'ไม่มีทะเบียน'}</span></div>
      <span class="tag tag-${v.status}">${statusLabel(v.status)}</span>
      <div class="vrate">฿${fmtMoney(v.daily_rate)} / วัน</div>
      <div class="vactions">
        <button class="btn small" onclick="viewVehicleStatus(${v.id})">ดูรายละเอียด</button>
        <button class="btn small" onclick="editVehicle(${v.id})">แก้ไข</button>
        <button class="btn small danger" onclick="deleteVehicle(${v.id})">ลบ</button>
      </div>
    </div>
  `).join('');
}
$('#filter-vehicle-type').addEventListener('change', loadVehicles);
$('#filter-vehicle-status').addEventListener('change', loadVehicles);

function vehicleFormHtml(v = {}) {
  return `
    <form id="vehicle-form" class="form-grid">
      <div class="field full">${photoUploadHtml('photo_url', v.photo_url, false)}</div>
      <div class="field"><label>ประเภท *</label>
        <select name="type">
          <option value="bike" ${v.type === 'bike' ? 'selected' : ''}>บิ๊กไบค์</option>
          <option value="car" ${v.type === 'car' ? 'selected' : ''}>รถยนต์</option>
        </select>
      </div>
      <div class="field"><label>สถานะ</label>
        <select name="status">
          <option value="available" ${v.status === 'available' ? 'selected' : ''}>ว่าง</option>
          <option value="rented" ${v.status === 'rented' ? 'selected' : ''}>ถูกเช่าอยู่</option>
          <option value="maintenance" ${v.status === 'maintenance' ? 'selected' : ''}>ซ่อมบำรุง</option>
        </select>
      </div>
      <div class="field"><label>ยี่ห้อ</label><input name="brand" value="${v.brand || ''}"></div>
      <div class="field"><label>รุ่น</label><input name="model" value="${v.model || ''}"></div>
      <div class="field"><label>ปี</label><input name="year" type="number" value="${v.year || ''}"></div>
      <div class="field"><label>สี</label><input name="color" value="${v.color || ''}"></div>
      <div class="field"><label>ทะเบียน</label><input name="license_plate" value="${v.license_plate || ''}"></div>
      <div class="field"><label>ราคาเช่า/วัน (บาท)</label><input name="daily_rate" type="number" step="0.01" value="${v.daily_rate || 0}"></div>
      <div class="field"><label>ค่ามัดจำ (บาท)</label><input name="deposit_rate" type="number" step="0.01" value="${v.deposit_rate || 0}"></div>
      <div class="field full"><label>หมายเหตุ</label><textarea name="notes">${v.notes || ''}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>
  `;
}
$('#btn-new-vehicle').addEventListener('click', () => {
  openModal('เพิ่มรถใหม่', vehicleFormHtml());
  bindVehicleModalExtras(null);
});
window.editVehicle = async (id) => {
  const v = await api(`/vehicles/${id}`);
  openModal('แก้ไขข้อมูลรถ', vehicleFormHtml(v));
  bindVehicleModalExtras(id);
};
window.deleteVehicle = async (id) => {
  if (!confirm('ลบรถคันนี้ใช่หรือไม่? (รายการเช่าที่เกี่ยวข้องจะถูกลบด้วย)')) return;
  await api(`/vehicles/${id}`, { method: 'DELETE' });
  loadVehicles();
};
function bindVehicleModalExtras(id) {
  const photoDiv = $('.photo-upload', $('#modal-body'));
  const photoId = photoDiv.querySelector('input[type=file]').id.replace('file-', '');
  bindPhotoUpload(photoId);

  $('#vehicle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await api(id ? `/vehicles/${id}` : '/vehicles', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(data),
    });
    closeModal();
    loadVehicles();
  });
}

window.viewVehicleStatus = async (id) => {
  const { vehicle, currentRental, history } = await api(`/vehicles/${id}/status`);
  const head = `
    <div class="detail-head">
      <img src="${vehicle.photo_url || PLACEHOLDER_IMG}">
      <div>
        <div class="vname">${vehicle.brand} ${vehicle.model} ${vehicle.year || ''}</div>
        <div class="vplate"><span class="plate">${vehicle.license_plate || 'ไม่มีทะเบียน'}</span></div>
        <span class="tag tag-${vehicle.status}">${statusLabel(vehicle.status)}</span>
      </div>
    </div>
  `;
  const currentBlock = currentRental ? `
    <div class="detail-current">
      <h4>ผู้เช่าปัจจุบัน</h4>
      <div class="renter-row">
        <img src="${currentRental.photo_url || PLACEHOLDER_IMG}">
        <div>
          <strong>${currentRental.full_name}</strong> ${currentRental.is_blacklisted ? '<span class="tag tag-blacklist">Blacklist</span>' : ''}<br>
          <span style="color:var(--ink-soft);font-size:12.5px">${currentRental.phone || ''} ${currentRental.id_card ? '· ' + currentRental.id_card : ''}</span>
        </div>
      </div>
      <div style="margin-top:10px;font-size:13.5px;">
        ส่งมอบ: <strong>${fmtDateTime(currentRental.start_datetime)}</strong> &nbsp;→&nbsp;
        กำหนดคืน: <strong>${fmtDateTime(currentRental.end_datetime)}</strong>
      </div>
    </div>
  ` : `<div class="detail-empty">✓ รถคันนี้ว่างอยู่ ไม่มีผู้เช่าในขณะนี้</div>`;

  const historyBlock = `
    <div class="detail-history">
      <h4>ประวัติการเช่าของคันนี้</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ลูกค้า</th><th>ส่งมอบ</th><th>กำหนดคืน</th><th>ระยะเวลา</th><th>สถานะ</th></tr></thead>
          <tbody>
            ${history.length === 0 ? `<tr class="empty-row"><td colspan="5">— ยังไม่มีประวัติ —</td></tr>` : history.map(r => `
              <tr>
                <td>${r.customer_name}</td>
                <td>${fmtDateTime(r.start_datetime)}</td>
                <td>${fmtDateTime(r.end_datetime)}</td>
                <td><span class="duration-badge">${fmtDuration(r.start_datetime, r.end_datetime)}</span></td>
                <td><span class="tag tag-${r.status}">${statusLabel(r.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  openModal('รายละเอียดรถ', head + currentBlock + historyBlock);
};

// =====================================================
// RENTALS
// =====================================================
async function loadRentals() {
  const status = $('#filter-rental-status').value;
  const rows = await api('/rentals' + (status ? `?status=${status}` : ''));
  const tbody = $('#table-rentals tbody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">— ยังไม่มีรายการเช่า —</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.customer_name}</strong> ${r.customer_blacklisted ? '<span class="tag tag-blacklist">BL</span>' : ''}<br><span style="color:var(--ink-soft);font-size:12px">${r.customer_phone || ''}</span></td>
      <td><span class="plate">${r.vehicle_plate || '-'}</span><br><span style="color:var(--ink-soft);font-size:12px">${r.vehicle_brand} ${r.vehicle_model}</span></td>
      <td>${fmtDateTime(r.start_datetime)}</td>
      <td>${fmtDateTime(r.end_datetime)}</td>
      <td>฿${fmtMoney(r.total_price)}</td>
      <td><span class="tag tag-${r.status}">${statusLabel(r.status)}</span></td>
      <td>
        <button class="btn small" onclick="editRental(${r.id})">แก้ไข</button>
        <button class="btn small danger" onclick="deleteRental(${r.id})">ลบ</button>
      </td>
    </tr>
  `).join('');
}
$('#filter-rental-status').addEventListener('change', loadRentals);

async function rentalFormHtml(r = {}) {
  const [customers, vehicles] = await Promise.all([api('/customers'), api('/vehicles')]);
  const selectedCustomer = customers.find(c => c.id === r.customer_id) || customers[0] || null;
  const selectedVehicle = vehicles.find(v => v.id === r.vehicle_id) || vehicles[0] || null;
  const customerSearchValue = selectedCustomer ? `${selectedCustomer.full_name}${selectedCustomer.is_blacklisted ? ' ⚠ BLACKLIST' : ''} (${selectedCustomer.phone || 'ไม่มีเบอร์'})` : '';
  const vehicleSearchValue = selectedVehicle ? `${selectedVehicle.license_plate || ''} — ${selectedVehicle.brand} ${selectedVehicle.model}` : '';
  const custOptions = customers.map(c => `<option value="${c.id}" ${r.customer_id === c.id ? 'selected' : ''}>${c.full_name}${c.is_blacklisted ? ' ⚠ BLACKLIST' : ''} (${c.phone || 'ไม่มีเบอร์'})</option>`).join('');
  const vehOptions = vehicles.map(v => `<option value="${v.id}" ${r.vehicle_id === v.id ? 'selected' : ''}>${v.license_plate || ''} — ${v.brand} ${v.model}</option>`).join('');
  const start = parseDbDateTime(r.start_datetime);
  const end = parseDbDateTime(r.end_datetime);

  return `
    <form id="rental-form" class="form-grid">
      <div class="field full"><label>ลูกค้า *</label>
        <input type="text" class="search-select-input" data-search-for="customer" value="${customerSearchValue}" placeholder="ค้นหาชื่อลูกค้า..." autocomplete="off">
        <select name="customer_id" required>${custOptions || '<option value="">— ยังไม่มีลูกค้า —</option>'}</select>
      </div>
      <div class="field full"><label>รถ *</label>
        <input type="text" class="search-select-input" data-search-for="vehicle" value="${vehicleSearchValue}" placeholder="ค้นหารถ..." autocomplete="off">
        <select name="vehicle_id" required>${vehOptions || '<option value="">— ยังไม่มีรถ —</option>'}</select>
      </div>
      <div class="field"><label>วันที่ส่งมอบรถ *</label><input type="date" name="start_date" required value="${r.start_datetime ? r.start_datetime.slice(0, 10) : ''}" onkeydown="return false" onpaste="return false" inputmode="none"></div>
      <div class="field"><label>เวลาส่งมอบรถ *</label><input type="time" name="start_time" required value="${start.time || '00:00'}" onkeydown="return false" onpaste="return false" inputmode="none"></div>
      <div class="field"><label>วันที่กำหนดคืน *</label><input type="date" name="end_date" required value="${r.end_datetime ? r.end_datetime.slice(0, 10) : ''}" onkeydown="return false" onpaste="return false" inputmode="none"></div>
      <div class="field"><label>เวลาคืนรถ *</label><input type="time" name="end_time" required value="${end.time || '00:00'}" onkeydown="return false" onpaste="return false" inputmode="none"></div>
      <div class="field"><label>สถานะ</label>
        <select name="status">
          <option value="active" ${r.status === 'active' ? 'selected' : ''}>กำลังเช่า</option>
          <option value="returned" ${r.status === 'returned' ? 'selected' : ''}>คืนแล้ว</option>
          <option value="cancelled" ${r.status === 'cancelled' ? 'selected' : ''}>ยกเลิก</option>
        </select>
      </div>
      <div class="field"><label>ราคารวม (บาท)</label><input type="number" step="0.01" name="total_price" value="${r.total_price || 0}"></div>
      <div class="field"><label>จุดรับรถ</label><input name="pickup_location" value="${r.pickup_location || ''}" placeholder="เช่น 13.7563,100.5018 หรือ ชื่อสถานที่"></div>
      <div class="field"><label>จุดคืนรถ</label><input name="return_location" value="${r.return_location || ''}" placeholder="เช่น 13.7563,100.5018 หรือ ชื่อสถานที่"></div>
      <div class="field full compact-notes"><label>หมายเหตุ</label><textarea name="notes">${r.notes || ''}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn ghost" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>
  `;
}
$('#btn-new-rental').addEventListener('click', async () => {
  openModal('สร้างรายการเช่าใหม่', await rentalFormHtml());
  bindRentalForm(null);
  bindRentalSearchInputs();
});
window.editRental = async (id) => {
  const r = await api(`/rentals/${id}`);
  openModal('แก้ไขรายการเช่า (ปรับวันเวลา / ยกเลิกได้)', await rentalFormHtml(r));
  bindRentalForm(id);
  bindRentalSearchInputs();
};
window.deleteRental = async (id) => {
  if (!confirm('ลบรายการเช่านี้ใช่หรือไม่?')) return;
  await api(`/rentals/${id}`, { method: 'DELETE' });
  loadRentals();
};
function bindRentalSearchInputs() {
  const form = $('#rental-form');
  if (!form) return;

  form.querySelectorAll('.search-select-input').forEach(input => {
    const target = input.dataset.searchFor;
    const select = form.querySelector(`select[name="${target === 'customer' ? 'customer_id' : 'vehicle_id'}"]`);
    if (!select) return;

    const options = [...select.options].map(option => ({
      value: option.value,
      label: option.textContent.trim(),
    }));

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      select.innerHTML = '';
      const matched = options.filter(option => option.label.toLowerCase().includes(q));
      if (matched.length === 0) {
        select.innerHTML = '<option value="">— ไม่พบข้อมูล —</option>';
        return;
      }
      select.innerHTML = matched.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
      if (matched.length > 0) {
        select.value = matched[0].value;
      }
    });

    input.addEventListener('focus', () => {
      const q = input.value.trim().toLowerCase();
      const filtered = options.filter(option => option.label.toLowerCase().includes(q) || !q);
      select.innerHTML = filtered.length ? filtered.map(option => `<option value="${option.value}">${option.label}</option>`).join('') : '<option value="">— ไม่พบข้อมูล —</option>';
    });
  });
}

function bindRentalForm(id) {
  $('#rental-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.start_datetime = data.start_date && data.start_time ? `${data.start_date} ${data.start_time}` : '';
    data.end_datetime = data.end_date && data.end_time ? `${data.end_date} ${data.end_time}` : '';
    delete data.start_date; delete data.start_time; delete data.end_date; delete data.end_time;
    await api(id ? `/rentals/${id}` : '/rentals', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(data),
    });
    closeModal();
    loadDashboard();
    loadRentals();
    loadCalendar();
    loadHistory();
  });
}

// =====================================================
// CALENDAR
// =====================================================
async function loadCalendar() {
  const rentals = await api('/rentals');
  const rows = rentals
    .filter(r => r.status !== 'cancelled')
    .sort((a, b) => new Date(a.start_datetime.replace(' ', 'T')) - new Date(b.start_datetime.replace(' ', 'T')));

  const header = $('#calendar-week-header');
  const grid = $('#calendar-month-grid');
  const title = $('#calendar-month-title');
  if (!header || !grid || !title) return;

  const today = new Date();
  const year = today.getFullYear();
  const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  title.textContent = `เดือนนี้: ${monthNames[today.getMonth()]} ${today.getFullYear() + 543}`;
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startWeekDay + lastDay.getDate()) / 7) * 7;

  const weekdayHeaders = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
  header.innerHTML = weekdayHeaders.map(day => `
    <div class="week-day"><span>${day}</span></div>
  `).join('');

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - startWeekDay + 1;
    const cellDate = new Date(year, month, dayNumber);
    const isCurrentMonth = cellDate.getMonth() === month;
    const dayRentals = rows.filter(r => {
      const startDate = new Date(r.start_datetime.replace(' ', 'T'));
      const endDate = new Date(r.end_datetime.replace(' ', 'T'));
      const dateOnlyStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const dateOnlyEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      const target = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      return isCurrentMonth && (dateOnlyStart.getTime() === target.getTime() || dateOnlyEnd.getTime() === target.getTime());
    });

    const pickupEvents = dayRentals.filter(r => {
      const startDate = new Date(r.start_datetime.replace(' ', 'T'));
      return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime() === cellDate.getTime();
    });
    const returnEvents = dayRentals.filter(r => {
      const endDate = new Date(r.end_datetime.replace(' ', 'T'));
      return new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime() === cellDate.getTime();
    });

    const events = [
      ...pickupEvents.map(r => ({ type: 'pickup', ...r })),
      ...returnEvents.map(r => ({ type: 'return', ...r }))
    ];

    cells.push(`
      <div class="day-column ${cellDate.toDateString() === today.toDateString() ? 'today' : ''} ${isCurrentMonth ? '' : 'muted'}">
        <div class="day-number">${cellDate.getDate()}</div>
        ${events.length === 0 ? '<div class="empty-slot">—</div>' : events.map(r => `
          <div class="schedule-card ${r.status === 'returned' ? 'done' : ''}">
            <div class="schedule-card-title">${r.type === 'pickup' ? 'รับรถ' : 'คืนรถ'}</div>
            <div class="schedule-card-meta">${r.customer_name}</div>
            <div class="schedule-card-meta">${r.vehicle_brand} ${r.vehicle_model}</div>
            <div class="schedule-card-meta">เวลา: ${r.type === 'pickup' ? pad2(new Date(r.start_datetime.replace(' ', 'T')).getHours()) + ':' + pad2(new Date(r.start_datetime.replace(' ', 'T')).getMinutes()) : pad2(new Date(r.end_datetime.replace(' ', 'T')).getHours()) + ':' + pad2(new Date(r.end_datetime.replace(' ', 'T')).getMinutes())}</div>
            <div class="schedule-card-actions">
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.type === 'pickup' ? (r.pickup_location || r.customer_name || 'car rental') : (r.return_location || r.customer_name || 'car rental'))}" target="_blank" rel="noopener" class="mini-link">${r.type === 'pickup' ? 'นำทางรับ' : 'นำทางคืน'}</a>
            </div>
          </div>
        `).join('')}
      </div>
    `);
  }

  grid.innerHTML = cells.join('');
}

// =====================================================
// HISTORY
// =====================================================
async function loadHistory() {
  const status = $('#filter-history-status').value;
  const q = $('#search-history').value.trim().toLowerCase();
  let rows = await api('/rentals' + (status ? `?status=${status}` : ''));
  if (q) {
    rows = rows.filter(r =>
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.vehicle_plate || '').toLowerCase().includes(q)
    );
  }
  const tbody = $('#table-history tbody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">— ไม่พบประวัติการเช่า —</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.customer_name}</strong><br><span style="color:var(--ink-soft);font-size:12px">${r.customer_phone || ''}</span></td>
      <td><span class="plate">${r.vehicle_plate || '-'}</span><br><span style="color:var(--ink-soft);font-size:12px">${r.vehicle_brand} ${r.vehicle_model}</span></td>
      <td>${fmtDateTime(r.start_datetime)}</td>
      <td>${fmtDateTime(r.end_datetime)}</td>
      <td><span class="duration-badge">${fmtDuration(r.start_datetime, r.end_datetime)}</span></td>
      <td>฿${fmtMoney(r.total_price)}</td>
      <td><span class="tag tag-${r.status}">${statusLabel(r.status)}</span></td>
    </tr>
  `).join('');
}
$('#filter-history-status').addEventListener('change', loadHistory);
let historySearchTimer;
$('#search-history').addEventListener('input', () => {
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(loadHistory, 250);
});

// ---------- Init ----------
$('#login-form').addEventListener('submit', handleLogin);
rememberMeLoad();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    $('#login-form').addEventListener('submit', handleLogin);
    rememberMeLoad();
  });
}
