/* ============================================================
   Sky Watcher — RainPJ  |  script.js
   ============================================================ */

// ── Config ────────────────────────────────────────────────────
const MQTT_BROKER  = 'wss://broker.hivemq.com:8884/mqtt';
const TOPIC_SENSOR = 'home/rain/sensor';
const TOPIC_CMD    = 'home/rain/command';
const THRESHOLD    = 2000;

// ── State ─────────────────────────────────────────────────────
let mqttClient = null;
let mqttOK     = false;

const state = {
  sensorVal: 3800,
  isRaining: false,
  windows:   { win1: true, win2: true, win3: false },
  laundry:   true,
};

const winRec  = [];
const rainRec = [];

// ── Page Subtitles ────────────────────────────────────────────
const pageSubs = {
  home:   'ระบบเฝ้าตรวจสภาพอากาศ',
  status: 'ควบคุมหน้าต่างและราวผ้า',
  record: 'บันทึกประวัติการทำงาน',
  setup:  'การตั้งค่าระบบ',
};

// ── SVG Icons ─────────────────────────────────────────────────
const SVG_CLOUD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
const SVG_RAIN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="12" y1="21" x2="12" y2="23"/></svg>`;
const SVG_SUN   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;

const SVG_WIN_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="3" width="20" height="18" rx="2"/>
  <line x1="12" y1="3" x2="12" y2="21"/>
  <line x1="2" y1="12" x2="22" y2="12"/>
  <line x1="6" y1="7" x2="8" y2="7"/>
  <line x1="16" y1="7" x2="18" y2="7"/>
</svg>`;

const SVG_WIN_CLOSED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="3" width="20" height="18" rx="2" fill="rgba(107,114,128,0.1)"/>
  <line x1="12" y1="3" x2="12" y2="21"/>
  <line x1="2" y1="12" x2="22" y2="12"/>
  <path d="M11 12v-1.5a1 1 0 0 1 2 0V12"/>
</svg>`;

const SVG_LAUNDRY_OUT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 19h18"/>
  <path d="M12 3v16"/>
  <path d="M8 7 3 19"/>
  <path d="m16 7 5 12"/>
  <path d="M10 3a2 2 0 0 1 4 0"/>
</svg>`;

const SVG_LAUNDRY_IN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
  <line x1="3" y1="6" x2="21" y2="6"/>
  <path d="M16 10a4 4 0 0 1-8 0"/>
