// ========================================
// REPAIR JOB INTAKE CONTROLLER (FOR GITHUB)
// ========================================

let selectedChannel = 'หน้าร้าน';
let selectedAccessories = new Set();

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
  ['jobCustomerName', 'jobCustomerPhone', 'jobModel', 'jobSN', 'jobIssue', 'jobRepairPoint', 'jobNote', 'jobPrice', 'quickJobInput'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  $('jobBrand').value = '';
  $('jobShipping').value = '-';
  $('jobStatus').value = 'รอซ่อม';
  selectedAccessories.clear();
  document.querySelectorAll('.accessory-tags .tag-btn').forEach(btn => btn.classList.remove('active'));
  $('jobAccessories').value = '';
  setJobType('หน้าร้าน');
  if ($('scanStatus')) $('scanStatus').textContent = 'รองรับทั้งถ่ายรูปสด และเลือกรูปจากอัลบั้ม';
}

function parseJobVoice(text) {
  const clean = normalizeThaiWords(text);

  // 1. ชื่อ
  const named = clean.match(/((?:คุณ|พี่|ช่าง|น้อง)\s*[^,\s]+?)(?=\s*(?:เบอร์|โทรศัพท์|อาการ|งาน|รุ่น|ยี่ห้อ|อุปกรณ์|มี|ราคา|เสนอราคา|หมายเหตุ|$))/i);
  const fallbackName = clean.match(/(?:ชื่อลูกค้า|ลูกค้า)\s*([^,\n]+?)(?=\s*(?:เบอร์|โทรศัพท์|อาการ|งาน|รุ่น|ยี่ห้อ|อุปกรณ์|มี|ราคา|เสนอราคา|หมายเหตุ|$))/i);
  if (named) $('jobCustomerName').value = named[1].trim();
  else if (fallbackName) $('jobCustomerName').value = fallbackName[1].trim();

  // 2. เบอร์โทร
  const phone = phoneFrom(clean);
  if (phone) $('jobCustomerPhone').value = phone;

  // 3. ยี่ห้อ
  const brands = ['Acer', 'Asus', 'Dell', 'Lenovo', 'HP', 'Apple', 'MSI', 'Huawei', 'Samsung'];
  for (const b of brands) {
    if (new RegExp(b, 'i').test(clean)) {
      $('jobBrand').value = b;
      break;
    }
  }

  // 4. อาการเสีย
  const issueMatch = clean.match(/(?:อาการ|เป็นอะไร|เสีย|ปัญหา)\s*([^,\n]+?)(?=\s*(?:อุปกรณ์|มี|สายชาร์จ|กระเป๋า|ราคา|เสนอราคา|เบอร์|หมายเหตุ|$))/i);
  if (issueMatch) $('jobIssue').value = issueMatch[1].trim();

  // 5. อุปกรณ์เสริม
  const accWords = ['สายชาร์จ', 'กระเป๋า', 'Mouse', 'เมาส์'];
  accWords.forEach(w => {
    if (new RegExp(w, 'i').test(clean)) {
      const actualTag = (w === 'เมาส์') ? 'Mouse' : w;
      selectedAccessories.add(actualTag);
      document.querySelectorAll('.accessory-tags .tag-btn').forEach(btn => {
        if (btn.textContent.includes(actualTag)) btn.classList.add('active');
      });
    }
  });
  $('jobAccessories').value = Array.from(selectedAccessories).join(', ');

  // 6. ราคาเสนอซ่อม (ไม่ตัดที่คอมมา)
  const priceMatch = clean.match(/(?:ราคา|เสนอราคา|ประเมิน|ค่าซ่อม)\s*([\d,]+)(?:\s*บาท)?/i);
  if (priceMatch) $('jobPrice').value = priceMatch[1].replace(/,/g, '').trim();

  // 7. หมายเหตุ
  const noteMatch = clean.match(/หมายเหตุ\s*(.+)$/i);
  if (noteMatch) $('jobNote').value = noteMatch[1].replace(/^[,\s]+|[,\s]+$/g, '').trim();
}

if ($('quickJobInput')) {
  $('quickJobInput').addEventListener('input', (e) => {
    if (e.target.value.trim()) parseJobVoice(e.target.value);
  });
}

// สแกนสติกเกอร์ใต้เครื่องด้วย Gemini Vision ผ่าน fetch
function handleStickerImage(event) {
  const file = event.target.files[0];
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