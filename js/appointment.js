const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwp3NYz2WONBWBmtZoKT3hizu_hsqPik6_pYdKAfRoTP2NAJLq73tr2whgqGLPrLXSg/exec';
let recognition = null, speechTimeout = null;
const $ = id => document.getElementById(id);

// สลับแท็บหน้าจอ (นัดหมาย / รับซ่อม)
function switchTab(tab) {
  if (tab === 'appointment') {
    $('tabAppointment').style.display = 'block';
    $('tabIntake').style.display = 'none';
    $('tabBtnAppointment').classList.add('active');
    $('tabBtnIntake').classList.remove('active');
  } else if (tab === 'intake') {
    $('tabAppointment').style.display = 'none';
    $('tabIntake').style.display = 'block';
    $('tabBtnAppointment').classList.remove('active');
    $('tabBtnIntake').classList.add('active');
  }
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function dateString(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function phoneFrom(text) {
  const m = text.match(/(?:เบอร์โทร|เบอร์|โทรศัพท์)\s*[:：]?\s*([0-9๐-๙][0-9๐-๙\-\s]{8,}[0-9๐-๙])/i);
  if (!m) return '';
  return m[1].replace(/[๐-๙]/g, d => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d)).replace(/[\s-]/g, '');
}

function timeFrom(text) {
  const direct = text.match(/(?:เวลา\s*)?([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?:\s*น\.?)?/i);
  if (direct) return String(direct[1]).padStart(2, '0') + ':' + direct[2];
  const map = { 'บ่ายโมง': 13, 'บ่ายสอง': 14, 'บ่ายสาม': 15, 'สี่โมงเย็น': 16, 'ห้าโมงเย็น': 17, 'หกโมงเย็น': 18, 'เก้าโมงเช้า': 9, 'สิบโมงเช้า': 10, 'สิบเอ็ดโมงเช้า': 11, 'เที่ยง': 12 };
  for (const key in map) if (text.includes(key)) return String(map[key]).padStart(2, '0') + ':00';
  const h = text.match(/(\d{1,2})\s*โมง/);
  return h ? String(parseInt(h[1], 10) + (text.includes('บ่าย') ? 12 : 0)).padStart(2, '0') + ':00' : '';
}

function toGregorianYear(year) {
  let v = Number(year);
  if (v < 100) v += 2500;
  if (v >= 2400) v -= 543;
  return v;
}

function relativeDays(text) {
  const words = { 'หนึ่ง': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5 };
  const match = text.match(/อีก\s*(\d+|หนึ่ง|สอง|สาม|สี่|ห้า)\s*วัน/i);
  return match ? (words[match[1]] || Number(match[1])) : 0;
}

function normalizeThaiWords(text) {
  let val = String(text || '');
  const words = { 'ศูนย์': '0', 'หนึ่ง': '1', 'สอง': '2', 'สาม': '3', 'สี่': '4', 'ห้า': '5', 'หก': '6', 'เจ็ด': '7', 'แปด': '8', 'เก้า': '9' };
  Object.keys(words).forEach(w => { val = val.split(w).join(words[w]); });
  return val.replace(/[๐-๙]/g, d => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));
}

function parseAppointmentDate(value) {
  let source = normalizeThaiWords(String(value || '').replace(/\s+/g, ' ').trim());
  const now = new Date();

  const days = relativeDays(source);
  if (days) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    return dateString(target);
  }

  if (source.includes('พรุ่งนี้')) {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    return dateString(target);
  }
  if (source.includes('วันนี้')) {
    return dateString(now);
  }

  const speechWithWord = source.match(/วันที่\s*(\d{1,2})\s*(?:เดือน\s*|[\/\-\.])\s*(\d{1,2})(?:\s*(?:ปี\s*)?(\d{2,4}))?/i);
  if (speechWithWord) {
    const d = Number(speechWithWord[1]);
    const m = Number(speechWithWord[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const y = toGregorianYear(speechWithWord[3] || now.getFullYear());
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
  }

  const speechPattern = /(?:^|[^\d])(\d{1,2})\s*(?:เดือน\s*|[\/\-\.])\s*(\d{1,2})(?:\s*(?:ปี\s*)?(\d{2,4}))?/i;
  const speechMatch = source.match(speechPattern);
  if (speechMatch) {
    const d = Number(speechMatch[1]);
    const m = Number(speechMatch[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const y = toGregorianYear(speechMatch[3] || now.getFullYear());
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
  }

  const months = {
    'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6,
    'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12,
    'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
    'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12
  };
  const monthRegex = new RegExp('(?:วันที่\\s*)?(\\d{1,2})\\s*(?:เดือน\\s*)?(' + Object.keys(months).join('|') + ')(?:\\s*(?:ปี\\s*)?(\\d{2,4}))?', 'i');
  const monthMatch = source.match(monthRegex);
  if (monthMatch) {
    const d = Number(monthMatch[1]);
    const m = months[monthMatch[2]];
    if (d >= 1 && d <= 31 && m) {
      const y = toGregorianYear(monthMatch[3] || now.getFullYear());
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
  }

  return '';
}

function fillFromVoice(text) {
  const named = text.match(/((?:คุณ|พี่|ช่าง|น้อง)\s*[^,\s]+?)(?=\s*(?:เบอร์|โทรศัพท์|วันที่|วันพรุ่งนี้|พรุ่งนี้|เวลา|งาน|อาการ|ทำ|ซ่อม|เปลี่ยน|หมายเหตุ|$))/i);
  const fallback = text.match(/(?:ชื่อลูกค้า|ลูกค้า|นัดคุณ|นัด)\s*([^,\n]+?)(?=\s*(?:เบอร์|โทรศัพท์|วันที่|วันพรุ่งนี้|พรุ่งนี้|เวลา|งาน|อาการ|ทำ|ซ่อม|เปลี่ยน|หมายเหตุ|$))/i);
  if (named) $('name').value = named[1].trim();
  else if (fallback) $('name').value = fallback[1].trim();

  const phone = phoneFrom(text), date = parseAppointmentDate(text), time = timeFrom(text);
  if (phone) $('phone').value = phone;
  if (date) $('date').value = date;
  if (time) $('time').value = time;

  const job = text.match(/(?:อาการ|งาน|ทำ|ซ่อม|เปลี่ยน)\s*(.+?)(?=\s*(?:หมายเหตุ|วันที่|เวลา|เบอร์|$))/i);
  if (job) $('job').value = job[1].replace(/^[,\s]+|[,\s]+$/g, '').trim();

  const noteMatch = text.match(/หมายเหตุ\s*(.+?)(?=\s*(?:วันที่|เวลา|เบอร์|$))/i);
  if (noteMatch) $('note').value = noteMatch[1].replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

$('quickInput').addEventListener('input', (e) => {
  const text = e.target.value;
  if (text.trim()) fillFromVoice(text);
});

function setupVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;
  recognition = new Recognition();
  recognition.lang = 'th-TH';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    $('voiceBtn').classList.add('listening');
    $('voiceStatus').textContent = '🔴 กำลังฟัง... พูดได้เลยครับ';
  };
  recognition.onresult = e => {
    clearTimeout(speechTimeout);
    let full = '';
    for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript;
    $('preview').textContent = full;
    fillFromVoice(full);
    speechTimeout = setTimeout(() => { if ($('voiceBtn').classList.contains('listening')) recognition.stop(); }, 2500);
  };
  recognition.onend = () => {
    $('voiceBtn').classList.remove('listening');
    $('voiceStatus').textContent = 'แตะเพื่อพูดบันทึกนัดหมาย (สำหรับคอมพิวเตอร์)';
  };
  $('voiceBtn').onclick = () => {
    if ($('voiceBtn').classList.contains('listening')) recognition.stop();
    else recognition.start();
  };
}

function executeAction(action, rowIndex, extraParam = '') {
  toast('กำลังดำเนินการ...');
  let url = GAS_ENDPOINT + '?action=' + action + '&rowIndex=' + rowIndex + extraParam;
  $('saveTarget').onload = () => {
    toast('ดำเนินการสำเร็จ ✅');
    loadSummary();
  };
  $('saveTarget').src = url;
}

function confirmDelete(rowIndex, name) {
  Swal.fire({
    title: 'ยืนยันการลบนัดหมาย?',
    html: `ต้องการลบรายการนัดหมายของ <strong>"${name}"</strong> ออกจากระบบใช่หรือไม่?`,
    icon: 'warning',
    iconColor: '#ef4444',
    showCancelButton: true,
    confirmButtonText: '🗑️ ใช่, ลบรายการ',
    cancelButtonText: 'ยกเลิก',
    customClass: {
      popup: 'premium-swal',
      title: 'premium-title',
      htmlContainer: 'premium-html',
      confirmButton: 'premium-btn btn-delete-confirm',
      cancelButton: 'premium-btn btn-cancel-flat'
    },
    buttonsStyling: false,
    focusCancel: true
  }).then((result) => {
    if (result.isConfirmed) {
      executeAction('delete', rowIndex);
    }
  });
}

function promptReschedule(rowIndex, name) {
  Swal.fire({
    title: '⏩ เลื่อนวันนัดหมาย',
    html: `
      <div>เลือกจำนวนวันที่ต้องการเลื่อนของ <strong>"${name}"</strong> (คงเวลาเดิม):</div>
      <div class="reschedule-grid">
        <div class="reschedule-card" onclick="Swal.close(); executeAction('reschedule', ${rowIndex}, '&days=1')">
          <div class="days">+1 วัน</div>
          <div class="label">วันถัดไป</div>
        </div>
        <div class="reschedule-card" onclick="Swal.close(); executeAction('reschedule', ${rowIndex}, '&days=2')">
          <div class="days">+2 วัน</div>
          <div class="label">อีก 2 วัน</div>
        </div>
        <div class="reschedule-card" onclick="Swal.close(); executeAction('reschedule', ${rowIndex}, '&days=3')">
          <div class="days">+3 วัน</div>
          <div class="label">อีก 3 วัน</div>
        </div>
      </div>
    `,
    icon: 'info',
    iconColor: '#2563eb',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'ปิดหน้าต่าง',
    customClass: {
      popup: 'premium-swal',
      title: 'premium-title',
      htmlContainer: 'premium-html',
      cancelButton: 'premium-btn btn-cancel-flat'
    },
    buttonsStyling: false
  });
}

function renderAppointments(items, todayKey, tomorrowKey) {
  const list = $('appointmentList');
  const todayItems = (items || []).filter(item => item.date === todayKey);
  const tomorrowItems = (items || []).filter(item => item.date === tomorrowKey);

  function cards(entries) {
    if (!entries.length) return '<div class="appointment-group empty">✅ ยังไม่มีนัดหมาย</div>';
    return entries.map(item => `
      <div class="appointment-item">
        <div class="appointment-main">
          <div class="appointment-time">${item.time}</div>
          <div class="appointment-info">
            <div class="appointment-top">
              <strong class="appointment-name">${item.name}</strong>
              <span class="appointment-phone">📞 ${item.phone}</span>
            </div>
            <div class="appointment-meta">🔧 ${item.job} ${item.note ? '<span class="appointment-note">· ' + item.note + '</span>' : ''}</div>
          </div>
          <a class="btn-act btn-call" href="tel:${item.phone}">📞 โทร</a>
        </div>
        <div class="actions-bar">
          <button class="btn-act btn-finish" onclick="executeAction('updateStatus', ${item.rowIndex}, '&status=เสร็จสิ้น')">✅ เสร็จงาน</button>
          <button class="btn-act btn-reschedule" onclick="promptReschedule(${item.rowIndex}, '${item.name}')">⏩ เลื่อนนัด</button>
          <button class="btn-act btn-del" onclick="confirmDelete(${item.rowIndex}, '${item.name}')">🗑️ ลบ</button>
        </div>
      </div>
    `).join('');
  }

  list.innerHTML = `
    <div class="appointment-group">
      <h3>📅 นัดหมายวันนี้ <span class="appointment-badge">${todayItems.length} งาน</span></h3>
      <div class="appointment-list">${cards(todayItems)}</div>
    </div>
    <div class="appointment-group tomorrow" style="margin-top:16px;">
      <h3>📅 นัดหมายพรุ่งนี้ <span class="appointment-badge">${tomorrowItems.length} งาน</span></h3>
      <div class="appointment-list">${cards(tomorrowItems)}</div>
    </div>
  `;
}

function loadSummary() {
  const callback = 'appointmentSummary_' + Date.now();
  const script = document.createElement('script');
  window[callback] = function(data) {
    renderAppointments(data.appointments, data.date, data.tomorrowDate);
    script.remove();
    delete window[callback];
  };
  script.src = GAS_ENDPOINT + '?action=summary&callback=' + callback;
  document.body.appendChild(script);
}

function save() {
  const data = {
    name: $('name').value.trim(),
    phone: $('phone').value.trim(),
    date: parseAppointmentDate($('date').value),
    time: $('time').value.trim(),
    job: $('job').value.trim(),
    note: $('note').value.trim()
  };

  if (!data.name || !data.date || !data.time) {
    Swal.fire({
      icon: 'warning',
      iconColor: '#f59e0b',
      title: 'ข้อมูลไม่ครบถ้วน',
      text: 'กรุณากรอกชื่อ วันที่ และเวลาให้ครบถ้วนก่อนบันทึก',
      customClass: {
        popup: 'premium-swal',
        title: 'premium-title',
        htmlContainer: 'premium-html',
        confirmButton: 'premium-btn btn-delete-confirm'
      },
      buttonsStyling: false
    });
    return;
  }

  const button = $('saveBtn');
  button.disabled = true;
  button.textContent = 'กำลังบันทึก...';

  const query = new URLSearchParams(data).toString();
  $('saveTarget').onload = () => {
    button.disabled = false;
    button.textContent = '💾 บันทึกนัดหมาย';
    toast('บันทึกเรียบร้อยแล้ว ✅');
    ['name', 'phone', 'date', 'time', 'job', 'note', 'quickInput'].forEach(id => $(id).value = '');
    loadSummary();
  };
  $('saveTarget').src = GAS_ENDPOINT + '?' + query;
}

function updateCurrentDateTime() {
  const now = new Date();
  $('currentDateTime').textContent = '📅 ' + now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }) + ' | 🕒 ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.';
}

$('saveBtn').onclick = save;
setupVoice();
loadSummary();
updateCurrentDateTime();
setInterval(updateCurrentDateTime, 1000);