</svg>`;

// ── Navigation ────────────────────────────────────────────────
function goPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
  document.getElementById('nav-' + p).classList.add('active');
  document.getElementById('pageSub').textContent = pageSubs[p];
  if (p === 'record') renderRecords();
}

// ── Weather API ───────────────────────────────────────────────
const CITY_COORDS = {
  // ── ภาษาอังกฤษ ──────────────────────────────────────────────
  'Bangkok':           { lat: 13.7563, lon: 100.5018, name: 'กรุงเทพมหานคร' },
  'Chiang Mai':        { lat: 18.7904, lon: 98.9847,  name: 'เชียงใหม่' },
  'Chiang Rai':        { lat: 19.9105, lon: 99.8406,  name: 'เชียงราย' },
  'Phuket':            { lat: 7.8804,  lon: 98.3923,  name: 'ภูเก็ต' },
  'Pattaya':           { lat: 12.9236, lon: 100.8825, name: 'พัทยา' },
  'Khon Kaen':         { lat: 16.4419, lon: 102.8360, name: 'ขอนแก่น' },
  'Nakhon Ratchasima': { lat: 14.9799, lon: 102.0978, name: 'นครราชสีมา' },
  'Hat Yai':           { lat: 7.0086,  lon: 100.4747, name: 'หาดใหญ่' },
  'Udon Thani':        { lat: 17.4138, lon: 102.7871, name: 'อุดรธานี' },
  'Rayong':            { lat: 12.6814, lon: 101.2816, name: 'ระยอง' },
  'Nonthaburi':        { lat: 13.8621, lon: 100.5145, name: 'นนทบุรี' },
  'Pathum Thani':      { lat: 14.0208, lon: 100.5250, name: 'ปทุมธานี' },
  'Samut Prakan':      { lat: 13.5990, lon: 100.5998, name: 'สมุทรปราการ' },
  'Ayutthaya':         { lat: 14.3692, lon: 100.5877, name: 'พระนครศรีอยุธยา' },
  'Kanchanaburi':      { lat: 14.0023, lon: 99.5328,  name: 'กาญจนบุรี' },
  'Nakhon Sawan':      { lat: 15.7030, lon: 100.1371, name: 'นครสวรรค์' },
  'Ubon Ratchathani':  { lat: 15.2448, lon: 104.8473, name: 'อุบลราชธานี' },
  'Nakhon Si Thammarat': { lat: 8.4322, lon: 99.9633, name: 'นครศรีธรรมราช' },
  'Surat Thani':       { lat: 9.1382,  lon: 99.3214,  name: 'สุราษฎร์ธานี' },
  'Songkhla':          { lat: 7.1897,  lon: 100.5955, name: 'สงขลา' },
  // ── ภาษาไทย — กรุงเทพฯ ──────────────────────────────────────
  'กรุงเทพ':           { lat: 13.7563, lon: 100.5018, name: 'กรุงเทพมหานคร' },
  'กรุงเทพมหานคร':     { lat: 13.7563, lon: 100.5018, name: 'กรุงเทพมหานคร' },
  'กทม':               { lat: 13.7563, lon: 100.5018, name: 'กรุงเทพมหานคร' },
  // ── ภาคกลาง ─────────────────────────────────────────────────
  'นนทบุรี':           { lat: 13.8621, lon: 100.5145, name: 'นนทบุรี' },
  'ปทุมธานี':          { lat: 14.0208, lon: 100.5250, name: 'ปทุมธานี' },
  'สมุทรปราการ':       { lat: 13.5990, lon: 100.5998, name: 'สมุทรปราการ' },
  'สมุทรสาคร':         { lat: 13.5475, lon: 100.2748, name: 'สมุทรสาคร' },
  'สมุทรสงคราม':       { lat: 13.4098, lon: 99.9962,  name: 'สมุทรสงคราม' },
  'นครปฐม':            { lat: 13.8199, lon: 100.0623, name: 'นครปฐม' },
  'พระนครศรีอยุธยา':   { lat: 14.3692, lon: 100.5877, name: 'พระนครศรีอยุธยา' },
  'อยุธยา':            { lat: 14.3692, lon: 100.5877, name: 'พระนครศรีอยุธยา' },
  'อ่างทอง':           { lat: 14.5896, lon: 100.4550, name: 'อ่างทอง' },
  'สิงห์บุรี':         { lat: 14.8911, lon: 100.3967, name: 'สิงห์บุรี' },
  'ชัยนาท':            { lat: 15.1851, lon: 100.1253, name: 'ชัยนาท' },
  'ลพบุรี':            { lat: 14.7995, lon: 100.6534, name: 'ลพบุรี' },
  'สระบุรี':           { lat: 14.5289, lon: 100.9108, name: 'สระบุรี' },
  'นครนายก':           { lat: 14.2027, lon: 101.2131, name: 'นครนายก' },
  'ฉะเชิงเทรา':        { lat: 13.6873, lon: 101.0779, name: 'ฉะเชิงเทรา' },
  'ปราจีนบุรี':        { lat: 14.0519, lon: 101.3703, name: 'ปราจีนบุรี' },
  'สระแก้ว':           { lat: 13.8240, lon: 102.0645, name: 'สระแก้ว' },
  'ชลบุรี':            { lat: 13.3611, lon: 100.9847, name: 'ชลบุรี' },
  'พัทยา':             { lat: 12.9236, lon: 100.8825, name: 'พัทยา' },
  'ระยอง':             { lat: 12.6814, lon: 101.2816, name: 'ระยอง' },
  'จันทบุรี':          { lat: 12.6113, lon: 102.1038, name: 'จันทบุรี' },
  'ตราด':              { lat: 12.2427, lon: 102.5153, name: 'ตราด' },
  'เพชรบุรี':          { lat: 13.1119, lon: 99.9390,  name: 'เพชรบุรี' },
  'ประจวบคีรีขันธ์':   { lat: 11.8126, lon: 99.7957,  name: 'ประจวบคีรีขันธ์' },
  'ราชบุรี':           { lat: 13.5282, lon: 99.8134,  name: 'ราชบุรี' },
  'กาญจนบุรี':         { lat: 14.0023, lon: 99.5328,  name: 'กาญจนบุรี' },
  'สุพรรณบุรี':        { lat: 14.4744, lon: 100.1178, name: 'สุพรรณบุรี' },
  // ── ภาคเหนือ ─────────────────────────────────────────────────
  'เชียงใหม่':         { lat: 18.7904, lon: 98.9847,  name: 'เชียงใหม่' },
  'เชียงราย':          { lat: 19.9105, lon: 99.8406,  name: 'เชียงราย' },
  'แม่ฮ่องสอน':        { lat: 19.3020, lon: 97.9654,  name: 'แม่ฮ่องสอน' },
  'ลำปาง':             { lat: 18.2888, lon: 99.4928,  name: 'ลำปาง' },
  'ลำพูน':             { lat: 18.5744, lon: 99.0087,  name: 'ลำพูน' },
  'แพร่':              { lat: 18.1445, lon: 100.1403, name: 'แพร่' },
  'น่าน':              { lat: 18.7756, lon: 100.7730, name: 'น่าน' },
  'พะเยา':             { lat: 19.1664, lon: 99.9017,  name: 'พะเยา' },
  'อุตรดิตถ์':         { lat: 17.6200, lon: 100.0993, name: 'อุตรดิตถ์' },
  'สุโขทัย':           { lat: 17.0070, lon: 99.8231,  name: 'สุโขทัย' },
  'พิษณุโลก':          { lat: 16.8211, lon: 100.2659, name: 'พิษณุโลก' },
  'พิจิตร':            { lat: 16.4426, lon: 100.3490, name: 'พิจิตร' },
  'กำแพงเพชร':         { lat: 16.4827, lon: 99.5226,  name: 'กำแพงเพชร' },
  'ตาก':               { lat: 16.8840, lon: 99.1258,  name: 'ตาก' },
  'นครสวรรค์':         { lat: 15.7030, lon: 100.1371, name: 'นครสวรรค์' },
  'เพชรบูรณ์':         { lat: 16.4190, lon: 101.1591, name: 'เพชรบูรณ์' },
  // ── ภาคตะวันออกเฉียงเหนือ (อีสาน) ───────────────────────────
  'นครราชสีมา':        { lat: 14.9799, lon: 102.0978, name: 'นครราชสีมา' },
  'โคราช':             { lat: 14.9799, lon: 102.0978, name: 'นครราชสีมา' },
  'บุรีรัมย์':         { lat: 14.9930, lon: 103.1029, name: 'บุรีรัมย์' },
  'สุรินทร์':          { lat: 14.8820, lon: 103.4937, name: 'สุรินทร์' },
  'ศรีสะเกษ':          { lat: 15.1186, lon: 104.3220, name: 'ศรีสะเกษ' },
  'อุบลราชธานี':       { lat: 15.2448, lon: 104.8473, name: 'อุบลราชธานี' },
  'อุบล':              { lat: 15.2448, lon: 104.8473, name: 'อุบลราชธานี' },
  'ยโสธร':             { lat: 15.7927, lon: 104.1452, name: 'ยโสธร' },
  'อำนาจเจริญ':        { lat: 15.8656, lon: 104.6257, name: 'อำนาจเจริญ' },
  'มุกดาหาร':          { lat: 16.5436, lon: 104.7237, name: 'มุกดาหาร' },
  'นครพนม':            { lat: 17.3925, lon: 104.7697, name: 'นครพนม' },
  'สกลนคร':            { lat: 17.1664, lon: 104.1486, name: 'สกลนคร' },
  'กาฬสินธุ์':         { lat: 16.4314, lon: 103.5059, name: 'กาฬสินธุ์' },
  'มหาสารคาม':         { lat: 16.0138, lon: 103.1615, name: 'มหาสารคาม' },
  'ร้อยเอ็ด':          { lat: 16.0538, lon: 103.6520, name: 'ร้อยเอ็ด' },
  'ขอนแก่น':           { lat: 16.4419, lon: 102.8360, name: 'ขอนแก่น' },
  'อุดรธานี':          { lat: 17.4138, lon: 102.7871, name: 'อุดรธานี' },
  'อุดร':              { lat: 17.4138, lon: 102.7871, name: 'อุดรธานี' },
  'หนองบัวลำภู':       { lat: 17.2039, lon: 102.4390, name: 'หนองบัวลำภู' },
  'หนองคาย':           { lat: 17.8782, lon: 102.7418, name: 'หนองคาย' },
  'บึงกาฬ':            { lat: 18.3609, lon: 103.6522, name: 'บึงกาฬ' },
  'เลย':               { lat: 17.4860, lon: 101.7223, name: 'เลย' },
  'ชัยภูมิ':           { lat: 15.8068, lon: 102.0317, name: 'ชัยภูมิ' },
  // ── ภาคใต้ ───────────────────────────────────────────────────
  'ภูเก็ต':            { lat: 7.8804,  lon: 98.3923,  name: 'ภูเก็ต' },
  'สุราษฎร์ธานี':      { lat: 9.1382,  lon: 99.3214,  name: 'สุราษฎร์ธานี' },
  'สุราษฎร์':          { lat: 9.1382,  lon: 99.3214,  name: 'สุราษฎร์ธานี' },
  'นครศรีธรรมราช':     { lat: 8.4322,  lon: 99.9633,  name: 'นครศรีธรรมราช' },
  'นครศรี':            { lat: 8.4322,  lon: 99.9633,  name: 'นครศรีธรรมราช' },
  'สงขลา':             { lat: 7.1897,  lon: 100.5955, name: 'สงขลา' },
  'หาดใหญ่':           { lat: 7.0086,  lon: 100.4747, name: 'หาดใหญ่' },
  'ตรัง':              { lat: 7.5593,  lon: 99.6110,  name: 'ตรัง' },
  'พัทลุง':            { lat: 7.6167,  lon: 100.0743, name: 'พัทลุง' },
  'สตูล':              { lat: 6.6238,  lon: 100.0674, name: 'สตูล' },
  'ปัตตานี':           { lat: 6.8694,  lon: 101.2501, name: 'ปัตตานี' },
  'ยะลา':              { lat: 6.5418,  lon: 101.2803, name: 'ยะลา' },
  'นราธิวาส':          { lat: 6.4264,  lon: 101.8253, name: 'นราธิวาส' },
  'กระบี่':            { lat: 8.0863,  lon: 98.9063,  name: 'กระบี่' },
  'พังงา':             { lat: 8.4509,  lon: 98.5255,  name: 'พังงา' },
  'ระนอง':             { lat: 9.9529,  lon: 98.6085,  name: 'ระนอง' },
  'ชุมพร':             { lat: 10.4930, lon: 99.1800,  name: 'ชุมพร' },
};

function findCity(input) {
  if (!input) return CITY_COORDS['Bangkok'];
  const trimmed = input.trim();
  if (CITY_COORDS[trimmed]) return CITY_COORDS[trimmed];
  const lower = trimmed.toLowerCase();
  const key = Object.keys(CITY_COORDS).find(k =>
    k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
  );
  return key ? CITY_COORDS[key] : null;
}

async function fetchWeather(city = 'Bangkok') {
  const c = findCity(city) || CITY_COORDS['Bangkok'];
  try {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${c.lat}&longitude=${c.lon}`
      + `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`
      + `&timezone=Asia%2FBangkok&forecast_days=1`;

    const res = await fetch(url);
    const d   = await res.json();
    const cur = d.current;
    const day = d.daily;

    document.getElementById('wc-temp').textContent      = Math.round(cur.temperature_2m) + '°';
    document.getElementById('wc-hum').textContent       = cur.relative_humidity_2m + '%';
    document.getElementById('wc-wind').textContent      = Math.round(cur.wind_speed_10m);
    document.getElementById('wc-rain-pct').textContent  = (day.precipitation_probability_max[0] || 0) + '%';
    document.getElementById('wc-city').textContent      = c.name;
    document.getElementById('wc-desc').textContent      = wmoDesc(cur.weathercode);
    document.getElementById('mon-temp-max').textContent = Math.round(day.temperature_2m_max[0]);
    document.getElementById('mon-temp-min').textContent = Math.round(day.temperature_2m_min[0]);

    const now = new Date();
    const hh  = now.getHours().toString().padStart(2, '0');
    const mm  = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('wc-time').textContent = `อัปเดต ${hh}:${mm} น.`;

    const rainCodes = [51,53,55,61,63,65,71,73,75,80,81,82,95,96,99];
    const isRainCode = rainCodes.includes(cur.weathercode);
    const isSunny    = [0, 1].includes(cur.weathercode);
    updateWeatherIcon(isRainCode ? 'rain' : isSunny ? 'sun' : 'cloud');

  } catch(e) {
    document.getElementById('wc-city').textContent = 'โหลดไม่ได้';
  }
}

