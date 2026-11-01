let probeRecognition = null;
let probeListeningRequested = false;
let probeRestartTimer = null;
let probeAudioContext = null;

function probeDefaultUnit() {
  const mode = $('probeMode').value;
  return mode === 'Ω' ? 'Ω' : 'V';
}

function prepareThaiVoiceText(raw) {
  let text = String(raw || '').trim().replace(/จุด/g, '.');
  const units = {
    'หนึ่ง': 1, 'เอ็ด': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4,
    'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9
  };
  const thaiNumbers = {
    'ศูนย์': ' 0 ', 'หนึ่ง': ' 1 ', 'เอ็ด': ' 1 ', 'สอง': ' 2 ',
    'สาม': ' 3 ', 'สี่': ' 4 ', 'ห้า': ' 5 ', 'หก': ' 6 ',
    'เจ็ด': ' 7 ', 'แปด': ' 8 ', 'เก้า': ' 9 ', 'สิบ': ' 10 ',
    'ยี่สิบ': ' 20 '
  };

  const spokenDigit = '(หนึ่ง|เอ็ด|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)';
  text = text.replace(new RegExp(`ยี่สิบ${spokenDigit}`, 'g'), (_, digit) =>
    ` ${20 + units[digit]} `
  );
  text = text.replace(new RegExp(`สิบ${spokenDigit}`, 'g'), (_, digit) =>
    ` ${10 + units[digit]} `
  );
  Object.keys(thaiNumbers)
    .sort((left, right) => right.length - left.length)
    .forEach(word => { text = text.split(word).join(thaiNumbers[word]); });

  return text
    .replace(/[๐-๙]/g, digit => ` ${'๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)} `)
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePinVoice(transcript, defaultUnit = 'V') {
  const text = prepareThaiVoiceText(transcript);
  const maxPins = document.querySelectorAll('#icGridContainer input').length || 100;
  const mainMatch = text.match(/(?:ขา|พิน|pin)\s*(\d+)(.*)/i);
  if (!mainMatch) return null;

  let pin = Number.parseInt(mainMatch[1], 10);
  let remainder = (mainMatch[2] || '').trim();
  if (pin > maxPins && mainMatch[1].length >= 2) {
    const digits = mainMatch[1];
    const splitPin = Number.parseInt(digits.slice(0, -1), 10);
    if (splitPin <= maxPins) {
      pin = splitPin;
      remainder = digits.slice(-1) + remainder;
    }
  }

  if (/\b(?:gnd|ground)\b|กราวด์|ช็อต|ชอต|ชอร์ต|ลัดวงจร/i.test(remainder)) {
    const groundUnit = defaultUnit === 'Ω' ? 'Ω' : 'V';
    return { pin, value: `0${groundUnit} (GND)` };
  }

  const measurement = remainder.match(/^\s*(?:(?:ได้|คือ|วัดได้|เท่ากับ)\s*)?(?:=\s*)?(\d+(?:\s*\.\s*\d+)?|\.\s*\d+)\s*(มิลลิโวลต์|มิลลิโวล|mv|เมกะโอห์ม|เมกโอห์ม|เมก|megaohm|megohm|meg|m(?:ohm|Ω)?|กิโลโอห์ม|กิโลโอม|กิโล|เคโอห์ม|เคโอม|เค|k(?:ohm|Ω)?|โอห์ม|โอม|ohms?|โวลต์|โวล|v)?/i);
  if (!measurement) return null;

  const rawValue = measurement[1].replace(/\s+/g, '');
  const rawUnit = measurement[2] || '';
  let unit = defaultUnit === 'Ω' ? 'Ω' : 'V';
  if (/^(?:มิลลิโวลต์|มิลลิโวล|mv)$/i.test(rawUnit)) unit = 'mV';
  else if (/^(?:เมกะโอห์ม|เมกโอห์ม|เมก|megaohm|megohm|meg|m(?:ohm|Ω)?)$/i.test(rawUnit)) unit = 'MΩ';
  else if (/^(?:กิโลโอห์ม|กิโลโอม|กิโล|เคโอห์ม|เคโอม|เค|k(?:ohm|Ω)?)$/i.test(rawUnit)) unit = 'kΩ';
  else if (/^(?:โอห์ม|โอม|ohms?)$/i.test(rawUnit)) unit = 'Ω';
  else if (/^(?:โวลต์|โวล|v)$/i.test(rawUnit)) unit = 'V';

  const diodeSuffix = $('probeMode').value === 'Diode' && !rawUnit ? ' (Diode)' : '';
  return { pin, value: `${rawValue}${unit}${diodeSuffix}` };
}

function processSpokenText(fullText) {
  if (!fullText) return;

  const clean = prepareThaiVoiceText(fullText);
  const segments = clean.split(/(?=(?:ขา|พิน|pin)\s*\d+)/i);
  const defaultUnit = probeDefaultUnit();
  let updatedCount = 0;
  let changedCount = 0;
  let missingPins = 0;

  segments.forEach(segment => {
    if (!/(?:ขา|พิน|pin)\s*\d+/i.test(segment)) return;
    const parsed = parsePinVoice(segment, defaultUnit);
    if (!parsed) return;

    const target = $(`pin_val_${parsed.pin}`);
    if (!target) {
      missingPins += 1;
      return;
    }

    updatedCount += 1;
    if (target.value === parsed.value) return;

    target.value = parsed.value;
    const card = target.closest('.pin-cell');
    card.classList.add('updated');
    clearTimeout(target.highlightTimer);
    target.highlightTimer = setTimeout(() => card.classList.remove('updated'), 1200);
    changedCount += 1;
  });

  if (updatedCount > 0) {
    const message = `บันทึกค่าแล้ว ${updatedCount} ขา`;
    $('probeVoiceStatus').textContent = missingPins
      ? `${message} · ไม่พบช่องอีก ${missingPins} ขา`
      : message;
    if (changedCount > 0) playBeepConfirm();
  } else if (missingPins > 0) {
    $('probeVoiceStatus').textContent = `ไม่พบช่องสำหรับ ${missingPins} ขาที่พูด`;
  } else if (/(?:ขา|พิน|pin)\s*\d+/i.test(clean)) {
    $('probeVoiceStatus').textContent = 'ได้ยินหมายเลขขา แต่ยังจับคู่ค่าที่วัดไม่ได้';
  }
}

function generatePinGrid(totalPins) {
  const count = Number(totalPins);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    toast('จำนวนขาต้องอยู่ระหว่าง 1 ถึง 100 ขา');
    return false;
  }

  const previousValues = new Map(
    Array.from($('icGridContainer').querySelectorAll('input'), input => [
      Number(input.dataset.pin),
      input.value
    ])
  );
  const container = $('icGridContainer');
  container.replaceChildren();

  for (let pin = 1; pin <= count; pin += 1) {
    const card = document.createElement('label');
    card.className = 'pin-cell';
    card.htmlFor = `pin_val_${pin}`;

    const label = document.createElement('span');
    label.className = 'pin-no';
    label.textContent = `Pin ${pin}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `pin_val_${pin}`;
    input.dataset.pin = String(pin);
    input.placeholder = '-';
    input.setAttribute('aria-label', `ค่าที่วัดได้ขา ${pin}`);
    input.value = previousValues.get(pin) || '';

    card.append(label, input);
    container.appendChild(card);
  }
  return true;
}

function setProbeListening(isListening) {
  const button = $('voiceProbeBtn');
  button.classList.toggle('listening', isListening);
  button.setAttribute('aria-pressed', String(isListening));
}

function stopProbeVoice() {
  if (!probeListeningRequested) return;
  probeListeningRequested = false;
  clearTimeout(probeRestartTimer);
  setProbeListening(false);
  if (probeRecognition) {
    try {
      probeRecognition.stop();
    } catch (error) {
      if (error.name !== 'InvalidStateError') {
        $('probeVoiceStatus').textContent = `ปิดไมค์ไม่สำเร็จ: ${error.message || error.name}`;
        return;
      }
    }
  }
  if ($('probeVoiceStatus')) $('probeVoiceStatus').textContent = 'ปิดไมค์แล้ว';
}

function startProbeRecognition() {
  if (!probeRecognition || !probeListeningRequested) return;
  try {
    probeRecognition.start();
  } catch (error) {
    if (error.name !== 'InvalidStateError') {
      probeListeningRequested = false;
      setProbeListening(false);
      $('probeVoiceStatus').textContent = `เริ่มไมค์ไม่สำเร็จ: ${error.message || error.name}`;
    }
  }
}

function playBeepConfirm() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    $('probeVoiceStatus').textContent = 'บันทึกค่าแล้ว แต่เบราว์เซอร์ไม่รองรับเสียงยืนยัน';
    return;
  }

  try {
    if (!probeAudioContext) probeAudioContext = new AudioContextClass();
    const context = probeAudioContext;
    const play = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.1, context.currentTime);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    };

    if (context.state === 'suspended') {
      context.resume().then(play).catch(error => {
        $('probeVoiceStatus').textContent = `เล่นเสียงยืนยันไม่สำเร็จ: ${error.message}`;
      });
    } else {
      play();
    }
  } catch (error) {
    $('probeVoiceStatus').textContent = `เล่นเสียงยืนยันไม่สำเร็จ: ${error.message || error.name}`;
  }
}

function handleProbeResult(result) {
  const transcript = String(result.transcript || '').trim();
  if (!transcript) return;
  $('probePreview').textContent = `ได้ยิน: ${transcript}`;
  const quickInput = $('quickProbeInput');
  quickInput.value = quickInput.value.trim()
    ? `${quickInput.value.trim()} ${transcript}`
    : transcript;
  quickInput.scrollTop = quickInput.scrollHeight;
  processSpokenText(transcript);
}

function clearProbeBox() {
  $('quickProbeInput').value = '';
  $('probePreview').textContent = '';
  $('probeVoiceStatus').textContent = 'ล้างข้อความที่ได้ยินแล้ว';
}

function setupProbeVoice() {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = $('voiceProbeBtn');
  if (!SpeechRecognitionClass) {
    button.disabled = true;
    $('probeVoiceStatus').textContent = 'เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge';
    return;
  }

  probeRecognition = new SpeechRecognitionClass();
  probeRecognition.lang = 'th-TH';
  probeRecognition.continuous = true;
  probeRecognition.interimResults = false;
  probeRecognition.onresult = event => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (event.results[index].isFinal) {
        handleProbeResult(event.results[index][0]);
      }
    }
  };
  probeRecognition.onerror = event => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    $('probeVoiceStatus').textContent = `ไมค์ขัดข้อง: ${event.error}`;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
      probeListeningRequested = false;
      setProbeListening(false);
    }
  };
  probeRecognition.onend = () => {
    if (!probeListeningRequested) return;
    probeRestartTimer = setTimeout(startProbeRecognition, 250);
  };

  button.addEventListener('click', () => {
    if (probeListeningRequested) {
      stopProbeVoice();
      return;
    }

    probeListeningRequested = true;
    setProbeListening(true);
    $('probeVoiceStatus').textContent = '🔴 กำลังฟังต่อเนื่อง พูดระบุหมายเลขขาและค่าที่วัดได้';
    if (window.AudioContext || window.webkitAudioContext) {
      try {
        if (!probeAudioContext) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          probeAudioContext = new AudioContextClass();
        }
        if (probeAudioContext.state === 'suspended') {
          probeAudioContext.resume().catch(error => {
            $('probeVoiceStatus').textContent = `เปิดเสียงยืนยันไม่สำเร็จ: ${error.message || error.name}`;
          });
        }
      } catch (error) {
        $('probeVoiceStatus').textContent = `เปิดเสียงยืนยันไม่สำเร็จ: ${error.message || error.name}`;
      }
    }
    startProbeRecognition();
  });
}

async function copyPinSummary() {
  const summary = getPinSummary();
  if (!summary) {
    toast('ยังไม่มีค่าที่บันทึกไว้');
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(summary);
    } else {
      const fallback = document.createElement('textarea');
      fallback.value = summary;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      if (!copied) throw new Error('เบราว์เซอร์ไม่อนุญาตให้คัดลอก');
    }
    toast('คัดลอกสรุปผลแล้ว ✅');
  } catch (error) {
    toast(`คัดลอกไม่สำเร็จ: ${error.message}`);
  }
}

function getPinSummary() {
  return Array.from($('icGridContainer').querySelectorAll('input'))
    .filter(input => input.value.trim())
    .map(input => `P${input.dataset.pin}: ${input.value.trim()}`)
    .join(' | ');
}

function savePinText() {
  const summary = getPinSummary();
  if (!summary) {
    toast('ยังไม่มีค่าที่บันทึกไว้');
    return;
  }

  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const content = `สรุปผลการวัดขาไอซี\nวันที่: ${now.toLocaleString('th-TH')}\nโหมด: ${$('probeMode').selectedOptions[0].textContent.trim()}\n\n${summary}\n`;
  const blob = new Blob(['\uFEFF', content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ic-pin-measurements_${timestamp}.txt`;
  document.body.appendChild(link);
  try {
    link.click();
    toast('บันทึกไฟล์ TXT แล้ว ✅');
  } catch (error) {
    toast(`บันทึกไฟล์ไม่สำเร็จ: ${error.message}`);
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function initializeProbeTab() {
  generatePinGrid($('pinCountSelect').value);
  $('quickProbeInput').addEventListener('input', event => {
    processSpokenText(event.target.value);
  });
  $('clearProbeBoxBtn').addEventListener('click', clearProbeBox);
  $('pinCountSelect').addEventListener('change', event => {
    const custom = event.target.value === 'custom';
    $('customPinCountPanel').hidden = !custom;
    if (!custom) generatePinGrid(event.target.value);
  });
  $('applyCustomPinCount').addEventListener('click', () => {
    const count = $('customPinCount').valueAsNumber;
    if (!generatePinGrid(count)) return;
    $('customPinCountPanel').hidden = true;
  });
  $('clearPinData').addEventListener('click', () => {
    $('icGridContainer').querySelectorAll('input').forEach(input => {
      input.value = '';
      input.closest('.pin-cell').classList.remove('updated');
    });
    clearProbeBox();
    toast('ล้างค่าที่บันทึกทั้งหมดแล้ว');
  });
  $('copyPinSummary').addEventListener('click', copyPinSummary);
  $('savePinText').addEventListener('click', savePinText);
  setupProbeVoice();
}

initializeProbeTab();
