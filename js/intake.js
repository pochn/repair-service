// ========================================
// REPAIR JOB INTAKE CONTROLLER (FOR GITHUB)
// ========================================

let selectedChannel = 'หน้าร้าน';
let selectedAccessories = new Set();
let serialCopyTimer = null;
let jobRecognition = null;
let jobSpeechTimeout = null;

function normalizeSerialNumber(value) {
  return String(value || '').replace(/\s+/g, '');
}

function copySerialNumber() {
  const input = $('jobSN');
  const value = normalizeSerialNumber(input.value);
  if (!value) return;

  input.value = value;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value).catch(() => {});
    return;
  }

  const fallback = document.createElement('textarea');
  fallback.value = value;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'fixed';
  fallback.style.opacity = '0';
  document.body.appendChild(fallback);
  fallback.select();
  try { document.execCommand('copy'); } catch (_) {}
  fallback.remove();
}

function scheduleSerialNumberCopy() {
  clearTimeout(serialCopyTimer);
  serialCopyTimer = setTimeout(copySerialNumber, 800);
}

function setJobType(type) {
  selectedChannel = type;
  $('btnTypeShop').classList.toggle('active', type === 'หน้าร้าน');
  $('btnTypeOnline').classList.toggle('active', type === 'ออนไลน์');
}

function toggleTag(el, tag) {
  if (selectedAccessories.has(tag)) {
    selectedAccessories.delete(tag);
    el.classList.remove('active');
  } else {
    selectedAccessories.add(tag);
    el.classList.add('active');
  }
  $('jobAccessories').value = Array.from(selectedAccessories).join(', ');
}

function openDellSupport() {
  const sn = $('jobSN').value.trim();
  const url = sn ? 'https://www.dell.com/support/home/th-th/product-support/servicetag/' + sn + '/overview' : 'https://www.dell.com/support/home/th-th';
  window.open(url, '_blank');
}

function resetJobForm() {
  if ($('voiceJobBtn') && $('voiceJobBtn').classList.contains('listening')) {
    if (jobRecognition) jobRecognition.stop();
  }
  ['jobCustomerName', 'jobCustomerPhone', 'jobModel', 'jobSN', 'jobIssue', 'jobRepairPoint', 'jobNote', 'jobPrice', 'quickJobInput'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('jobPreview')) $('jobPreview').textContent = '';
  if ($('voiceJobStatus')) $('voiceJobStatus').textContent = 'แตะไมค์เพื่อพูดเปิด Job (สำหรับคอมพิวเตอร์ / เบราว์เซอร์)';

  $('jobBrand').value = '';
  $('jobShipping').value = '-';
  // กำหนดสถานะเป็น 'รอซ่อม' เป็นค่าเริ่มต้นเสมอ
  $('jobStatus').value = 'รอซ่อม';

  selectedAccessories.clear();
  document.querySelectorAll('.accessory-tags .tag-btn').forEach(btn => btn.classList.remove('active'));
  $('jobAccessories').value = '';
  setJobType('หน้าร้าน');
  if ($('scanStatus')) $('scanStatus').textContent = 'แตะเพื่อถ่ายรูปสด/เลือกรูปจากคลังภาพ หรือลากไฟล์มาวางที่นี่ (PC)';
}