function wmoDesc(code) {
  const m = {
    0:'ท้องฟ้าแจ่มใส', 1:'มีเมฆบางส่วน', 2:'มีเมฆมาก', 3:'มีเมฆครึ้ม',
    45:'หมอก', 48:'หมอกน้ำแข็ง',
    51:'ฝนปรอยเล็กน้อย', 53:'ฝนปรอย', 55:'ฝนปรอยหนัก',
    61:'ฝนเล็กน้อย', 63:'ฝนปานกลาง', 65:'ฝนหนัก',
    80:'ฝนชั่วคราว', 81:'ฝนชั่วคราวปานกลาง', 82:'ฝนชั่วคราวหนัก',
    95:'พายุฝนฟ้าคะนอง', 96:'พายุลูกเห็บ', 99:'พายุลูกเห็บหนัก',
  };
  return m[code] || 'สภาพอากาศแปรปรวน';
}

function updateWeatherIcon(type) {
  document.getElementById('wc-icon').innerHTML =
    type === 'rain' ? SVG_RAIN : type === 'sun' ? SVG_SUN : SVG_CLOUD;
}

// ── MQTT ──────────────────────────────────────────────────────
function connectMQTT() {
  // ตรวจสอบว่า MQTT library โหลดแล้ว
  if (typeof mqtt === 'undefined') {
    setConn('off', 'โหลด Library ไม่สำเร็จ');
    showToast('❌ MQTT library ไม่พร้อม — รีเฟรชหน้าใหม่');
    console.error('MQTT library not loaded');
    return;
  }

  setConn('wait', 'กำลังเชื่อม');
  const cid = 'rainpj_' + Math.random().toString(16).slice(2, 8);

  // ปิด client เก่าถ้ามีอยู่
  if (mqttClient) {
    try { mqttClient.end(true); } catch(e) {}
    mqttClient = null;
  }

  mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId:        cid,
    clean:           true,
    reconnectPeriod: 6000,
    connectTimeout:  15000,
    keepalive:       60,
  });

  mqttClient.on('connect', () => {
    mqttOK = true;
    setConn('on', 'MQTT Online');
    mqttClient.subscribe(TOPIC_SENSOR, { qos: 1 });
    showToast('✅ เชื่อมต่อ MQTT สำเร็จ');
  });
  mqttClient.on('message', (topic, payload) => {
    try { updateFromESP32(JSON.parse(payload.toString())); } catch(e) {}
  });
  mqttClient.on('reconnect', () => { mqttOK = false; setConn('wait', 'กำลังเชื่อมใหม่...'); });
  mqttClient.on('error',     (err) => {
    mqttOK = false;
    setConn('off', 'เชื่อมไม่ได้');
    console.error('MQTT error:', err);
  });
  mqttClient.on('close',     () => { mqttOK = false; setConn('off', 'ตัดการเชื่อมต่อ'); });
  mqttClient.on('offline',   () => { mqttOK = false; setConn('off', 'Offline'); });
}

function setConn(s, txt) {
  const dot = document.getElementById('connDot');
  dot.className = 'conn-dot' + (s === 'on' ? '' : s === 'off' ? ' off' : ' wait');
  document.getElementById('connTxt').textContent = txt;
}

function sendCmd(obj) {
  if (!mqttOK) { showToast('⚠️ ยังไม่ได้เชื่อมต่อ MQTT'); return; }
  mqttClient.publish(TOPIC_CMD, JSON.stringify(obj), { qos: 1 });
}

// ── รับข้อมูลจาก ESP32 ───────────────────────────────────────
function updateFromESP32(d) {
  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

  state.sensorVal = d.sensor_raw ?? state.sensorVal;
  const wasRaining = state.isRaining;
  state.isRaining  = d.is_raining ?? (state.sensorVal < THRESHOLD);
  updateSensorUI(state.sensorVal);

  if (state.isRaining !== wasRaining) {
    addRainRecord(state.isRaining ? 'ตรวจพบฝน' : 'ฝนหยุดตก', ts);
    document.getElementById('warning-box').style.display  = state.isRaining ? 'block' : 'none';
    document.getElementById('mon-rain-sub').textContent   = state.isRaining ? 'ตรวจพบฝน ☔' : 'ไม่มีฝน';

    if (state.isRaining) {
      startRain();
      clearAutoOpenTimer();
      if (document.getElementById('setup-auto').checked) {
        closeAllWindows();
        setLaundryState(false, true);
        showToast('🌧 ฝนตก! ปิดหน้าต่าง+เก็บผ้าแล้ว');
      }
    } else {
      stopRain();
      startAutoOpenCountdown();
    }
  }

  // รับ state แยกทีละบาน (ไม่ปิดทุกบานพร้อมกัน)
  if (d.win1_closed !== undefined) setWindowState('win1', !d.win1_closed, null, false);
  if (d.win2_closed !== undefined) setWindowState('win2', !d.win2_closed, null, false);
  if (d.win3_closed !== undefined) setWindowState('win3', !d.win3_closed, null, false);
  if (d.laundry_in  !== undefined) setLaundryState(!d.laundry_in, false);

  document.getElementById('mon-time').textContent    = ts + ' น.';
  document.getElementById('last-update').textContent = ts + ' น.';
}