// ----------------------------------------------------
// ระบบวิเคราะห์เสียงพูดแล้วหยอดค่าลงฟอร์มอัตโนมัติ
// ----------------------------------------------------
function parseJobVoice(text) {
  if (!text) return;
  const clean = normalizeThaiWords(text);

  // 1. ดึงชื่อลูกค้า (คำนำหน้า คุณ/พี่/ช่าง/น้อง หรือ ลูกค้าชื่อ...)
  const named = clean.match(/((?:คุณ|พี่|ช่าง|น้อง)\s*[ก-๙a-zA-Z]+)/i);
  const fallbackName = clean.match(/(?:ชื่อลูกค้า|ลูกค้า)\s*([ก-๙a-zA-Z]+)/i);
  if (named) {
    $('jobCustomerName').value = named[1].trim();
  } else if (fallbackName) {
    $('jobCustomerName').value = fallbackName[1].trim();
  }

  // 2. เบอร์โทรศัพท์ (ฟังก์ชัน phoneFrom จาก appointment.js)
  const phone = phoneFrom(clean);
  if (phone) {
    $('jobCustomerPhone').value = phone;
  }

  // 3. ยี่ห้อเครื่อง (Brand)
  const brands = [
    { key: 'acer', name: 'Acer' },
    { key: 'asus', name: 'Asus' },
    { key: 'dell', name: 'Dell' },
    { key: 'lenovo', name: 'Lenovo' },
    { key: 'hp', name: 'HP' },
    { key: 'apple', name: 'Apple' },
    { key: 'macbook', name: 'Apple' },
    { key: 'msi', name: 'MSI' },
    { key: 'huawei', name: 'Huawei' },
    { key: 'samsung', name: 'Samsung' }
  ];
  for (const b of brands) {
    if (new RegExp(b.key, 'i').test(clean)) {
      $('jobBrand').value = b.name;
      break;
    }
  }

  // 4. อุปกรณ์เสริม (ตรวจจับคำว่า สายชาร์จ, กระเป๋า, เมาส์/Mouse)
  const accMap = [
    { words: ['สายชาร์จ', 'อะแดปเตอร์', 'adapter'], tag: 'สายชาร์จ' },
    { words: ['กระเป๋า', 'ซอง'], tag: 'กระเป๋า' },
    { words: ['เมาส์', 'mouse'], tag: 'Mouse' }
  ];

  accMap.forEach(item => {
    const hasWord = item.words.some(w => new RegExp(w, 'i').test(clean));
    if (hasWord) {
      selectedAccessories.add(item.tag);
    }
  });

  // อัปเดตสถานะปุ่ม Tag อุปกรณ์เสริมบนหน้าเว็บ
  document.querySelectorAll('.accessory-tags .tag-btn').forEach(btn => {
    selectedAccessories.forEach(tag => {
      if (btn.textContent.includes(tag)) btn.classList.add('active');
    });
  });
  $('jobAccessories').value = Array.from(selectedAccessories).join(', ');

  // 5. ราคาประเมิน / ราคาเสนอซ่อม
  const priceMatch = clean.match(/(?:ราคา|เสนอราคา|ค่าซ่อม|ยอด|ประมาณ|คิด)\s*([\d,]+)(?:\s*บาท)?/i);
  if (priceMatch) {
    $('jobPrice').value = priceMatch[1].replace(/,/g, '').trim();
  }

  // 6. อาการเสีย (ดึงข้อความหลังคำว่า อาการ/เปิดไม่ติด/เสีย/จอแตก ฯลฯ)
  const issueMatch = clean.match(/(?:อาการ|เป็นอะไร|เสีย|ปัญหา|งาน)\s*([^,\n]+?)(?=\s*(?:อุปกรณ์|มี|สายชาร์จ|กระเป๋า|ราคา|เสนอราคา|เบอร์|โทร|หมายเหตุ|$))/i);
  if (issueMatch) {
    $('jobIssue').value = issueMatch[1].trim();
  }

  // 7. หมายเหตุ
  const noteMatch = clean.match(/หมายเหตุ\s*(.+)$/i);
  if (noteMatch) {
    $('jobNote').value = noteMatch[1].replace(/^[,\s]+|[,\s]+$/g, '').trim();
  }

  // กำหนดสถานะงานเป็น "รอซ่อม" อัตโนมัติเสมอ
  $('jobStatus').value = 'รอซ่อม';
}

// ----------------------------------------------------
// ติดตั้งตัวรับเสียง Web Speech API ให้กับแท็บที่ 2
// ----------------------------------------------------
// ========================================
// REPAIR JOB INTAKE - VOICE CONTROLLER
// ========================================

// กำหนด $ กรณีที่ appointment.js ยังไม่ได้ประกาศ
if (typeof window.$ === 'undefined') {
  window.$ = id => document.getElementById(id);
}