// ── Sensor UI ─────────────────────────────────────────────────
function updateSensorUI(val) {
  const pct = Math.max(0, Math.min(100, Math.round((1 - val / 4095) * 100)));
  document.getElementById('sensor-val').textContent  = val;
  document.getElementById('gauge-val').textContent   = val;
  document.getElementById('sensor-fill').style.width = pct + '%';

  const deg = -90 + (pct / 100) * 180;
  document.getElementById('gauge-needle').setAttribute('transform', `rotate(${deg} 100 100)`);

  const sb = document.getElementById('sensor-status');
  if      (pct < 30) { sb.className = 'sensor-status dry';  sb.textContent = 'แห้ง ☀️'; }
  else if (pct < 65) { sb.className = 'sensor-status wet';  sb.textContent = 'ชื้น 💧'; }
  else               { sb.className = 'sensor-status rain'; sb.textContent = 'เปียก 🌧'; }
}

// ── Device Control ────────────────────────────────────────────
function toggleDevice(id) {
  const tog = document.getElementById(id + '-toggle');
  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  if (id === 'laundry') setLaundryState(tog.checked, true);
  else                  setWindowState(id, tog.checked, ts, true);
}

function setWindowState(id, isOpen, ts, sendMqtt) {
  state.windows[id] = isOpen;

  const iw    = document.getElementById(id + '-icon-wrap');
  const badge = document.getElementById(id + '-badge');
  const loc   = document.getElementById(id + '-loc');
  const tog   = document.getElementById(id + '-toggle');

  iw.className      = 'device-icon-wrap ' + (isOpen ? 'open' : 'closed');
  iw.innerHTML      = isOpen ? SVG_WIN_OPEN : SVG_WIN_CLOSED;
  badge.className   = 'device-badge ' + (isOpen ? 'open' : 'closed');
  badge.textContent = isOpen ? 'เปิด' : 'ปิด';
  if (loc) loc.textContent = isOpen ? 'เปิด' : 'ปิด';
  if (tog) tog.checked     = isOpen;
  if (ts)  addWinRecord(id, isOpen, ts);
  if (sendMqtt) sendCmd({ window: isOpen ? 'open' : 'close', target: id });
}