function setupJobVoice() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('voiceJobBtn');
  const status = document.getElementById('voiceJobStatus');
  const preview = document.getElementById('jobPreview');

  if (!btn || !status) return;

  if (!SpeechRec) {
    status.textContent = '❌ เบราว์เซอร์นี้ไม่รองรับการฟังเสียง (แนะนำให้ใช้ Google Chrome)';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    return;
  }

  try {
    jobRecognition = new SpeechRec();
    jobRecognition.lang = 'th-TH';
    jobRecognition.continuous = true;
    jobRecognition.interimResults = true;

    jobRecognition.onstart = () => {
      btn.classList.add('listening');
      status.textContent = '🔴 กำลังฟัง... พูดชื่อ อาการ ยี่ห้อ ราคา ได้เลยครับ';
    };

    jobRecognition.onresult = (e) => {
      clearTimeout(jobSpeechTimeout);
      let full = '';
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript;
      }

      if (preview) preview.textContent = full;
      const quickInput = document.getElementById('quickJobInput');
      if (quickInput) quickInput.value = full;

      // ส่งข้อความไปแกะข้อมูลลงฟอร์ม
      parseJobVoice(full);

      // เมื่อหยุดพูดเกิน 2.5 วินาที ให้ตัดจังหวะหยุดไมค์อัตโนมัติ
      jobSpeechTimeout = setTimeout(() => {
        if (btn.classList.contains('listening') && jobRecognition) {
          jobRecognition.stop();
        }
      }, 2500);
    };

    jobRecognition.onerror = (e) => {
      btn.classList.remove('listening');
      if (e.error === 'not-allowed') {
        status.textContent = '⚠️ เบราว์เซอร์ถูกบล็อกไมโครโฟน (กรุณากดอนุญาตสิทธิ์ไมค์)';
        alert('กรุณากดอนุญาตให้เว็บไซต์ใช้งานไมโครโฟนที่แถบ URL ด้านบน');
      } else if (e.error === 'no-speech') {
        status.textContent = 'แตะไมค์เพื่อพูดเปิด Job (ยังไม่ได้ยินเสียงพูด)';
      } else {
        status.textContent = '❌ เกิดข้อผิดพลาด: ' + e.error;
      }
    };

    jobRecognition.onend = () => {
      btn.classList.remove('listening');
      status.textContent = 'แตะไมค์เพื่อพูดเปิด Job (สำหรับคอมพิวเตอร์ / เบราว์เซอร์)';
      if (typeof toast === 'function') {
        toast('หยอดข้อมูลจากเสียงเรียบร้อย ✅');
      }
    };

    btn.onclick = (event) => {
      event.preventDefault();
      if (!jobRecognition) return;

      if (btn.classList.contains('listening')) {
        jobRecognition.stop();
      } else {
        try {
          jobRecognition.start();
        } catch (err) {
          // ป้องกันข้อผิดพลาดกรณีสั่ง start ซ้อน
          jobRecognition.stop();
          setTimeout(() => jobRecognition.start(), 200);
        }
      }
    };

  } catch (err) {
    status.textContent = '❌ ไม่สามารถเริ่มระบบเสียงได้: ' + err.message;
  }
}

// ผูกให้ฟังก์ชันทำงานเมื่อหน้าเว็บพร้อม และเมื่อสลับมาที่แท็บเปิด Job
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupJobVoice);
} else {
  setupJobVoice();
}

// Event listener เมื่อพิมพ์หรือพูดผ่านไมค์คีย์บอร์ดมือถือ
if ($('quickJobInput')) {
  $('quickJobInput').addEventListener('input', (e) => {
    if (e.target.value.trim()) parseJobVoice(e.target.value);
  });
}

// เรียกให้ระบบไมค์ทำงานเมื่อโหลดหน้า
setupJobVoice();

if ($('quickJobInput')) {
  $('quickJobInput').addEventListener('input', (e) => {
    if (e.target.value.trim()) parseJobVoice(e.target.value);
  });
}

if ($('jobSN')) {
  $('jobSN').addEventListener('input', (e) => {
    const normalized = normalizeSerialNumber(e.target.value);
    if (e.target.value !== normalized) e.target.value = normalized;

    scheduleSerialNumberCopy();
  });
  $('jobSN').addEventListener('change', copySerialNumber);
  $('jobSN').addEventListener('blur', copySerialNumber);
}

// รองรับการลากไฟล์ (Drag & Drop) มาวางบนกล่องสแกนสติกเกอร์
const dropZoneSticker = $('dropZoneSticker');
if (dropZoneSticker) {
  ['dragenter', 'dragover'].forEach(evt => {
    dropZoneSticker.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneSticker.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZoneSticker.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneSticker.classList.remove('dragover');
    });
  });

  dropZoneSticker.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleStickerImage(file);
  });
}