function setLaundryState(isOut, sendMqtt) {
  state.laundry = isOut;

  const iw    = document.getElementById('laundry-icon-wrap');
  const badge = document.getElementById('laundry-badge');
  const tog   = document.getElementById('laundry-toggle');

  iw.className      = 'device-icon-wrap ' + (isOut ? 'out' : 'in');
  iw.innerHTML      = isOut ? SVG_LAUNDRY_OUT : SVG_LAUNDRY_IN;
  badge.className   = 'device-badge ' + (isOut ? 'out' : 'in');
  badge.textContent = isOut ? 'กางออก' : 'เก็บแล้ว';
  if (tog) tog.checked = isOut;
  if (sendMqtt) sendCmd({ laundry: isOut ? 'out' : 'in' });
}

// ── Bulk Actions ──────────────────────────────────────────────
function closeAllWindows() {
  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  ['win1','win2','win3'].forEach(w => setWindowState(w, false, ts, false));
  sendCmd({ window: 'close', target: 'all' });
  showToast('🔒 ปิดหน้าต่างทั้งหมดแล้ว');
}

function openAllWindows() {
  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  ['win1','win2','win3'].forEach(w => setWindowState(w, true, ts, false));
  sendCmd({ window: 'open', target: 'all' });
  showToast('🪟 เปิดหน้าต่างทั้งหมดแล้ว');
}

function collectLaundry() {
  setLaundryState(false, true);
  showToast('🧺 เก็บราวผ้าแล้ว');
}

// ── Records ───────────────────────────────────────────────────
function addWinRecord(win, isOpen, time) {
  const names = { win1: 'หน้าต่าง 1', win2: 'หน้าต่าง 2', win3: 'หน้าต่าง 3' };
  winRec.unshift({ name: names[win], open: isOpen, time });
  if (winRec.length > 30) winRec.pop();
}

function addRainRecord(label, time) {
  rainRec.unshift({ label, time });
  if (rainRec.length > 30) rainRec.pop();
}

function switchRecTab(tab) {
  document.getElementById('rec-tab-win').className  = 'tab-btn' + (tab === 'window' ? ' active' : '');
  document.getElementById('rec-tab-rain').className = 'tab-btn' + (tab === 'rain'   ? ' active' : '');
  document.getElementById('rec-window-content').style.display = tab === 'window' ? 'block' : 'none';
  document.getElementById('rec-rain-content').style.display   = tab === 'rain'   ? 'block' : 'none';
}

function renderRecords() {
  document.getElementById('rec-count').textContent = `บันทึกทั้งหมด ${winRec.length} รายการ`;
  document.getElementById('rec-list').innerHTML = winRec.length === 0
    ? '<div style="text-align:center;padding:30px;color:var(--text4);font-size:14px">ยังไม่มีประวัติ</div>'
    : winRec.map(r => `
        <div class="rec-item">
          <div class="rec-icon ${r.open ? 'open' : 'closed'}">${r.open ? SVG_WIN_OPEN : SVG_WIN_CLOSED}</div>
          <div class="rec-info">
            <div class="rec-name">${r.name}</div>
            <div class="rec-time">${r.time} น.</div>
          </div>
          <div class="rec-badge ${r.open ? 'open' : 'closed'}">${r.open ? 'เปิด' : 'ปิด'}</div>
        </div>`).join('');

  document.getElementById('rec-rain-count').textContent = `บันทึกทั้งหมด ${rainRec.length} รายการ`;
  document.getElementById('rec-rain-list').innerHTML = rainRec.length === 0
    ? '<div style="text-align:center;padding:30px;color:var(--text4);font-size:14px">ยังไม่มีประวัติ</div>'
    : rainRec.map(r => `
        <div class="rec-item">
          <div class="rec-icon event">${SVG_RAIN}</div>
          <div class="rec-info">
            <div class="rec-name">${r.label}</div>
            <div class="rec-time">${r.time} น.</div>
          </div>
        </div>`).join('');
}