// สแกนสติกเกอร์ใต้เครื่องด้วย Gemini Vision ผ่าน fetch
// รับได้ทั้ง change event (จาก input file) หรือไฟล์โดยตรง (จาก drag & drop)
function handleStickerImage(eventOrFile) {
  const file = eventOrFile instanceof File ? eventOrFile : eventOrFile.target.files[0];
  if (!file) return;

  const btn = $('btnScanSticker');
  const status = $('scanStatus');
  btn.disabled = true;
  btn.style.opacity = '0.6';
  status.innerHTML = '⏳ กำลังเตรียมรูปภาพ...';

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const base64Data = canvas.toDataURL('image/jpeg', 0.8);
      status.innerHTML = '🤖 Gemini กำลังอ่านข้อมูลสติกเกอร์...';

      fetch(GAS_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: JSON.stringify({ action: 'scanSticker', image: base64Data })
      })
      .then(() => {
        // เนื่องจากเป็น no-cors ขอส่งผ่าน JSONP callback
        scanViaJsonp(base64Data);
      })
      .catch(err => {
        btn.disabled = false;
        btn.style.opacity = '1';
        status.innerHTML = '❌ การเชื่อมต่อผิดพลาด: ' + err.message;
      });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ทางเลือกสำรองในการส่งภาพและรับผลลัพธ์ผ่าน JSONP
function scanViaJsonp(base64Data) {
  const btn = $('btnScanSticker');
  const status = $('scanStatus');
  const callback = 'geminiScan_' + Date.now();
  
  window[callback] = function(res) {
    btn.disabled = false;
    btn.style.opacity = '1';
    delete window[callback];

    if (res.status === 'success') {
      const d = res.data;
      if (d.brand) {
        const brandSelect = $('jobBrand');
        let matched = false;
        for (let i = 0; i < brandSelect.options.length; i++) {
          if (brandSelect.options[i].value.toLowerCase() === d.brand.toLowerCase()) {
            brandSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) brandSelect.value = 'อื่นๆ';
      }
      if (d.model) $('jobModel').value = d.model;
      if (d.sn) $('jobSN').value = d.sn;

      status.innerHTML = '✅ อ่านข้อมูลและหยอดลงช่องสำเร็จ!';
      toast('AI สแกนข้อมูลสำเร็จ ✅');
    } else {
      status.innerHTML = '⚠️ ' + res.message;
      toast(res.message);
    }
  };

  fetch(GAS_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ action: 'scanSticker', image: base64Data, callback: callback })
  })
  .then(res => res.json())
  .then(data => window[callback](data))
  .catch(err => {
    btn.disabled = false;
    btn.style.opacity = '1';
    status.innerHTML = '❌ เกิดข้อผิดพลาดในการรับข้อมูล';
  });
}

// ส่งบันทึก Job ไปยัง Apps Script ผ่าน JSONP
function submitRepairJob() {
  const data = {
    action: "createJob",
    channel: selectedChannel,
    status: $('jobStatus').value,
    name: $('jobCustomerName').value.trim(),
    phone: $('jobCustomerPhone').value.trim(),
    shipping: $('jobShipping').value,
    brand: $('jobBrand').value,
    model: $('jobModel').value.trim(),
    sn: $('jobSN').value.trim(),
    issue: $('jobIssue').value.trim(),
    repairPoint: $('jobRepairPoint').value.trim(),
    accessories: $('jobAccessories').value.trim(),
    price: $('jobPrice').value.trim(),
    note: $('jobNote').value.trim()
  };

  if (!data.name || !data.issue) {
    Swal.fire({
      icon: 'warning',
      iconColor: '#f59e0b',
      title: 'ข้อมูลไม่ครบถ้วน',
      text: 'กรุณาระบุชื่อลูกค้าและอาการเสียก่อนบันทึก',
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

  const btn = $('btnSaveJob');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังบันทึก...';

  const callback = 'jobCreated_' + Date.now();
  const script = document.createElement('script');

  window[callback] = function(res) {
    btn.disabled = false;
    btn.textContent = '💾 บันทึก';
    script.remove();
    delete window[callback];

    if (res.status === 'success') {
      Swal.fire({
        icon: 'success',
        iconColor: '#10b981',
        title: 'เปิด Job สำเร็จ!',
        html: `รหัสงานซ่อม: <strong style="color:#2563eb; font-size:22px;">${res.jobCode}</strong><br>บันทึกลงระบบงานซ่อมเรียบร้อยแล้ว`,
        customClass: {
          popup: 'premium-swal',
          title: 'premium-title',
          htmlContainer: 'premium-html',
          confirmButton: 'premium-btn btn-d1'
        },
        buttonsStyling: false
      });
      resetJobForm();
    } else {
      toast('เกิดข้อผิดพลาด: ' + (res.message || 'ไม่สามารถบันทึกได้'));
    }
  };

  const query = new URLSearchParams(data).toString();
  script.src = GAS_ENDPOINT + '?' + query + '&callback=' + callback;
  document.body.appendChild(script);
}