// ── Rain Canvas FX ────────────────────────────────────────────
const canvas = document.getElementById('rain-canvas');
const ctx    = canvas.getContext('2d');
let drops = [], rainActive = false, rainRAF = null;

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initDrops() {
  drops = [];
  const count = Math.floor(canvas.width / 3.5);
  for (let i = 0; i < count; i++) {
    drops.push({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      len:   Math.random() * 22 + 10,
      speed: Math.random() * 6 + 8,
      thick: Math.random() * 1.2 + 0.4,
      alpha: Math.random() * 0.4 + 0.2,
    });
  }
}

function drawRain() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drops.forEach(d => {
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - d.len * 0.15, d.y + d.len);
    ctx.strokeStyle = `rgba(170,210,255,${d.alpha})`;
    ctx.lineWidth   = d.thick;
    ctx.lineCap     = 'round';
    ctx.stroke();
    d.y += d.speed;
    d.x -= d.speed * 0.15;
    if (d.y > canvas.height) { d.y = -d.len; d.x = Math.random() * canvas.width; }
  });
  if (rainActive) rainRAF = requestAnimationFrame(drawRain);
}

function startRain() {
  if (rainActive) return;
  rainActive = true;
  initDrops();
  canvas.classList.add('active');
  document.getElementById('rain-overlay').classList.add('active');
  document.getElementById('weatherCard').classList.add('raining');
  drawRain();
}

function stopRain() {
  rainActive = false;
  cancelAnimationFrame(rainRAF);
  canvas.classList.remove('active');
  document.getElementById('rain-overlay').classList.remove('active');
  document.getElementById('weatherCard').classList.remove('raining');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ── Auto Open Countdown ───────────────────────────────────────
const AUTO_DELAY = 120; // วินาที
let cdTimer = null;
let cdSec   = AUTO_DELAY;

function startAutoOpenCountdown() {
  clearAutoOpenTimer();
  cdSec = AUTO_DELAY;
  const badge = document.getElementById('countdown-badge');
  const secEl = document.getElementById('countdown-sec');
  badge.style.display = 'block';
  secEl.textContent   = cdSec;
  cdTimer = setInterval(() => {
    cdSec--;
    secEl.textContent = cdSec;
    if (cdSec <= 0) { clearAutoOpenTimer(); doAutoOpen(); }
  }, 1000);
}

function clearAutoOpenTimer() {
  if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  document.getElementById('countdown-badge').style.display = 'none';
}

function doAutoOpen() {
  clearAutoOpenTimer();
  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  openAllWindows();
  setLaundryState(true, false);
  sendCmd({ laundry: 'out' });
  showToast('☀️ ฝนหยุด 2 นาที — เปิดหน้าต่าง+ราวผ้าแล้ว');
  addRainRecord('เปิดหน้าต่าง+ราวผ้าอัตโนมัติ', ts);
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Init ──────────────────────────────────────────────────────
['win1','win2','win3'].forEach(w => {
  const iw  = document.getElementById(w + '-icon-wrap');
  const tog = document.getElementById(w + '-toggle');
  iw.innerHTML = tog.checked ? SVG_WIN_OPEN : SVG_WIN_CLOSED;
});
document.getElementById('laundry-icon-wrap').innerHTML = SVG_LAUNDRY_OUT;

setInterval(() => {
  const now = new Date();
  document.getElementById('mon-time').textContent =
    now.getHours().toString().padStart(2,'0') + ':' +
    now.getMinutes().toString().padStart(2,'0') + ' น.';
}, 30000);

updateSensorUI(3800);

// รอให้ MQTT library โหลดก่อนเชื่อม
window.addEventListener('load', () => {
  connectMQTT();
  fetchWeather('Bangkok');
});

setInterval(() => fetchWeather(document.getElementById('setup-city').value || 'Bangkok'), 10 * 60 * 1000);
