import { api } from '/api.js';
import { emptyData, loadData as loadFromApi, loadGuardian, saveData as syncData } from '/sync.js';

// ---------- Default seed structure ----------
const defaultData = emptyData;

// ---------- Bangladesh district/upazila data (loaded from CDN at runtime) ----------
let bdDivisions = []; // [{id, name, bn_name}]
let bdDistricts = []; // [{id, division_id, name, bn_name}]
let bdUpazilas = [];  // [{id, district_id, name}]
async function loadBdGeo(){
  try{
    const divRes = await fetch('https://cdn.jsdelivr.net/gh/nuhil/bangladesh-geocode@master/divisions/divisions.json');
    const divJson = await divRes.json();
    bdDivisions = divJson[2].data;
  }catch(e){ console.error('division load failed', e); }
  try{
    const distRes = await fetch('https://cdn.jsdelivr.net/gh/nuhil/bangladesh-geocode@master/districts/districts.json');
    const distJson = await distRes.json();
    bdDistricts = distJson[2].data;
  }catch(e){ console.error('district load failed', e); }
  try{
    const upzRes = await fetch('https://cdn.jsdelivr.net/gh/nuhil/bangladesh-geocode@master/upazilas/upazilas.json');
    const upzJson = await upzRes.json();
    bdUpazilas = upzJson[2].data;
  }catch(e){ console.error('upazila load failed', e); }
}
function populateDivisionSelect(selectEl, selectedId){
  selectEl.innerHTML = '<option value="">— বাছাই করুন —</option>' +
    bdDivisions.map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${d.bn_name || d.name}</option>`).join('');
}
function populateDistrictSelect(selectEl, divisionId, selectedId){
  if(!divisionId){ selectEl.innerHTML = '<option value="">— আগে বিভাগ বাছাই করুন —</option>'; selectEl.disabled=true; return; }
  const list = bdDistricts.filter(d=>d.division_id===divisionId);
  selectEl.innerHTML = '<option value="">— বাছাই করুন —</option>' +
    list.map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${d.bn_name || d.name}</option>`).join('');
  selectEl.disabled = false;
}
function populateThanaSelect(selectEl, districtId, selectedId){
  if(!districtId){ selectEl.innerHTML = '<option value="">— আগে জেলা বাছাই করুন —</option>'; selectEl.disabled=true; return; }
  const list = bdUpazilas.filter(u=>u.district_id===districtId);
  selectEl.innerHTML = '<option value="">— বাছাই করুন —</option>' +
    list.map(u=>`<option value="${u.id}" ${u.id===selectedId?'selected':''}>${u.bn_name || u.name}</option>`).join('');
  selectEl.disabled = false;
}

let data = defaultData();
let state = { jamaatId:null };
const todayISO = () => new Date().toISOString().split('T')[0];
const isFriday = (dateStr) => new Date(dateStr + 'T00:00:00').getDay() === 5;
// Returns the matching holiday object {id,start,end,name} for a given date, or null if none.
function getHoliday(dateStr){
  const list = data.holidays || [];
  return list.find(h => dateStr >= h.start && dateStr <= (h.end || h.start)) || null;
}
const BN_DIGITS = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
const toBn = (n) => String(n).replace(/[0-9]/g, d => BN_DIGITS[d]);
const todayBn = () => new Date().toLocaleDateString('bn-BD', {weekday:'long', day:'numeric', month:'long'});

async function loadData(){
  try{
    // সেশন-টোকেন থাকলে (পেজ রিলোড) আগে যাচাই; অভিভাবক সেশন রিলোডে বাতিল
    if(api.isLoggedIn){
      if(api.role==='guardian') api.logout();
      else { try{ await api.me(); }catch(e){ api.logout(); } }
    }
    data = await loadFromApi();
  }catch(e){
    console.error('load error', e);
    alert('ডেটা লোড করতে সমস্যা হয়েছে।\n\nকারণ: ' + (e?.message || e) + '\n\nইন্টারনেট সংযোগ চেক করুন, তারপর পেজ রিফ্রেশ করুন।');
  }
  document.getElementById('loadingScreen').classList.add('hide');
  refreshAfterLoad();
  loadBdGeo(); // load in background, doesn't block UI
  if (location.pathname.replace(/\/+$/, '') === '/admin') setTimeout(() => sbGo('admin'), 300); // /admin ঠিকানা খুললে সরাসরি অ্যাডমিন লগইন
}
function refreshAfterLoad(){
  populateBranchSelect();
  renderHomeSummary();
  renderNoticeBoard();
  checkAdminUnlock();
  renderAdminAdmissionBadge();
}
// লগইন/লগআউটের পর নতুন ভূমিকার জন্য ডেটা আবার আনা
async function reloadData(){
  data = await loadFromApi();
  refreshAfterLoad();
}
window.reloadData = reloadData;
async function saveData(){
  try{
    await syncData(data);
  }
  catch(e){
    console.error('save error', e);
    alert('সেভ করতে সমস্যা হয়েছে।\n\nকারণ: ' + (e?.message || e) + '\n\nইন্টারনেট সংযোগ চেক করুন। পরিবর্তন মেমরিতে আছে; পেজ রিফ্রেশ না করে আবার চেষ্টা করুন।');
  }
}

const isAdminUnlocked = () => api.role === 'admin';

window.unlockAdmin = async function(){
  const mobile = prompt('অ্যাডমিনের মোবাইল নম্বর দিন:');
  if(mobile === null) return;
  const pass = prompt('অ্যাডমিন পাসওয়ার্ড দিন:');
  if(pass === null) return;
  try{
    await api.login('admin', mobile, pass);
    await reloadData();
    document.getElementById('adminLockedBox').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    renderAdminAdmissionBadge();
    updateSidebarStaffVisibility();
  } catch(e){
    alert(e.status===401 ? 'মোবাইল বা পাসওয়ার্ড ভুল হয়েছে।' : 'লগইন করা যায়নি: ' + e.message);
  }
}
window.adminLogout = async function(){
  api.logout();
  await reloadData();
  document.getElementById('adminPanel').style.display = 'none';
  goHome();
}

window.checkAdminUnlock = function(){
  if(isAdminUnlocked()){
    document.getElementById('adminLockedBox').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
  }
  updateSidebarStaffVisibility();
}

function updateSidebarStaffVisibility(){
  const isAdmin = isAdminUnlocked();
  document.querySelectorAll('.sb-staff-only').forEach(el=>{
    el.style.display = isAdmin ? 'block' : 'none';
  });
}

function renderAdminAdmissionBadge(){
  const pending = (data.admissions || []).filter(a => (a.status || 'pending') === 'pending').length;
  document.querySelectorAll('.admin-admission-badge').forEach(el => {
    if(pending > 0){
      el.style.display = 'inline-block';
      el.textContent = toBn(pending);
    } else {
      el.style.display = 'none';
      el.textContent = '';
    }
  });
}

window.renderAdmissionsReview = function(){
  const container = document.getElementById('admissionsReviewList');
  if(!container) return;
  const list = (data.admissions || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.id||'').localeCompare(a.id||''));
  if(list.length === 0){
    container.innerHTML = '<div class="empty"><div class="big">📭</div>এখনো কোনো ভর্তির আবেদন আসেনি।</div>';
    renderAdminAdmissionBadge();
    return;
  }
  const statusLabel = { pending:'⏳ পর্যালোচনাধীন', approved:'✅ গৃহীত', rejected:'❌ বাতিল' };
  const statusColor = { pending:'background:var(--gold-light); color:#8a6a10;', approved:'background:#dff3e6; color:var(--green-deep);', rejected:'background:#fbe1de; color:var(--red);' };
  container.innerHTML = list.map(a => {
    const jamaat = data.jamaats.find(j => j.id === a.jamaatId);
    const status = a.status || 'pending';
    return `
      <div class="admission-review-item">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="font-weight:700; font-size:15px;">${escapeHtml(a.name||'')}</div>
            <div style="font-size:12.5px; color:var(--muted); margin-top:2px;">রোল প্রার্থী • ${escapeHtml(jamaat?.name || '')}</div>
          </div>
          <span class="admission-status-pill" style="${statusColor[status]}">${statusLabel[status]}</span>
        </div>
        <div style="font-size:13px; margin-top:8px; line-height:1.7;">
          <div>👨 পিতা: ${escapeHtml(a.fatherName||'-')}</div>
          <div>👩 মাতা: ${escapeHtml(a.motherName||'-')}</div>
          <div>📱 মোবাইল: ${escapeHtml(a.phone||'-')}</div>
          <div>🕓 আবেদনের তারিখ: ${a.date||'-'}</div>
        </div>
        ${status==='pending' ? `
        <div class="editbar" style="margin-top:10px;">
          <button onclick="approveAdmission('${a.id}')" style="background:var(--green); color:white; border-color:var(--green);">✅ গ্রহণ করুন</button>
          <button onclick="rejectAdmission('${a.id}')" style="background:var(--red); color:white; border-color:var(--red);">❌ বাতিল করুন</button>
        </div>` : ''}
      </div>
    `;
  }).join('');
  renderAdminAdmissionBadge();
}

window.approveAdmission = async function(id){
  const a = (data.admissions || []).find(x => x.id === id);
  if(!a) return;
  a.status = 'approved';
  await saveData();
  renderAdmissionsReview();
}

window.rejectAdmission = async function(id){
  const a = (data.admissions || []).find(x => x.id === id);
  if(!a) return;
  a.status = 'rejected';
  await saveData();
  renderAdmissionsReview();
}

window.showScreen = function(id, title, sub, backVisible){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('headerTitle').textContent = title;
  document.getElementById('headerSub').textContent = sub;
  document.getElementById('backBtn').classList.toggle('show', backVisible);
}
window.goBack = function(){
  const reportActive = document.getElementById('screen-report').classList.contains('active');
  const examActive = document.getElementById('screen-exam').classList.contains('active');
  const classActive = document.getElementById('screen-class').classList.contains('active');
  const guardianSubIds = ['screen-board-results','screen-competition-results','screen-madrasa-results','screen-guardian-search'];
  const guardianSubActive = guardianSubIds.some(id=>document.getElementById(id)?.classList.contains('active'));
  if((reportActive || examActive) ){
    const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
    showScreen('screen-class', jamaat.name, `${jamaat.teacher || ''}`, true);
    renderStudentList();
    return;
  }
  if(classActive && fromTeacherDash){
    fromTeacherDash = false;
    openTeacherDash();
    return;
  }
  if(guardianSubActive){
    showScreen('screen-guardian-menu','অভিভাবক লগইন','যে তথ্য দেখতে চান বাছাই করুন', true);
    return;
  }
  goHome();
}
window.openSidebar = function(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
  updateSidebarStaffVisibility();
  const badge = document.getElementById('adminAdmissionBadgePanel');
  const sbBadge = document.getElementById('sbAdmissionBadge');
  if(badge && sbBadge){
    if(badge.style.display!=='none' && badge.textContent.trim()!==''){
      sbBadge.textContent = badge.textContent; sbBadge.style.display='inline-block';
    } else { sbBadge.style.display='none'; }
  }
}
window.closeSidebar = function(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
window.sbGo = function(key){
  closeSidebar();
  const needsClass = ()=>{
    if(!state.jamaatId){
      goHome();
      setTimeout(()=>alert('আগে হোম স্ক্রিন থেকে একটি জামাত/ক্লাস বাছাই করুন।'), 200);
      return true;
    }
    return false;
  };
  switch(key){
    case 'home': goHome(); break;
    case 'notice': goHome(); setTimeout(()=>openModal('manageNotice'), 150); break;
    case 'holiday': goHome(); setTimeout(()=>openModal('manageHoliday'), 150); break;
    case 'attendance': if(!needsClass()) openReport(); break;
    case 'exam': if(!needsClass()) openExamScreen(); break;
    case 'boardresult': showScreen('screen-board-results','বোর্ড পরীক্ষার সাফল্য','বছর অনুযায়ী সাফল্য', true); renderBoardResults(); break;
    case 'competition': showScreen('screen-competition-results','বিভিন্ন প্রতিযোগিতার সাফল্য','প্রতিযোগিতায় অর্জিত সাফল্য', true); renderCompetitionResults(); break;
    case 'fees': if(!needsClass()) openFeeScreen(); break;
    case 'accounting':
      showScreen('screen-accounting','হিসাব','আয়-ব্যয় সারসংক্ষেপ', true);
      document.getElementById('acc_month').value = new Date().toISOString().slice(0,7);
      renderAccountingScreen();
      break;
    case 'admission': showScreen('screen-admission','ভর্তি ফরম','নতুন ছাত্র ভর্তি', true); renderAdmissionForm(); break;
    case 'admissionreview': showScreen('screen-admissions-review','ভর্তির আবেদনসমূহ','অভিভাবকদের পাঠানো নতুন আবেদন', true); renderAdmissionsReview(); break;
    case 'teacher': showScreen('screen-teacher-auth','শিক্ষক লগইন','আপনার অ্যাকাউন্ট দিয়ে প্রবেশ করুন', true); renderTeacherAuth(); break;
    case 'guardian': showScreen('screen-guardian-menu','অভিভাবক লগইন','যে তথ্য দেখতে চান বাছাই করুন', true); break;
    case 'diary': showScreen('screen-daily-diary','ডেইলি ডায়েরি','ছাত্রের দৈনন্দিন কার্যক্রম', true); break;
    case 'routine': showScreen('screen-class-routine','ক্লাস রুটিন','সাপ্তাহিক ক্লাস রুটিন', true); break;
    case 'examschedule': showScreen('screen-exam-schedule','পরীক্ষার সময়সূচি','আসন্ন পরীক্ষার সময়সূচি', true); break;
    case 'academiccalendar': showScreen('screen-academic-calendar','একাডেমিক ক্যালেন্ডার','শিক্ষাবর্ষের গুরুত্বপূর্ণ তারিখ', true); break;
    case 'teacherobs': showScreen('screen-teacher-observation','শিক্ষকের পর্যবেক্ষণ','শিক্ষকের মন্তব্য ও পর্যবেক্ষণ', true); break;
    case 'guardiancomment': showScreen('screen-guardian-comment','অভিভাবকের মন্তব্য','অভিভাবকের মতামত ও মন্তব্য', true); break;
    case 'admin': goHome(); setTimeout(()=>unlockAdmin(), 150); break;
    case 'noticeview': goHome(); break;
    case 'examview': showScreen('screen-madrasa-results','মাদ্রাসার ফলাফল','জামাতভিত্তিক পূর্ণ ফলাফল', true); renderMadrasaResultFilters(); break;
    case 'diaryview': showScreen('screen-daily-diary','ডেইলি ডায়েরি','ছাত্রের দৈনন্দিন কার্যক্রম', true); break;
    case 'teacherobsview': showScreen('screen-teacher-observation','শিক্ষকের পর্যবেক্ষণ','শিক্ষকের মন্তব্য ও পর্যবেক্ষণ', true); break;
  }
}

window.goHome = function(){
  state = { jamaatId:null };
  showScreen('screen-home','শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা','হাজিরা ব্যবস্থাপনা', false);
  checkAdminUnlock();
  document.getElementById('sel_jamaat').value = '';
  renderHomeSummary();
  renderNoticeBoard();
}

function renderHomeSummary(){
  const todayIso = todayISO();
  const todayRec = data.attendance[todayIso] || {};
  const staff = api.role==='admin' || api.role==='teacher';
  const totalStudents = staff ? data.students.length : (data.overview?.totalStudents || 0);
  const hasTakenToday = Object.keys(todayRec).length > 0;
  const absentToday = Object.values(todayRec).filter(v=>v==='absent').length;
  const presentToday = totalStudents - absentToday;
  const attendancePct = totalStudents ? Math.round((presentToday/totalStudents)*100) : 0;
  const totalJamaat = data.jamaats.length;
  const totalTeachers = api.role==='admin' ? Object.keys(data.teacherAccounts || {}).length : (data.overview?.totalTeachers || 0);

  let attendanceValueHtml;
  const holiday = getHoliday(todayIso);
  if(holiday){
    attendanceValueHtml = `<div class="ov-num" style="font-size:14.5px; line-height:1.3;">🏖️ ${escapeHtml(holiday.name)}</div>`;
  } else if(isFriday(todayIso)){
    attendanceValueHtml = `<div class="ov-num" style="font-size:15px;">সাপ্তাহিক ছুটি</div>`;
  } else if(!staff){
    attendanceValueHtml = `<div class="ov-num" style="font-size:15px;">—</div>`;
  } else if(!hasTakenToday){
    attendanceValueHtml = `<div class="ov-num" style="font-size:15px;">হাজিরা নেওয়া হয়নি</div>`;
  } else {
    attendanceValueHtml = `<div class="ov-num">${toBn(attendancePct)}%</div>`;
  }

  document.getElementById('todaySummary').innerHTML = `
    <div class="ov-card">
      <div class="ov-label">মোট ছাত্র</div>
      <div class="ov-num">${toBn(totalStudents)}</div>
    </div>
    <div class="ov-card gold">
      <div class="ov-label">মোট জামাত</div>
      <div class="ov-num">${toBn(totalJamaat)}</div>
    </div>
    <div class="ov-card deep">
      <div class="ov-label">মোট শিক্ষক</div>
      <div class="ov-num">${toBn(totalTeachers)}</div>
    </div>
    <div class="ov-card red">
      <div class="ov-label">আজকের উপস্থিতি</div>
      ${attendanceValueHtml}
    </div>
  `;
}

function renderNoticeBoard(){
  const wrap = document.getElementById('noticeBoardWrap');
  if(!wrap) return;
  const notices = (data.notices || []).slice().sort((a,b)=> b.createdAt - a.createdAt);
  if(notices.length===0){ wrap.innerHTML=''; return; }
  wrap.innerHTML = `
    <div class="section-label">📢 নোটিশ বোর্ড</div>
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
      ${notices.map(n=>`
        <div style="background:var(--gold-light); border-left:4px solid var(--gold); border-radius:10px; padding:10px 12px;">
          <div style="font-size:13.5px; color:var(--ink); white-space:pre-wrap;">${escapeHtml(n.text)}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:4px;">${n.dateLabel || ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

window.submitAddNotice = async function(){
  const textEl = document.getElementById('m_notice_text');
  const text = textEl.value.trim();
  if(!text) return;
  if(!data.notices) data.notices = [];
  data.notices.push({
    id: 'nt_'+Date.now(),
    text,
    createdAt: Date.now(),
    dateLabel: todayBn()
  });
  await saveData();
  textEl.value = '';
  renderNoticeManageList();
  renderNoticeBoard();
}

window.deleteNotice = async function(id){
  data.notices = (data.notices || []).filter(n=>n.id!==id);
  await saveData();
  renderNoticeManageList();
  renderNoticeBoard();
}

function renderNoticeManageList(){
  const container = document.getElementById('noticeManageList');
  if(!container) return;
  const notices = (data.notices || []).slice().sort((a,b)=> b.createdAt - a.createdAt);
  if(notices.length===0){
    container.innerHTML = '<div class="empty" style="padding:16px;">কোনো নোটিশ নেই।</div>';
    return;
  }
  container.innerHTML = notices.map(n=>`
    <div class="citem" style="padding:10px 12px; align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:13.5px; white-space:pre-wrap;">${escapeHtml(n.text)}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:4px;">${n.dateLabel || ''}</div>
      </div>
      <button class="icon-btn del" onclick="deleteNotice('${n.id}')">✕</button>
    </div>
  `).join('');
}

window.submitAddHoliday = async function(){
  const nameEl = document.getElementById('m_holiday_name');
  const startEl = document.getElementById('m_holiday_start');
  const endEl = document.getElementById('m_holiday_end');
  const name = nameEl.value.trim();
  const start = startEl.value;
  let end = endEl.value || start;
  if(!name || !start){ alert('ছুটির নাম ও তারিখ দিন'); return; }
  if(end < start){ alert('শেষ তারিখ শুরুর তারিখের আগে হতে পারবে না'); return; }
  if(!data.holidays) data.holidays = [];
  data.holidays.push({ id:'hd_'+Date.now(), name, start, end });
  await saveData();
  nameEl.value = ''; startEl.value = ''; endEl.value = '';
  renderHolidayManageList();
  renderHomeSummary();
}

window.deleteHoliday = async function(id){
  data.holidays = (data.holidays || []).filter(h=>h.id!==id);
  await saveData();
  renderHolidayManageList();
  renderHomeSummary();
}

function renderHolidayManageList(){
  const container = document.getElementById('holidayManageList');
  if(!container) return;
  const holidays = (data.holidays || []).slice().sort((a,b)=> a.start.localeCompare(b.start));
  if(holidays.length===0){
    container.innerHTML = '<div class="empty" style="padding:16px;">কোনো ছুটি যোগ করা হয়নি।</div>';
    return;
  }
  container.innerHTML = holidays.map(h=>{
    const rangeLabel = h.start===h.end ? h.start : `${h.start} — ${h.end}`;
    return `
    <div class="citem" style="padding:10px 12px; align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:13.5px; font-weight:700;">${escapeHtml(h.name)}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:2px;">📅 ${rangeLabel}</div>
      </div>
      <button class="icon-btn del" onclick="deleteHoliday('${h.id}')">✕</button>
    </div>
  `;}).join('');
}

// ============ BOARD EXAM RESULTS (সাফল্য) ============
function boardYearOptions(selected){
  let opts = '';
  const startY = 2020, endY = new Date().getFullYear() + 10;
  for(let y=startY; y<=endY; y++){
    opts += `<option value="${y}" ${String(selected)===String(y)?'selected':''}>${toBn(y)}</option>`;
  }
  return opts;
}
const boardResultDivisions = ['মুমতাজ','জায়্যিদ জিদ্দান','জায়্যিদ','মকবুল'];
// এক্সেল ইমপোর্টের পুরনো ভার্সনে "অবস্থান" (১ম/২য়/৩য়) ভুলবশত "বিভাগ" ফিল্ডে বসে যেত।
// এই ফাংশন সেই ভুল রেকর্ডগুলো চিনে (division-এ সংখ্যা/ক্রমবাচক শব্দ, meritRank ফাঁকা) স্বয়ংক্রিয়ভাবে ঠিক করে দেয়।
function looksLikeMeritRank(v){
  const s = String(v||'').trim();
  if(!s) return false;
  if(boardResultDivisions.includes(s)) return false;
  return /[০-৯0-9]/.test(s) || /(ম|য়|তম|স্থান)\s*$/.test(s);
}
function migrateBoardResultDivisionMeritSwap(){
  let migrated = false;
  (data.boardResults || []).forEach(b=>{
    if(!b.meritRank && looksLikeMeritRank(b.division)){
      b.meritRank = b.division;
      b.division = '';
      migrated = true;
    }
  });
  if(migrated) saveData();
}
window.submitAddBoardResult = async function(editId){
  const name = document.getElementById('m_br_name').value.trim();
  const board = document.getElementById('m_br_board').value.trim();
  const division = document.getElementById('m_br_division').value.trim();
  const year = document.getElementById('m_br_year').value.trim();
  if(!name || !board || !division || !year){ alert('পরীক্ষার্থীর নাম, প্রতিষ্ঠান/বোর্ডের নাম, বিভাগ ও পরীক্ষার সাল অবশ্যই দিতে হবে।'); return; }
  const item = {
    id: editId || 'br_' + Date.now(),
    name, board, division, year,
    father: document.getElementById('m_br_father').value.trim(),
    address: document.getElementById('m_br_address').value.trim(),
    marhala: document.getElementById('m_br_marhala').value.trim(),
    roll: document.getElementById('m_br_roll').value.trim(),
    avgMark: document.getElementById('m_br_avgmark').value.trim(),
    meritRank: document.getElementById('m_br_meritrank').value.trim()
  };
  data.boardResults = data.boardResults || [];
  const ix = data.boardResults.findIndex(b=>b.id===item.id);
  if(ix>=0) data.boardResults[ix]=item; else data.boardResults.unshift(item);
  await saveData();
  openModal('addBoardResult');
  renderBoardResults();
}
window.editBoardResult = function(id){ window.__editBoardResultId = id; openModal('editBoardResult'); }
window.deleteBoardResult = async function(id){
  if(!confirm('এই সাফল্যটি মুছে ফেলবেন?')) return;
  data.boardResults = (data.boardResults || []).filter(b=>b.id!==id);
  await saveData();
  renderBoardResultManageList();
  renderBoardResults();
}
function renderBoardResultManageList(){
  const container = document.getElementById('boardResultManageList');
  if(!container) return;
  const list = data.boardResults || [];
  if(list.length===0){ container.innerHTML = '<div class="empty" style="padding:16px;">কোনো সাফল্য যোগ করা হয়নি।</div>'; return; }
  container.innerHTML = list.map(b=>`
    <div class="citem" style="padding:10px 12px; align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:13.5px; font-weight:700;">${escapeHtml(b.name)} ${b.roll?('(রোলঃ '+escapeHtml(b.roll)+')'):''}</div>
        <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${b.father?('পিতাঃ '+escapeHtml(b.father)+' — '):''}${b.marhala?('মারহালাঃ '+escapeHtml(b.marhala)+' — '):''}${b.board?('প্রতিষ্ঠান/বোর্ডঃ '+escapeHtml(b.board)):''} ${b.year?('(সালঃ '+toBn(b.year)+')'):''}</div>
        <div style="font-size:12px; margin-top:2px;">🏅 ${b.division?('বিভাগঃ '+escapeHtml(b.division)):''}${b.meritRank?(' • মেধা ক্রমঃ '+escapeHtml(b.meritRank)):''}${b.avgMark?(' • গড় মার্কঃ '+escapeHtml(b.avgMark)):''}</div>
      </div>
      <button class="icon-btn" onclick="editBoardResult('${b.id}')">✏️</button>
      <button class="icon-btn del" onclick="deleteBoardResult('${b.id}')">✕</button>
    </div>
  `).join('');
}
window.renderBoardResults = function(){
  const isAdmin = isAdminUnlocked();
  const bar = document.getElementById('boardResultsAdminBar');
  if(bar) bar.style.display = isAdmin ? 'block' : 'none';
  const filterSel = document.getElementById('br_year_filter');
  if(filterSel && filterSel.options.length===0){
    let opts = '<option value="">সকল সাল</option>';
    const startY = 2020, endY = new Date().getFullYear() + 10;
    for(let y=endY; y>=startY; y--){ opts += `<option value="${y}">${toBn(y)}</option>`; }
    filterSel.innerHTML = opts;
  }
  const boardFilterSel = document.getElementById('br_board_filter');
  if(boardFilterSel){
    const boards = [...new Set((data.boardResults||[]).map(b=>b.board).filter(Boolean))].sort();
    const currentVal = boardFilterSel.value;
    boardFilterSel.innerHTML = '<option value="">সকল বোর্ড</option>' + boards.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    boardFilterSel.value = currentVal;
  }
  const selectedYear = filterSel ? filterSel.value : '';
  const selectedBoard = boardFilterSel ? boardFilterSel.value : '';
  const container = document.getElementById('boardResultsList');
  let list = data.boardResults || [];
  if(selectedYear){ list = list.filter(b=> String(b.year)===String(selectedYear)); }
  if(selectedBoard){ list = list.filter(b=> b.board===selectedBoard); }
  if(list.length===0){
    container.innerHTML = `<div class="empty" style="padding:24px; text-align:center;">${(selectedYear||selectedBoard) ? 'এই ফিল্টার অনুযায়ী কোনো বোর্ড পরীক্ষার সাফল্য পাওয়া যায়নি।' : 'এখনো কোনো বোর্ড পরীক্ষার সাফল্য যোগ করা হয়নি।'}</div>`;
    return;
  }
  container.innerHTML = list.map(b=>renderBoardResultCard(b)).join('');
}
function renderBoardResultCard(b){
  return `
    <div class="citem" style="padding:12px; align-items:flex-start; flex-direction:column; gap:4px;">
      <div style="font-size:15px; font-weight:700;">🏆 ${escapeHtml(b.name)} ${b.roll?('— রোলঃ '+escapeHtml(b.roll)):''}</div>
      ${b.father?`<div style="font-size:12px; color:var(--muted);">পিতাঃ ${escapeHtml(b.father)}</div>`:''}
      ${b.address?`<div style="font-size:12px; color:var(--muted);">ঠিকানাঃ ${escapeHtml(b.address)}</div>`:''}
      <div style="font-size:12.5px; color:var(--muted); display:flex; flex-direction:column; gap:2px;">
        ${b.marhala?`<div>মারহালাঃ ${escapeHtml(b.marhala)}</div>`:''}
        ${b.board?`<div>প্রতিষ্ঠান/বোর্ডঃ ${escapeHtml(b.board)}</div>`:''}
        ${b.year?`<div>সালঃ ${toBn(b.year)}</div>`:''}
      </div>
      <div style="font-size:13.5px; color:var(--green); font-weight:600; display:flex; flex-direction:column; gap:2px;">
        ${(b.division||b.result)?`<div>🏅 বিভাগঃ ${escapeHtml(b.division||b.result)}</div>`:''}
        ${b.meritRank?`<div>মেধা ক্রমঃ ${escapeHtml(b.meritRank)}</div>`:''}
        ${b.avgMark?`<div>গড় মার্কঃ ${escapeHtml(b.avgMark)}</div>`:''}
      </div>
      <button class="btn outline" style="margin-top:6px; padding:6px 12px; font-size:12px;" onclick="downloadBoardResultPdf('${b.id}')">📄 PDF ডাউনলোড করুন</button>
    </div>
  `;
}

// ============ MADRASA FULL RESULT ============
const MR_EXAMS={sem1:'১ম সাময়িক',sem2:'২য় সাময়িক',annual:'বার্ষিক'};
window.renderMadrasaResultFilters=function(){
  const js=document.getElementById('mr_jamaat'), ys=document.getElementById('mr_year'), es=document.getElementById('mr_exam'); if(!js||!ys||!es)return;
  js.innerHTML='<option value="">— জামাত বাছাই করুন —</option>'+data.jamaats.map(j=>`<option value="${j.id}">${escapeHtml(j.name)}</option>`).join('');
  const years=Object.keys(data.examResults||{}).sort((a,b)=>b.localeCompare(a));
  ys.innerHTML='<option value="">— শিক্ষাবর্ষ —</option>'+years.map(y=>`<option value="${y}">${toBn(y)}</option>`).join('');
  es.innerHTML='<option value="">— পরীক্ষা —</option>'+Object.entries(MR_EXAMS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  document.getElementById('madrasaResultsList').innerHTML='<div class="empty"><div class="big">📋</div>জামাত, শিক্ষাবর্ষ ও পরীক্ষা নির্বাচন করুন।</div>';
}
window.renderMadrasaResults=function(){
  const jid=document.getElementById('mr_jamaat')?.value, year=document.getElementById('mr_year')?.value, key=document.getElementById('mr_exam')?.value, box=document.getElementById('madrasaResultsList'); if(!box)return;
  if(!jid||!year||!key){box.innerHTML='<div class="empty"><div class="big">📋</div>জামাত, শিক্ষাবর্ষ ও পরীক্ষা নির্বাচন করুন।</div>';return;}
  const j=data.jamaats.find(x=>x.id===jid), subs=j?.subjects||[], students=data.students.filter(s=>s.jamaatId===jid).slice().sort((a,b)=>(Number(a.roll)||999999)-(Number(b.roll)||999999));
  const yr=data.examResults?.[year]||{}, er=yr[key]||{};
  const totals={}; students.forEach(st=>{const m=er[st.id]||{};totals[st.id]=subs.reduce((sum,sub)=>sum+(Number(m[sub.id])||0),0);});
  const ranks=[...new Set(Object.values(totals))].sort((a,b)=>b-a);
  const th=subs.map(sub=>`<th>${escapeHtml(sub.name)}</th>`).join('');
  if(!students.length){box.innerHTML='<div class="empty">এই জামাতে কোনো ছাত্র নেই।</div>';return;}
  if(!subs.length){box.innerHTML='<div class="empty">এই জামাতে কোনো বিষয় যোগ করা হয়নি।</div>';return;}
  box.innerHTML=`<div style="font-weight:700;color:var(--green-deep);font-size:14px;">${escapeHtml(j.name)} • ${toBn(year)} • ${MR_EXAMS[key]}</div><div class="result-table-wrap"><table class="result-table"><thead><tr><th>রোল</th><th>নাম</th>${th}<th>মোট</th><th>অবস্থান</th></tr></thead><tbody>${students.map(st=>{const m=er[st.id]||{}, total=totals[st.id]||0, rank=ranks.indexOf(total)+1;return `<tr><td>${escapeHtml(st.roll||'')}</td><td>${escapeHtml(st.name)}</td>${subs.map(sub=>`<td>${m[sub.id]??'-'}</td>`).join('')}<td><b>${total}</b></td><td><b>${rank}</b></td></tr>`}).join('')}</tbody></table></div>`;
}
window.downloadMadrasaResultsPdf=function(){
  const jid=document.getElementById('mr_jamaat')?.value, year=document.getElementById('mr_year')?.value, key=document.getElementById('mr_exam')?.value; if(!jid||!year||!key){alert('আগে জামাত, শিক্ষাবর্ষ ও পরীক্ষা নির্বাচন করুন।');return;}
  const j=data.jamaats.find(x=>x.id===jid), subs=j?.subjects||[], er=(data.examResults?.[year]?.[key])||{}, students=data.students.filter(s=>s.jamaatId===jid).sort((a,b)=>(Number(a.roll)||999999)-(Number(b.roll)||999999));
  const totals={}; students.forEach(st=>{const m=er[st.id]||{};totals[st.id]=subs.reduce((sum,sub)=>sum+(Number(m[sub.id])||0),0);}); const ranks=[...new Set(Object.values(totals))].sort((a,b)=>b-a);
  const logoSrc=document.querySelector('.brandbox img')?.src||'';
  document.getElementById('printMarksheet').innerHTML=`${logoSrc?`<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>`:''}<div class="ms-header">${logoSrc?`<img src="${logoSrc}" onerror="this.remove()">`:''}<h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2><p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p></div><div class="ms-title">${escapeHtml(j.name)} — ${toBn(year)} — ${MR_EXAMS[key]}</div><table><thead><tr><th>রোল</th><th>নাম</th>${subs.map(s=>`<th>${escapeHtml(s.name)}</th>`).join('')}<th>মোট</th><th>অবস্থান</th></tr></thead><tbody>${students.map(st=>{const m=er[st.id]||{}, total=totals[st.id]||0, rank=ranks.indexOf(total)+1;return `<tr><td>${escapeHtml(st.roll||'')}</td><td style="text-align:left;">${escapeHtml(st.name)}</td>${subs.map(sub=>`<td>${m[sub.id]??'-'}</td>`).join('')}<td><b>${total}</b></td><td><b>${rank}</b></td></tr>`}).join('')}</tbody></table><p style="margin-top:14px;font-size:11px;color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>`;
  setTimeout(()=>window.print(),200);
}

// ============ COMPETITION ACHIEVEMENTS ============
function competitionYearOptions(selected=''){
  let html = '<option value="">সকল সাল</option>';
  const current = new Date().getFullYear();
  for(let y=current+10;y>=2020;y--) html += `<option value="${y}" ${String(selected)===String(y)?'selected':''}>${toBn(y)}</option>`;
  return html;
}
const competitionCategories = ['কুইজ','বিতর্ক','ক্বেরাত','হামদ-নাত','তিলাওয়াত','হিফজ','আজান','সাংস্কৃতিক','খেলাধুলা','অন্যান্য'];
window.renderCompetitionResults = function(){
  const isAdmin = isAdminUnlocked();
  const bar=document.getElementById('competitionResultsAdminBar'); if(bar) bar.style.display=isAdmin?'block':'none';
  const yf=document.getElementById('cr_year_filter'), cf=document.getElementById('cr_category_filter');
  if(yf && yf.options.length<=1) yf.innerHTML=competitionYearOptions();
  if(cf && cf.options.length<=1) cf.innerHTML='<option value="">সব ধরনের প্রতিযোগিতা</option>'+competitionCategories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const year=yf?.value||'', cat=cf?.value||'';
  let list=(data.competitionResults||[]).slice();
  if(year) list=list.filter(x=>String(x.year)===String(year));
  if(cat) list=list.filter(x=>x.category===cat);
  list.sort((a,b)=>String(b.year).localeCompare(String(a.year)) || (b.createdAt||0)-(a.createdAt||0));
  const box=document.getElementById('competitionResultsList'); if(!box)return;
  if(!list.length){box.innerHTML='<div class="empty"><div class="big">🎖️</div>এখনো কোনো প্রতিযোগিতার সাফল্য যোগ করা হয়নি।</div>';return;}
  box.innerHTML=list.map(x=>`
    <div class="achievement-card">
      <div class="ach-title">🎖️ ${escapeHtml(x.competition)}</div>
      <div class="ach-meta">${escapeHtml(x.category||'অন্যান্য')} • ${toBn(x.year||'')} ${x.studentName?'• 👤 '+escapeHtml(x.studentName):''}${x.jamaatName?' • '+escapeHtml(x.jamaatName):''}</div>
      <div class="ach-prize">🏅 ${escapeHtml(x.achievement)}</div>
      ${x.organizer?`<div class="ach-meta">আয়োজক: ${escapeHtml(x.organizer)}</div>`:''}
      ${x.location?`<div class="ach-meta">📍 ${escapeHtml(x.location)}</div>`:''}
      ${x.description?`<div style="font-size:12.5px; margin-top:7px; line-height:1.55;">${escapeHtml(x.description)}</div>`:''}
    </div>`).join('');
}
function renderCompetitionManageList(){
  const box=document.getElementById('competitionManageList'); if(!box)return;
  const list=(data.competitionResults||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!list.length){box.innerHTML='<div class="empty" style="padding:16px;">কোনো সাফল্য যোগ করা হয়নি।</div>';return;}
  box.innerHTML=list.map(x=>`<div class="citem" style="padding:10px 12px; align-items:flex-start;">
    <div style="flex:1"><div style="font-size:13.5px;font-weight:700;">🎖️ ${escapeHtml(x.competition)}</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px;">${escapeHtml(x.studentName||'')} • ${escapeHtml(x.category||'')} • ${toBn(x.year||'')}</div><div style="font-size:12px;margin-top:2px;color:#8a6a10;">🏅 ${escapeHtml(x.achievement)}</div></div>
    <button class="icon-btn" onclick="editCompetitionResult('${x.id}')">✏️</button><button class="icon-btn del" onclick="deleteCompetitionResult('${x.id}')">✕</button></div>`).join('');
}
function competitionStudentOptions(selected=''){
  return '<option value="">— ছাত্র বাছাই করুন —</option>'+data.students.slice().sort((a,b)=>String(a.roll).localeCompare(String(b.roll),undefined,{numeric:true})).map(st=>{const j=data.jamaats.find(j=>j.id===st.jamaatId);return `<option value="${st.id}" ${st.id===selected?'selected':''}>${escapeHtml(st.name)} — রোল ${escapeHtml(st.roll||'')} — ${escapeHtml(j?.name||'')}</option>`}).join('');
}
window.submitCompetitionResult = async function(editId=null){
  const studentId=document.getElementById('m_cr_student').value;
  const competition=document.getElementById('m_cr_competition').value.trim();
  const category=document.getElementById('m_cr_category').value;
  const year=document.getElementById('m_cr_year').value;
  const achievement=document.getElementById('m_cr_achievement').value.trim();
  if(!studentId||!competition||!category||!year||!achievement){alert('ছাত্র, প্রতিযোগিতার নাম, ধরন, সাল ও অর্জন অবশ্যই দিতে হবে।');return;}
  const st=data.students.find(x=>x.id===studentId), j=st?data.jamaats.find(x=>x.id===st.jamaatId):null;
  const item={id:editId||'cr_'+Date.now(),studentId,studentName:st?.name||'',roll:st?.roll||'',jamaatId:st?.jamaatId||'',jamaatName:j?.name||'',competition,category,year,achievement,organizer:document.getElementById('m_cr_organizer').value.trim(),location:document.getElementById('m_cr_location').value.trim(),description:document.getElementById('m_cr_description').value.trim(),createdAt:editId?((data.competitionResults||[]).find(x=>x.id===editId)?.createdAt||Date.now()):Date.now()};
  data.competitionResults=data.competitionResults||[];
  const ix=data.competitionResults.findIndex(x=>x.id===item.id); if(ix>=0)data.competitionResults[ix]=item; else data.competitionResults.unshift(item);
  await saveData(); openModal('manageCompetition'); renderCompetitionResults();
}
window.editCompetitionResult=function(id){ window.__editCompetitionId=id; openModal('editCompetition'); }
window.deleteCompetitionResult=async function(id){
  if(!confirm('এই প্রতিযোগিতার সাফল্যটি মুছে ফেলবেন?'))return;
  data.competitionResults=(data.competitionResults||[]).filter(x=>x.id!==id); await saveData(); renderCompetitionManageList(); renderCompetitionResults();
}

// ============ NEW STUDENT ADMISSION (ভর্তি ফরম) ============
function populateAdmDivisionSelects(){
  ['ad_cur_division','ad_perm_division'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) populateDivisionSelect(el, '');
  });
}
window.onAdmDivisionChange = function(kind){
  const divisionId = document.getElementById(`ad_${kind}_division`).value;
  const distSel = document.getElementById(`ad_${kind}_district`);
  const thanaSel = document.getElementById(`ad_${kind}_thana`);
  populateDistrictSelect(distSel, divisionId, '');
  populateThanaSelect(thanaSel, '', '');
}
window.onAdmDistrictChange = function(kind){
  const districtId = document.getElementById(`ad_${kind}_district`).value;
  const thanaSel = document.getElementById(`ad_${kind}_thana`);
  populateThanaSelect(thanaSel, districtId, '');
}
window.onSameAddressToggle = function(){
  const same = document.getElementById('ad_same_address').checked;
  if(same){
    document.getElementById('ad_perm_village').value = document.getElementById('ad_cur_village').value;
    const curDiv = document.getElementById('ad_cur_division').value;
    document.getElementById('ad_perm_division').value = curDiv;
    populateDistrictSelect(document.getElementById('ad_perm_district'), curDiv, document.getElementById('ad_cur_district').value);
    populateThanaSelect(document.getElementById('ad_perm_thana'), document.getElementById('ad_cur_district').value, document.getElementById('ad_cur_thana').value);
  }
}
window.renderAdmissionForm = function(){
  ['ad_name','ad_father','ad_mother','ad_phone','ad_dob','ad_address','ad_cur_village','ad_perm_village','ad_prev_madrasa','ad_prev_class'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const same = document.getElementById('ad_same_address'); if(same) same.checked = false;
  const fillDivisions = () => {
    if(bdDivisions.length){ populateAdmDivisionSelects(); }
    else { setTimeout(fillDivisions, 300); }
  };
  fillDivisions();
  ['ad_cur_district','ad_perm_district'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.innerHTML='<option value="">— আগে বিভাগ বাছাই করুন —</option>'; el.disabled=true; } });
  ['ad_cur_thana','ad_perm_thana'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.innerHTML='<option value="">— আগে জেলা বাছাই করুন —</option>'; el.disabled=true; } });
  const sel = document.getElementById('ad_jamaat');
  if(sel){
    sel.innerHTML = '<option value="">— বাছাই করুন —</option>' + data.jamaats.map(j=>`<option value="${j.id}">${j.name}</option>`).join('');
  }
  const msg = document.getElementById('admissionMsg');
  if(msg) msg.textContent = '';
}
function bnName(list, id){ const item = list.find(x=>x.id===id); return item ? (item.bn_name || item.name) : ''; }
function collectAdmissionFormData(){
  return {
    name: document.getElementById('ad_name').value.trim(),
    fatherName: document.getElementById('ad_father').value.trim(),
    motherName: document.getElementById('ad_mother').value.trim(),
    phone: document.getElementById('ad_phone').value.trim(),
    dob: document.getElementById('ad_dob').value,
    curVillage: document.getElementById('ad_cur_village').value.trim(),
    curDivision: document.getElementById('ad_cur_division').value,
    curDivisionName: bnName(bdDivisions, document.getElementById('ad_cur_division').value),
    curDistrict: document.getElementById('ad_cur_district').value,
    curDistrictName: bnName(bdDistricts, document.getElementById('ad_cur_district').value),
    curThana: document.getElementById('ad_cur_thana').value,
    curThanaName: bnName(bdUpazilas, document.getElementById('ad_cur_thana').value),
    permVillage: document.getElementById('ad_perm_village').value.trim(),
    permDivision: document.getElementById('ad_perm_division').value,
    permDivisionName: bnName(bdDivisions, document.getElementById('ad_perm_division').value),
    permDistrict: document.getElementById('ad_perm_district').value,
    permDistrictName: bnName(bdDistricts, document.getElementById('ad_perm_district').value),
    permThana: document.getElementById('ad_perm_thana').value,
    permThanaName: bnName(bdUpazilas, document.getElementById('ad_perm_thana').value),
    prevMadrasa: document.getElementById('ad_prev_madrasa').value.trim(),
    prevClass: document.getElementById('ad_prev_class').value.trim(),
    jamaatId: document.getElementById('ad_jamaat').value,
    address: document.getElementById('ad_address').value.trim()
  };
}
window.submitAdmission = async function(){
  const f = collectAdmissionFormData();
  const msg = document.getElementById('admissionMsg');
  if(!f.name || !f.phone || !f.jamaatId){
    msg.style.color = 'var(--red)';
    msg.textContent = 'ছাত্রের নাম, মোবাইল নম্বর ও ক্লাস অবশ্যই দিতে হবে।';
    return;
  }
  try{
    await api.submitAdmission(f);
    if(isAdminUnlocked()) data.admissions = await api.admissions();
  }catch(e){
    msg.style.color = 'var(--red)';
    msg.textContent = 'আবেদন জমা হয়নি: ' + e.message;
    return;
  }
  renderAdminAdmissionBadge();
  msg.style.color = 'var(--green)';
  msg.textContent = '✅ আপনার আবেদন সফলভাবে জমা হয়েছে। মাদ্রাসা কর্তৃপক্ষ যোগাযোগ করবেন।';
}
window.downloadAdmissionFormPdf = function(){
  const f = collectAdmissionFormData();
  const jamaat = data.jamaats.find(j=>j.id===f.jamaatId);
  const logoSrc = document.querySelector('.brandbox img')?.src || '';
  const row = (label, val) => `<tr><td style="font-weight:700; padding:6px 8px; width:40%;">${label}</td><td style="padding:6px 8px;">${val || '-'}</td></tr>`;
  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">ভর্তি ফরম</div>
    <table>
      <tbody>
        ${row('ছাত্রের নাম', f.name)}
        ${row('পিতার নাম', f.fatherName)}
        ${row('মাতার নাম', f.motherName)}
        ${row('মোবাইল নম্বর', f.phone)}
        ${row('জন্ম তারিখ', f.dob)}
        ${row('বর্তমান ঠিকানা', [f.curVillage?`গ্রাম: ${f.curVillage}`:'', f.curThanaName?`থানা: ${f.curThanaName}`:'', f.curDistrictName?`জেলা: ${f.curDistrictName}`:'', f.curDivisionName?`বিভাগ: ${f.curDivisionName}`:''].filter(Boolean).join(', '))}
        ${row('স্থায়ী ঠিকানা', [f.permVillage?`গ্রাম: ${f.permVillage}`:'', f.permThanaName?`থানা: ${f.permThanaName}`:'', f.permDistrictName?`জেলা: ${f.permDistrictName}`:'', f.permDivisionName?`বিভাগ: ${f.permDivisionName}`:''].filter(Boolean).join(', '))}
        ${row('পূর্ববর্তী মাদ্রাসা/প্রতিষ্ঠান', f.prevMadrasa)}
        ${row('পূর্ববর্তী ক্লাস', f.prevClass)}
        ${row('বর্তমানে ভর্তির ক্লাস', jamaat?.name||'')}
        ${row('অতিরিক্ত মন্তব্য', f.address)}
      </tbody>
    </table>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}

window.downloadBoardResultPdf = function(id){
  const b = (data.boardResults||[]).find(x=>x.id===id);
  if(!b) return;
  const logoSrc = document.querySelector('.brandbox img')?.src || '';
  const row = (label, val) => `<tr><td style="font-weight:700; padding:6px 8px; width:40%;">${label}</td><td style="padding:6px 8px;">${val || '-'}</td></tr>`;
  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">🏆 বোর্ড পরীক্ষার সাফল্য</div>
    <table>
      <tbody>
        ${row('ছাত্রের নাম', escapeHtml(b.name))}
        ${row('রোল নম্বর', escapeHtml(b.roll||''))}
        ${row('পিতার নাম', escapeHtml(b.father||''))}
        ${row('ঠিকানা', escapeHtml(b.address||''))}
        ${row('মারহালা', escapeHtml(b.marhala||''))}
        ${row('প্রতিষ্ঠান/বোর্ড', escapeHtml(b.board||''))}
        ${row('সাল', b.year?toBn(b.year):'')}
        ${row('বিভাগ', escapeHtml(b.division||b.result||''))}
        ${row('মেধা ক্রম', escapeHtml(b.meritRank||''))}
        ${row('গড় মার্ক', escapeHtml(b.avgMark||''))}
      </tbody>
    </table>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}
window.downloadBoardResultListPdf = function(){
  const filterSel = document.getElementById('br_year_filter');
  const boardFilterSel = document.getElementById('br_board_filter');
  const selectedYear = filterSel ? filterSel.value : '';
  const selectedBoard = boardFilterSel ? boardFilterSel.value : '';
  let list = data.boardResults || [];
  if(selectedYear){ list = list.filter(b=> String(b.year)===String(selectedYear)); }
  if(selectedBoard){ list = list.filter(b=> b.board===selectedBoard); }
  if(list.length===0){ alert('ডাউনলোড করার মতো কোনো তথ্য নেই।'); return; }
  const logoSrc = document.querySelector('.brandbox img')?.src || '';
  const rows = list.map((b,i)=>`<tr>
      <td>${toBn(i+1)}</td>
      <td style="text-align:left;">${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.roll||'-')}</td>
      <td style="text-align:left;">${escapeHtml(b.father||'-')}</td>
      <td>${escapeHtml(b.marhala||'-')}</td>
      <td style="text-align:left;">${escapeHtml(b.board||'-')}</td>
      <td>${b.year?toBn(b.year):'-'}</td>
      <td>${escapeHtml(b.division||b.result||'-')}</td>
      <td>${escapeHtml(b.meritRank||'-')}</td>
      <td>${escapeHtml(b.avgMark||'-')}</td>
    </tr>`).join('');
  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">🏆 বোর্ড পরীক্ষার সাফল্যের তালিকা ${selectedBoard?(' — '+escapeHtml(selectedBoard)):''} ${selectedYear?(' — '+toBn(selectedYear)):''}</div>
    <table>
      <thead><tr><th>ক্র.</th><th>নাম</th><th>রোল</th><th>পিতা</th><th>মারহালা</th><th>বোর্ড</th><th>সাল</th><th>বিভাগ</th><th>মেধা ক্রম</th><th>গড় মার্ক</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}

// ============ ADD OLD/EXISTING STUDENT (admin) ============
window.addOldStudentFlow = async function(){
  if(!isAdminUnlocked()){
    await unlockAdmin();
    if(!isAdminUnlocked()) return;
  }
  openModal('oldStudentJamaat');
}
window.goAddOldStudent = function(){
  const jamaatId = document.getElementById('m_old_jamaat').value;
  if(!jamaatId) return;
  const j = data.jamaats.find(x=>x.id===jamaatId);
  state.jamaatId = j.id;
  closeModal();
  enterJamaat();
  setTimeout(()=>{ openModal('addStudent'); }, 50);
}

function populateBranchSelect(){
  const jamaatSel = document.getElementById('sel_jamaat');
  jamaatSel.innerHTML = '<option value="">— বাছাই করুন —</option>' +
    data.jamaats.map(j=>`<option value="${j.id}">${j.name}${j.teacher?(' — '+j.teacher):''}</option>`).join('');
}

window.onJamaatChange = function(){
  const jamaatId = document.getElementById('sel_jamaat').value;
  state.jamaatId = jamaatId;
  const feeBtn = document.getElementById('feeBtnAdmin');
  if(feeBtn) feeBtn.disabled = !jamaatId;
  const reportBtn = document.getElementById('reportBtnAdmin');
  if(reportBtn) reportBtn.disabled = !jamaatId;
}

let selectedAttendanceDate = todayISO();

window.enterJamaat = function(){
  if(!state.jamaatId) return;
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  showScreen('screen-class', jamaat.name, `${jamaat.teacher || ''}`, true);
  selectedAttendanceDate = todayISO();
  document.getElementById('attendanceDateInput').value = selectedAttendanceDate;
  document.getElementById('classDate').textContent = '📅 ' + todayBn();
  renderStudentList();
}

window.onAttendanceDateChange = function(){
  const val = document.getElementById('attendanceDateInput').value;
  if(!val) return;
  selectedAttendanceDate = val;
  const d = new Date(val + 'T00:00:00');
  document.getElementById('classDate').textContent = '📅 ' + d.toLocaleDateString('bn-BD', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  renderStudentList();
}

function getTodayStatus(studentId){
  const rec = data.attendance[selectedAttendanceDate];
  if(!rec || !(studentId in rec)) return 'present';
  return rec[studentId];
}

// হাজিরা তালিকার ক্রম: শুধু ১ম সাময়িক / ২য় সাময়িক / বার্ষিক পরীক্ষার নম্বর দেওয়া হলে
// সবচেয়ে সাম্প্রতিক (নতুন বছর, তারপর বার্ষিক > ২য় সাময়িক > ১ম সাময়িক) পরীক্ষার
// র‍্যাংক অনুযায়ী ছাত্র ডাকা হবে। টিউটোরিয়াল পরীক্ষায় এই ক্রম বদলাবে না।
const RANK_ORDER_EXAM_TYPES = ['annual','sem1','sem2'];
function findLatestRankExam(){
  const years = Object.keys(data.examResults||{}).sort((a,b)=> b.localeCompare(a));
  for(const year of years){
    for(const type of RANK_ORDER_EXAM_TYPES){
      const res = data.examResults[year] && data.examResults[year][type];
      if(res && Object.keys(res).length>0) return {year, type};
    }
  }
  return null;
}
function getAttendanceOrderTotals(){
  const latest = findLatestRankExam();
  if(!latest) return null;
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  const subjects = jamaat && jamaat.subjects || [];
  if(!subjects.length) return null;
  const results = (data.examResults[latest.year] && data.examResults[latest.year][latest.type]) || {};
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  if(!myStudents.some(s=> results[s.id])) return null; // এই জামাতে এখনো এই পরীক্ষার নম্বর দেওয়া হয়নি
  const totals = {};
  myStudents.forEach(s=>{
    const marks = results[s.id] || {};
    totals[s.id] = subjects.reduce((sum,sub)=> sum + (Number(marks[sub.id])||0), 0);
  });
  return totals;
}

function renderStudentList(){
  const orderTotals = getAttendanceOrderTotals();
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId)
    .sort((a,b)=> orderTotals
      ? (orderTotals[b.id]-orderTotals[a.id]) || (a.roll-b.roll)
      : a.roll-b.roll);
  const container = document.getElementById('studentList');
  if(myStudents.length===0){
    container.innerHTML = `<div class="empty"><div class="big">🧑‍🎓</div>এই জামাতে এখনো ছাত্র যোগ করা হয়নি।<br>নিচের বাটন থেকে যোগ করুন।</div>`;
  } else {
    container.innerHTML = myStudents.map(s=>{
      const status = getTodayStatus(s.id);
      return `
        <div class="srow">
          <div class="sname" onclick="openEditStudent('${s.id}')" style="cursor:pointer;"><span class="roll">${s.roll}</span> ${s.name}</div>
          <div class="toggle">
            <button class="present ${status==='present'?'on':''}" onclick="setStatus('${s.id}','present')">উপস্থিত</button>
            <button class="absent ${status==='absent'?'on':''}" onclick="setStatus('${s.id}','absent')">অনুপস্থিত</button>
          </div>
        </div>`;
    }).join('');
  }
  const present = myStudents.filter(s=>getTodayStatus(s.id)==='present').length;
  const absent = myStudents.length - present;
  document.getElementById('classStatRow').innerHTML = `
    <div class="stat"><div class="n">${myStudents.length}</div><div class="l">মোট ছাত্র</div></div>
    <div class="stat"><div class="n" style="color:var(--green-deep)">${present}</div><div class="l">উপস্থিত</div></div>
    <div class="stat absent"><div class="n">${absent}</div><div class="l">অনুপস্থিত</div></div>
  `;
}

window.setStatus = function(studentId, status){
  if(!data.attendance[selectedAttendanceDate]) data.attendance[selectedAttendanceDate] = {};
  data.attendance[selectedAttendanceDate][studentId] = status;
  renderStudentList();
}

window.saveAttendance = async function(){
  const date = selectedAttendanceDate;
  if(!data.attendance[date]) data.attendance[date] = {};
  // ensure every student in this jamaat has an explicit status recorded (default present)
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  myStudents.forEach(s=>{
    if(!(s.id in data.attendance[date])){
      data.attendance[date][s.id] = 'present';
    }
  });
  await saveData();
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'), 1800);
}

// ---------- Excel/CSV Import (কলাম ম্যাপিং সহ) ----------
const EXCEL_IMPORT_SCHEMAS = {
  students: [
    ['name','ছাত্রের নাম *',true],['roll','রোল',false],['jamaat','জামাত/মারহালা',false],['fatherName','পিতার নাম',false],['motherName','মাতার নাম',false],['guardianMobile','অভিভাবকের মোবাইল',false],['guardianNID','অভিভাবকের এনআইডি',false],['dob','জন্ম তারিখ',false],['admissionDate','ভর্তির তারিখ',false],['monthlyFee','মাসিক বেতন',false],['division','বিভাগ',false],['district','জেলা',false],['thana','থানা/উপজেলা',false],['village','গ্রাম/এলাকা',false]
  ],
  board: [
    ['name','পরীক্ষার্থীর নাম *',true],['father','পিতার নাম',false],['address','ঠিকানা',false],['marhala','মারহালা',false],['board','প্রতিষ্ঠান/বোর্ডের নাম *',true],['roll','রোল নং',false],['year','পরীক্ষার সাল *',true],['avgMark','গড় মার্ক',false],['division','বিভাগ (ঐচ্ছিক)',false],['meritRank','মেধা ক্রম',false]
  ],
  competition: [
    ['studentName','ছাত্রের নাম *',true],['roll','রোল',false],['jamaat','জামাত/মারহালা',false],['competition','প্রতিযোগিতার নাম *',true],['category','ধরন *',true],['year','সাল *',true],['achievement','অর্জন/অবস্থান *',true],['organizer','আয়োজক প্রতিষ্ঠান',false],['location','স্থান',false],['description','বিবরণ',false]
  ],
  fees: [
    ['month','মাস (YYYY-MM) *',true],['studentName','ছাত্রের নাম',false],['roll','রোল',false],['amount','পরিশোধের পরিমাণ *',true],['status','স্ট্যাটাস',false]
  ],
  exams: [
    ['studentName','ছাত্রের নাম *',true],['roll','রোল',false]
  ]
};
const EXCEL_IMPORT_ALIASES = {
  name:['name','student name','studentname','ছাত্রের নাম','নাম','পরীক্ষার্থীর নাম'], roll:['roll','roll no','roll number','রোল','রোল নম্বর','রোল নং'], jamaat:['jamaat','class','marhala','জামাত','মারহালা','ক্লাস'],
  fatherName:['father','father name','fathername','পিতার নাম'], motherName:['mother','mother name','mothername','মাতার নাম'], guardianMobile:['mobile','phone','guardian mobile','অভিভাবকের মোবাইল','মোবাইল'], guardianNID:['nid','guardian nid','এনআইডি','অভিভাবকের এনআইডি'],
  dob:['dob','birth date','date of birth','জন্ম তারিখ'], admissionDate:['admission date','ভর্তির তারিখ'], monthlyFee:['monthly fee','fee','মাসিক বেতন','বেতন'], division:['division','বিভাগ','ফলাফল','result','গ্রেড','grade'], district:['district','জেলা'], thana:['thana','upazila','থানা','উপজেলা'], village:['village','area','গ্রাম','এলাকা'],
  father:['father','father name','fathername','পিতা','পিতার নাম'], address:['address','ঠিকানা'], marhala:['marhala','মারহালা'], board:['board','বোর্ড','বোর্ডের নাম','প্রতিষ্ঠান','প্রতিষ্ঠানের নাম'], year:['year','সাল','বছর','পরীক্ষার সাল'], avgMark:['avg mark','average','গড় মার্ক','গড়মার্ক'], meritRank:['merit','merit rank','মেধা ক্রম','মেধাক্রম','অবস্থান','position'],
  competition:['competition','event','প্রতিযোগিতা','প্রতিযোগিতার নাম'], category:['category','type','ধরন','প্রতিযোগিতার ধরন'], achievement:['achievement','award','অর্জন','পুরস্কার'], organizer:['organizer','আয়োজক','আয়োজক প্রতিষ্ঠান'], location:['location','স্থান'], description:['description','বিবরণ'], month:['month','মাস'], amount:['amount','paid','payment','পরিশোধ','পরিশোধের পরিমাণ'], status:['status','স্ট্যাটাস']
};
let excelImportState = {type:'students',headers:[],rows:[],mappings:{},fileName:'',defaultJamaatId:'',defaultYear:'',defaultExamType:'annual'};
function normalizeImportHeader(v){ return String(v??'').trim().toLowerCase().replace(/[\s_\-./]+/g,''); }
function autoImportMapping(key){
  const headers=excelImportState.headers;
  const aliases=(EXCEL_IMPORT_ALIASES[key]||[key]).map(normalizeImportHeader);
  let idx=headers.findIndex(h=>aliases.includes(normalizeImportHeader(h)));
  if(idx<0) idx=headers.findIndex(h=>aliases.some(a=>normalizeImportHeader(h).includes(a)||a.includes(normalizeImportHeader(h))));
  return idx>=0?String(idx):'';
}
function importColOptions(selected=''){
  return '<option value="">— বাদ দিন —</option>'+excelImportState.headers.map((h,i)=>`<option value="${i}" ${String(selected)===String(i)?'selected':''}>${escapeHtml(h||('কলাম '+(i+1)))}</option>`).join('');
}
function renderExcelImportExtra(){
  const box=document.getElementById('excel_import_extra'); if(!box)return;
  const type=document.getElementById('excel_import_type')?.value||excelImportState.type;
  excelImportState.type=type;
  let html='';
  if(type==='students'){
    html=`<div class="field"><label>Excel-এ জামাতের কলাম না থাকলে ডিফল্ট জামাত</label><select id="excel_default_jamaat" onchange="renderExcelMapping()"><option value="">— Excel-এর জামাত ব্যবহার করুন —</option>${data.jamaats.map(j=>`<option value="${j.id}">${escapeHtml(j.name)}</option>`).join('')}</select></div>`;
  } else if(type==='exams'){
    html=`<div class="field"><label>ডিফল্ট জামাত *</label><select id="excel_default_jamaat" onchange="renderExcelMapping()"><option value="">— বাছাই করুন —</option>${data.jamaats.map(j=>`<option value="${j.id}">${escapeHtml(j.name)}</option>`).join('')}</select></div>
    <div class="field"><label>ডিফল্ট শিক্ষাবর্ষ *</label><input id="excel_default_year" type="text" value="${new Date().getFullYear()}" placeholder="যেমন ২০২৬"></div>
    <div class="field"><label>পরীক্ষা *</label><select id="excel_default_exam"><option value="annual">বার্ষিক পরীক্ষা</option><option value="sem1">১ম সাময়িক পরীক্ষা</option><option value="sem2">২য় সাময়িক পরীক্ষা</option><option value="tut1">১ম টিউটোরিয়াল পরীক্ষা</option><option value="tut2">২য় টিউটোরিয়াল পরীক্ষা</option><option value="tut3">৩য় টিউটোরিয়াল পরীক্ষা</option></select></div>`;
  }
  box.innerHTML=html;
}
window.resetExcelImportType=function(){
  excelImportState={type:document.getElementById('excel_import_type')?.value||'students',headers:[],rows:[],mappings:{},fileName:'',defaultJamaatId:'',defaultYear:'',defaultExamType:'annual'};
  const status=document.getElementById('excel_import_status'); if(status)status.textContent='';
  const map=document.getElementById('excel_import_mapping'); if(map)map.innerHTML='';
  const prev=document.getElementById('excel_import_preview'); if(prev)prev.innerHTML='';
  const actions=document.getElementById('excel_import_actions'); if(actions)actions.innerHTML='';
  renderExcelImportExtra();
};
window.handleExcelImportFile=async function(e){
  const file=e.target.files?.[0]; if(!file)return;
  if(typeof XLSX==='undefined'){alert('Excel লাইব্রেরি লোড হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।');return;}
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    if(!aoa.length){alert('ফাইলটি খালি।');return;}
    const headers=(aoa[0]||[]).map((h,i)=>String(h||`কলাম ${i+1}`).trim());
    const rows=aoa.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map(r=>headers.map((_,i)=>r[i]??''));
    excelImportState.headers=headers; excelImportState.rows=rows; excelImportState.fileName=file.name;
    document.getElementById('excel_import_status').innerHTML=`<b>✅ ${escapeHtml(file.name)}</b> — মোট <b>${toBn(rows.length)}</b>টি ডেটা রো পাওয়া গেছে।`;
    renderExcelMapping();
  }catch(err){console.error(err);alert('Excel/CSV পড়তে সমস্যা হয়েছে। ফাইলটি ঠিক আছে কি না দেখুন।');}
};
function renderExcelMapping(){
  const box=document.getElementById('excel_import_mapping'); if(!box)return;
  const type=excelImportState.type; let schema=[...(EXCEL_IMPORT_SCHEMAS[type]||[])];
  if(type==='exams'){
    const jid=document.getElementById('excel_default_jamaat')?.value||''; const j=data.jamaats.find(x=>x.id===jid); schema=schema.concat((j?.subjects||[]).map(sub=>[sub.id,sub.name,false]));
  }
  excelImportState.schema=schema;
  if(!excelImportState.mappings||Object.keys(excelImportState.mappings).length===0){schema.forEach(f=>excelImportState.mappings[f[0]]=autoImportMapping(f[0]));}
  box.innerHTML=`<div class="sub">🔗 কলাম ম্যাপিং</div><div style="font-size:11px;color:var(--muted);margin:4px 0 8px;">সিস্টেম যতটা সম্ভব নিজে কলাম মিলিয়েছে। ভুল হলে Dropdown থেকে ঠিক করে দিন।</div>`+
    schema.map(f=>`<div style="display:grid;grid-template-columns:1fr 1.2fr;gap:8px;align-items:center;margin-bottom:6px;"><div style="font-size:12px;">${escapeHtml(f[1])}</div><select data-import-field="${escapeHtml(f[0])}" onchange="setExcelImportMapping(this.dataset.importField,this.value)">${importColOptions(excelImportState.mappings[f[0]]||'')}</select></div>`).join('');
  renderExcelPreview();
}
window.setExcelImportMapping=function(field,value){ excelImportState.mappings[field]=value; renderExcelPreview(); };
window.renderExcelMapping=renderExcelMapping;
function getMapped(row,key){ const idx=excelImportState.mappings?.[key]; return idx===''||idx==null?'':row[Number(idx)]; }
function findStudentByImport(row){
  const roll=String(getMapped(row,'roll')??'').trim(); const name=String(getMapped(row,'studentName')||getMapped(row,'name')||'').trim(); const jid=getMapped(row,'jamaat')||document.getElementById('excel_default_jamaat')?.value||'';
  let candidates=data.students.filter(s=>!jid||s.jamaatId===jid);
  if(roll){ const byRoll=candidates.find(s=>String(s.roll).trim()===roll); if(byRoll)return byRoll; }
  if(name){ const n=name.replace(/\s+/g,'').toLowerCase(); const byName=candidates.find(s=>String(s.name).replace(/\s+/g,'').toLowerCase()===n); if(byName)return byName; }
  return null;
}
function findJamaatForImport(row){
  const raw=String(getMapped(row,'jamaat')||'').trim(); const def=document.getElementById('excel_default_jamaat')?.value||'';
  if(def)return data.jamaats.find(j=>j.id===def)||null;
  if(!raw)return null;
  const n=raw.replace(/\s+/g,'').toLowerCase(); return data.jamaats.find(j=>String(j.name).replace(/\s+/g,'').toLowerCase()===n) || data.jamaats.find(j=>String(j.name).toLowerCase().includes(raw.toLowerCase()));
}
function importPreviewRecord(row,i){
  const type=excelImportState.type; const issues=[]; let label=''; let action='যোগ হবে';
  if(type==='students'){
    const name=String(getMapped(row,'name')||'').trim(); const roll=String(getMapped(row,'roll')||'').trim(); const j=findJamaatForImport(row);
    if(!name)issues.push('নাম নেই'); if(!j)issues.push('জামাত মিলেনি');
    if(j&&roll&&data.students.some(s=>s.jamaatId===j.id&&String(s.roll)===roll)){issues.push('রোল আগে থেকেই আছে');action='স্কিপ হবে';}
    label=`${name||'—'} • রোল ${roll||'—'} • ${j?.name||'জামাত নেই'}`;
  } else if(type==='competition'){
    const st=findStudentByImport(row); const competition=String(getMapped(row,'competition')||'').trim(); const achievement=String(getMapped(row,'achievement')||'').trim();
    if(!st)issues.push('ছাত্র মেলেনি'); if(!competition)issues.push('প্রতিযোগিতার নাম নেই'); if(!achievement)issues.push('অর্জন নেই');
    label=`${st?.name||getMapped(row,'studentName')||'—'} • ${competition||'—'} • ${achievement||'—'}`;
  } else if(type==='board'){
    const name=String(getMapped(row,'name')||'').trim(); const board=String(getMapped(row,'board')||'').trim(); const division=String(getMapped(row,'division')||'').trim(); const year=String(getMapped(row,'year')||'').trim();
    if(!name)issues.push('নাম নেই'); if(!board)issues.push('প্রতিষ্ঠান/বোর্ড নেই'); if(!year)issues.push('সাল নেই'); label=`${name||'—'} • ${board||'—'} • ${division||'—'}`;
  } else if(type==='fees'){
    const st=findStudentByImport(row); const month=String(getMapped(row,'month')||'').trim(); const amount=Number(getMapped(row,'amount')||0);
    if(!st)issues.push('ছাত্র মেলেনি'); if(!/^\d{4}-\d{1,2}$/.test(month))issues.push('মাস YYYY-MM নয়'); if(isNaN(amount))issues.push('টাকার পরিমাণ ভুল'); label=`${st?.name||getMapped(row,'studentName')||'—'} • ${month||'—'} • ${amount}`;
  } else if(type==='exams'){
    const st=findStudentByImport(row); const j=data.jamaats.find(x=>x.id===document.getElementById('excel_default_jamaat')?.value); if(!st)issues.push('ছাত্র মেলেনি'); if(!j)issues.push('ডিফল্ট জামাত বাছাই করুন');
    label=`${st?.name||getMapped(row,'studentName')||'—'} • ${j?.name||'জামাত নেই'}`;
  }
  return {i,label,issues,action};
}
function renderExcelPreview(){
  const box=document.getElementById('excel_import_preview'); const actions=document.getElementById('excel_import_actions'); if(!box)return;
  if(!excelImportState.rows?.length){box.innerHTML=''; if(actions)actions.innerHTML=''; return;}
  const previews=excelImportState.rows.slice(0,20).map(importPreviewRecord); const bad=excelImportState.rows.map(importPreviewRecord).filter(x=>x.issues.length).length;
  box.innerHTML=`<div class="sub">👀 প্রিভিউ</div><div style="font-size:12px;margin-bottom:8px;"><b>মোট ${toBn(excelImportState.rows.length)}টি</b> রেকর্ড। ${bad?`<span style="color:var(--red);">⚠️ ${toBn(bad)}টিতে সমস্যা আছে</span>`:'<span style="color:var(--green-deep);">✅ সব রেকর্ড প্রস্তুত</span>'}</div><div style="max-height:320px;overflow:auto;border:1px solid rgba(18,73,46,.12);border-radius:10px;"><table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr style="background:var(--gold-light);"><th style="padding:7px;">রো</th><th style="padding:7px;text-align:right;">ডেটা</th><th style="padding:7px;">অবস্থা</th></tr></thead><tbody>${previews.map(x=>`<tr style="border-top:1px solid rgba(18,73,46,.08);"><td style="padding:7px;text-align:center;">${toBn(x.i+2)}</td><td style="padding:7px;text-align:right;">${escapeHtml(x.label)}</td><td style="padding:7px;text-align:center;color:${x.issues.length?'var(--red)':'var(--green-deep)'};">${x.issues.length?'⚠️ '+escapeHtml(x.issues.join(', ')):'✅ যোগ হবে'}</td></tr>`).join('')}</tbody></table></div>`;
  if(actions)actions.innerHTML=`<button class="btn gold" onclick="confirmExcelImport()">✅ নিশ্চিত করুন ও ডেটাবেজে যোগ করুন</button><button class="btn outline" onclick="downloadExcelTemplate()" style="margin-top:8px;">📄 টেমপ্লেট কলামের নমুনা দেখুন</button>`;
}
window.downloadExcelTemplate=function(){
  if(typeof XLSX==='undefined')return;
  const type=excelImportState.type; let headers=[];
  if(type==='exams'){ const j=data.jamaats.find(x=>x.id===document.getElementById('excel_default_jamaat')?.value); headers=['ছাত্রের নাম','রোল',...(j?.subjects||[]).map(s=>s.name)]; }
  else headers=(EXCEL_IMPORT_SCHEMAS[type]||[]).map(x=>x[1].replace(' *',''));
  const ws=XLSX.utils.aoa_to_sheet([headers]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Template'); XLSX.writeFile(wb,`madrasa_${type}_template.xlsx`);
};
function asImportDate(v){ if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10); return String(v??'').trim(); }
window.confirmExcelImport=async function(){
  if(!isAdminUnlocked()){alert('শুধু অ্যাডমিন Excel Import করতে পারবেন।');return;}
  if(!excelImportState.rows.length){alert('আগে একটি Excel/CSV ফাইল নির্বাচন করুন।');return;}
  const type=excelImportState.type; let added=0, skipped=0, failed=0;
  if(type==='students'){
    for(const row of excelImportState.rows){
      const name=String(getMapped(row,'name')||'').trim(); const rollRaw=String(getMapped(row,'roll')||'').trim(); const j=findJamaatForImport(row);
      if(!name||!j){failed++;continue;} const roll=Number(rollRaw)||((data.students.filter(s=>s.jamaatId===j.id).reduce((m,s)=>Math.max(m,Number(s.roll)||0),0))+1);
      if(data.students.some(s=>s.jamaatId===j.id&&String(s.roll)===String(roll))){skipped++;continue;}
      data.students.push({id:'s_'+Date.now()+'_'+added,studentId:generateStudentId(),jamaatId:j.id,name,roll,dob:asImportDate(getMapped(row,'dob')),birthReg:'',admissionDate:asImportDate(getMapped(row,'admissionDate'))||todayISO(),monthlyFee:Number(getMapped(row,'monthlyFee'))||0,fatherName:String(getMapped(row,'fatherName')||'').trim(),fatherOccupation:'',motherName:String(getMapped(row,'motherName')||'').trim(),motherOccupation:'',guardianMobile:String(getMapped(row,'guardianMobile')||'').trim(),guardianNID:String(getMapped(row,'guardianNID')||'').trim(),division:String(getMapped(row,'division')||'').trim(),district:String(getMapped(row,'district')||'').trim(),thana:String(getMapped(row,'thana')||'').trim(),village:String(getMapped(row,'village')||'').trim()}); added++;
    }
  } else if(type==='board'){
    data.boardResults=data.boardResults||[];
    for(const row of excelImportState.rows){ const name=String(getMapped(row,'name')||'').trim(),board=String(getMapped(row,'board')||'').trim(),division=String(getMapped(row,'division')||'').trim(),year=String(getMapped(row,'year')||'').trim(); if(!name||!board||!year){failed++;continue;} const st=findStudentByImport(row); data.boardResults.unshift({id:'br_'+Date.now()+'_'+added,studentId:st?st.id:'',name,board,division,year,father:String(getMapped(row,'father')||'').trim(),address:String(getMapped(row,'address')||'').trim(),roll:String(getMapped(row,'roll')||'').trim(),marhala:String(getMapped(row,'marhala')||'').trim(),avgMark:String(getMapped(row,'avgMark')||'').trim(),meritRank:String(getMapped(row,'meritRank')||'').trim()});added++; }
  } else if(type==='competition'){
    data.competitionResults=data.competitionResults||[];
    for(const row of excelImportState.rows){ const st=findStudentByImport(row); const competition=String(getMapped(row,'competition')||'').trim(),achievement=String(getMapped(row,'achievement')||'').trim(),category=String(getMapped(row,'category')||'').trim(),year=String(getMapped(row,'year')||'').trim(); if(!st||!competition||!achievement||!category||!year){failed++;continue;} const j=data.jamaats.find(x=>x.id===st.jamaatId); data.competitionResults.unshift({id:'cr_'+Date.now()+'_'+added,studentId:st.id,studentName:st.name,roll:st.roll,jamaatId:st.jamaatId,jamaatName:j?.name||'',competition,category,year,achievement,organizer:String(getMapped(row,'organizer')||'').trim(),location:String(getMapped(row,'location')||'').trim(),description:String(getMapped(row,'description')||'').trim(),createdAt:Date.now()});added++; }
  } else if(type==='fees'){
    data.feePayments=data.feePayments||{};
    for(const row of excelImportState.rows){ const st=findStudentByImport(row),month=String(getMapped(row,'month')||'').trim(),amount=Number(getMapped(row,'amount')||0); if(!st||!/^[0-9]{4}-[0-9]{1,2}$/.test(month)||isNaN(amount)){failed++;continue;} const ym=month.split('-'); const m=ym[0]+'-'+String(Number(ym[1])).padStart(2,'0'); if(!data.feePayments[m])data.feePayments[m]={}; const fee=Number(st.monthlyFee)||0; let status=String(getMapped(row,'status')||'').trim(); if(!status)status=(fee===0||amount>=fee)?'paid':amount>0?'partial':'due'; data.feePayments[m][st.id]={amount,status}; added++; }
  } else if(type==='exams'){
    const jid=document.getElementById('excel_default_jamaat')?.value||''; const year=String(document.getElementById('excel_default_year')?.value||new Date().getFullYear()).trim(); const examType=document.getElementById('excel_default_exam')?.value||'annual'; const j=data.jamaats.find(x=>x.id===jid); if(!j){alert('ডিফল্ট জামাত নির্বাচন করুন।');return;} if(!data.examResults[year])data.examResults[year]={}; if(!data.examResults[year][examType])data.examResults[year][examType]={}; const results=data.examResults[year][examType];
    for(const row of excelImportState.rows){ const st=findStudentByImport(row); if(!st||st.jamaatId!==jid){failed++;continue;} if(!results[st.id])results[st.id]={}; let any=false; (j.subjects||[]).forEach(sub=>{const v=getMapped(row,sub.id); if(v!==''&&v!=null){results[st.id][sub.id]=Number(v)||0;any=true;}}); if(any)added++; else failed++; }
  }
  await saveData();
  populateBranchSelect(); renderHomeSummary(); renderNoticeBoard();
  if(typeof renderCompetitionResults==='function') renderCompetitionResults();
  if(typeof renderBoardResults==='function') renderBoardResults();
  alert(`ইমপোর্ট সম্পন্ন।\n\n✅ যোগ হয়েছে: ${toBn(added)}\n🟡 স্কিপ হয়েছে: ${toBn(skipped)}\n🔴 সমস্যার কারণে বাদ: ${toBn(failed)}`);
  closeModal();
};

// ---------- Modals ----------
window.openModal = function(type){
  const bg = document.getElementById('modalBg');
  const content = document.getElementById('modalContent');
  bg.classList.add('show');

  if(type==='addStudent' || type==='editStudent'){
    const editing = type==='editStudent';
    const isTeacher = !!currentTeacherUid;
    const s = editing ? data.students.find(x=>x.id===modalStudentId) : null;
    const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
    const nextRoll = myStudents.length ? Math.max(...myStudents.map(s=>s.roll))+1 : 1;

    if(isTeacher){
      // শিক্ষক শুধু নাম দিতে পারবেন — বাকি সম্পূর্ণ তথ্য এডমিন পরে যোগ করবেন
      content.innerHTML = `
        <span class="modal-close" onclick="closeModal()">✕</span>
        <h3>${editing ? 'ছাত্রের নাম এডিট' : 'নতুন ছাত্র যোগ করুন'}</h3>
        <div class="field"><label>ছাত্রের পূর্ণ নাম *</label><input type="text" id="m_sname" placeholder="যেমনঃ মোঃ রাহাত" value="${s?.name||''}" autofocus></div>
        ${!editing ? `<div style="font-size:12px; color:var(--muted); margin:-4px 0 10px;">রোল নম্বর ও বাকি তথ্য (জন্ম তারিখ, অভিভাবক, ঠিকানা ইত্যাদি) এডমিন পরে যোগ করে দেবেন।</div>` : ''}
        <button class="btn" onclick="${editing ? `submitEditStudent('${s.id}')` : 'submitAddStudent()'}">${editing ? 'সংরক্ষণ করুন' : 'যোগ করুন'}</button>
      `;
      const f = document.getElementById('m_sname');
      f?.focus();
      return;
    }

    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>${editing ? 'ছাত্রের তথ্য এডিট' : 'নতুন ছাত্র যোগ করুন'}</h3>
      ${editing ? `<div style="background:var(--gold-light); border-radius:10px; padding:8px 12px; margin-bottom:10px; font-size:13px;"><b>ছাত্র আইডি:</b> ${s.studentId||'—'}</div>` : ''}
      <div class="sub">মৌলিক পরিচিতি</div>
      <div class="field"><label>ছাত্রের পূর্ণ নাম *</label><input type="text" id="m_sname" placeholder="যেমনঃ মোঃ রাহাত" value="${s?.name||''}" autofocus></div>
      <div class="field"><label>রোল নম্বর *</label><input type="number" id="m_sroll" value="${s?.roll ?? nextRoll}"></div>
      <div class="field"><label>জন্ম তারিখ</label><input type="date" id="m_sdob" value="${s?.dob||''}"></div>
      <div class="field"><label>জন্ম নিবন্ধন নং (ঐচ্ছিক)</label><input type="text" id="m_sbirthreg" value="${s?.birthReg||''}"></div>
      <div class="field"><label>ভর্তির তারিখ</label><input type="date" id="m_sadmdate" value="${s?.admissionDate||todayISO()}"></div>
      <div class="field"><label>মাসিক বেতন (টাকা)</label><input type="number" id="m_sfee" min="0" value="${s?.monthlyFee ?? ''}" placeholder="যেমনঃ 500"></div>

      <div class="sub" style="margin-top:16px;">অভিভাবক তথ্য</div>
      <div class="field"><label>পিতার নাম</label><input type="text" id="m_father" value="${s?.fatherName||''}"></div>
      <div class="field"><label>পিতার পেশা</label><input type="text" id="m_fatherjob" value="${s?.fatherOccupation||''}"></div>
      <div class="field"><label>মাতার নাম</label><input type="text" id="m_mother" value="${s?.motherName||''}"></div>
      <div class="field"><label>মাতার পেশা</label><input type="text" id="m_motherjob" value="${s?.motherOccupation||''}"></div>
      <div class="field"><label>অভিভাবকের মোবাইল নম্বর</label><input type="text" id="m_guardmobile" value="${s?.guardianMobile||''}"></div>
      <div class="field"><label>অভিভাবকের এনআইডি নম্বর</label><input type="text" id="m_guardnid" value="${s?.guardianNID||''}"></div>

      <div class="sub" style="margin-top:16px;">ঠিকানা</div>
      <div class="field"><label>বিভাগ</label><select id="m_division" onchange="onModalDivisionChange()"><option value="">লোড হচ্ছে...</option></select></div>
      <div class="field"><label>জেলা</label><select id="m_district" onchange="onModalDistrictChange()" disabled><option value="">— আগে বিভাগ বাছাই করুন —</option></select></div>
      <div class="field"><label>থানা/উপজেলা</label><select id="m_thana" disabled><option value="">— আগে জেলা বাছাই করুন —</option></select></div>
      <div class="field"><label>গ্রাম/এলাকা</label><input type="text" id="m_village" value="${s?.village||''}"></div>

      <button class="btn" onclick="${editing ? `submitEditStudent('${s.id}')` : 'submitAddStudent()'}">${editing ? 'সংরক্ষণ করুন' : 'যোগ করুন'}</button>
      ${editing ? `<button class="btn outline" style="color:var(--red); border-color:var(--red);" onclick="deleteStudent('${s.id}')">🗑️ এই ছাত্র মুছে ফেলুন</button>` : ''}
    `;
    // populate division/district/thana once geo data ready
    const divSel = document.getElementById('m_division');
    const distSel = document.getElementById('m_district');
    const thanaSel = document.getElementById('m_thana');
    const tryFill = () => {
      if(bdDivisions.length && bdDistricts.length){
        populateDivisionSelect(divSel, s?.division || '');
        if(s?.division){ populateDistrictSelect(distSel, s.division, s?.district || ''); }
        if(s?.district){ populateThanaSelect(thanaSel, s.district, s?.thana || ''); }
      } else {
        setTimeout(tryFill, 300);
      }
    };
    tryFill();
  }
  else if(type==='addJamaat'){
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>নতুন জামাত/শ্রেণি যোগ করুন</h3>
      <div class="field"><label>জামাতের নাম</label><input type="text" id="m_j_name" placeholder="যেমনঃ ৬ষ্ঠ শ্রেণি" autocomplete="off"></div>
      <div class="field"><label>শিক্ষকের নাম (ঐচ্ছিক)</label><input type="text" id="m_j_teacher" placeholder="যেমনঃ মাওলানা করিম"></div>
      <button class="btn" onclick="submitAddJamaat()">যোগ করুন</button>
    `;
  }
  else if(type==='editJamaat'){
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>জামাত ও শিক্ষক এডিট করুন</h3>
      <div class="sub">নাম পরিবর্তন করুন অথবা মুছে ফেলুন</div>
      <div id="editJamaatList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
    `;
    renderEditJamaatList();
  }
  else if(type==='addSubject'){
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>নতুন বিষয় যোগ করুন</h3>
      <div class="sub">এই জামাতের জন্য বিষয় যুক্ত হবে</div>
      <div class="field"><label>বিষয়ের নাম</label><input type="text" id="m_subname" placeholder="যেমনঃ কুরআন, আকাইদা, গণিত" autofocus></div>
      <button class="btn" onclick="submitAddSubject()">যোগ করুন</button>
    `;
  }
  else if(type==='editSubjects'){
    const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
    const subjects = jamaat.subjects || [];
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>বিষয় এডিট করুন</h3>
      <div class="sub">নাম পরিবর্তন করুন অথবা মুছে ফেলুন</div>
      <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
        ${subjects.length===0 ? '<div class="empty" style="padding:20px;">কোনো বিষয় নেই।</div>' : subjects.map(sub=>`
          <div class="citem" style="padding:10px 12px;">
            <input type="text" value="${sub.name}" onchange="updateSubjectName('${sub.id}', this.value)" style="flex:1; border:none; background:transparent; font-weight:700; font-size:14px;">
            <button class="icon-btn del" onclick="deleteSubject('${sub.id}')">✕</button>
          </div>
        `).join('')}
      </div>
    `;
  }
  else if(type==='manageNotice'){
    const notices = data.notices || [];
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>📢 নোটিশ পরিচালনা</h3>
      <div class="sub">এখানে যা লিখবেন সবাই (শিক্ষক/অভিভাবক) হোমপেজে দেখতে পাবেন</div>
      <div class="field"><label>নতুন নোটিশ লিখুন</label><textarea id="m_notice_text" rows="3" placeholder="যেমনঃ আগামীকাল ছুটি থাকবে" style="width:100%; padding:10px; border-radius:10px; border:1px solid rgba(18,73,46,0.15); font-family:inherit; font-size:14px;"></textarea></div>
      <button class="btn" onclick="submitAddNotice()">➕ নোটিশ যোগ করুন</button>
      <div class="sub" style="margin-top:16px;">বিদ্যমান নোটিশসমূহ</div>
      <div id="noticeManageList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
    `;
    renderNoticeManageList();
  }
  else if(type==='manageHoliday'){
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>🏖️ ছুটি ব্যবস্থাপনা</h3>
      <div class="sub">সরকারি ছুটি, ঈদের ছুটি বা মাদ্রাসার নিজস্ব ছুটি যোগ করুন — ঐ তারিখে হোমপেজে ছুটির নাম দেখাবে, ১০০% উপস্থিতি দেখাবে না</div>
      <div class="field"><label>ছুটির নাম</label><input type="text" id="m_holiday_name" placeholder="যেমনঃ ঈদুল আযহার ছুটি"></div>
      <div class="field"><label>শুরুর তারিখ</label><input type="date" id="m_holiday_start"></div>
      <div class="field"><label>শেষ তারিখ (একদিনের ছুটি হলে খালি রাখুন)</label><input type="date" id="m_holiday_end"></div>
      <button class="btn" onclick="submitAddHoliday()">➕ ছুটি যোগ করুন</button>
      <div class="sub" style="margin-top:16px;">বিদ্যমান ছুটিসমূহ</div>
      <div id="holidayManageList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
    `;
    renderHolidayManageList();
  }
  else if(type==='addBoardResult'){
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>🏆 বোর্ড পরীক্ষার সাফল্য</h3>
      <div class="sub">নতুন সাফল্য যোগ করুন, অথবা নিচের তালিকা থেকে এডিট/মুছুন।</div>
      <button class="btn gold" onclick="openModal('addBoardResultForm')">➕ নতুন সাফল্য যোগ করুন</button>
      <div class="sub" style="margin-top:16px;">বিদ্যমান তালিকা</div>
      <div id="boardResultManageList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
    `;
    renderBoardResultManageList();
  }
  else if(type==='addBoardResultForm' || type==='editBoardResult'){
    const editId=(type==='editBoardResult' ? (window.__editBoardResultId||null) : null);
    const x=editId?(data.boardResults||[]).find(r=>r.id===editId):null;
    const divOpts = boardResultDivisions.map(d=>`<option value="${d}" ${x?.division===d?'selected':''}>${d}</option>`).join('');
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>${x?'✏️ সাফল্য এডিট':'🏆 নতুন সাফল্য যোগ করুন'}</h3>
      <div class="field"><label>পরীক্ষার্থীর নাম *</label><input type="text" id="m_br_name" value="${escapeHtml(x?.name||'')}" placeholder="যেমনঃ মোঃ রাহাত"></div>
      <div class="field"><label>পিতার নাম</label><input type="text" id="m_br_father" value="${escapeHtml(x?.father||'')}" placeholder="ঐচ্ছিক"></div>
      <div class="field"><label>ঠিকানা</label><input type="text" id="m_br_address" value="${escapeHtml(x?.address||'')}" placeholder="ঐচ্ছিক"></div>
      <div class="field"><label>মারহালা</label><input type="text" id="m_br_marhala" value="${escapeHtml(x?.marhala||'')}" placeholder="যেমনঃ হিফজ তাকমিল" autocomplete="off"></div>
      <div class="field"><label>প্রতিষ্ঠান/বোর্ডের নাম *</label><input type="text" id="m_br_board" value="${escapeHtml(x?.board||'')}" placeholder="যেমনঃ আয়াদ হীনী এদারায়ে তালীম বাংলাদেশ"></div>
      <div class="field"><label>রোল নং</label><input type="text" id="m_br_roll" value="${escapeHtml(x?.roll||'')}"></div>
      <div class="field"><label>পরীক্ষার সাল *</label><select id="m_br_year">${boardYearOptions(x?.year||new Date().getFullYear())}</select></div>
      <div class="field"><label>গড় মার্ক</label><input type="text" id="m_br_avgmark" value="${escapeHtml(x?.avgMark||'')}" placeholder="যেমনঃ ৮৫.৫"></div>
      <div class="field"><label>বিভাগ *</label><select id="m_br_division"><option value="">— বাছাই করুন —</option>${divOpts}</select></div>
      <div class="field"><label>মেধা ক্রম</label><input type="text" id="m_br_meritrank" value="${escapeHtml(x?.meritRank||'')}" placeholder="যেমনঃ ৩য়"></div>
      <button class="btn" onclick="submitAddBoardResult(${x?`'${x.id}'`:'null'})">${x?'💾 পরিবর্তন সংরক্ষণ':'➕ যোগ করুন'}</button>
    `;
  }
  else if(type==='manageCompetition'){
    content.innerHTML=`<span class="modal-close" onclick="closeModal()">✕</span><h3>🏆 প্রতিযোগিতার সাফল্য</h3><div class="sub">নতুন সাফল্য যোগ করুন, অথবা নিচের তালিকা থেকে এডিট/মুছুন।</div><button class="btn gold" onclick="openModal('addCompetition')">➕ নতুন সাফল্য যোগ করুন</button><div class="sub" style="margin-top:16px;">বিদ্যমান সাফল্য</div><div id="competitionManageList" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;"></div>`;
    renderCompetitionManageList();
  }
  else if(type==='addCompetition' || type==='editCompetition'){
    const editId=(type==='editCompetition' ? (window.__editCompetitionId||null) : null); const x=editId?(data.competitionResults||[]).find(r=>r.id===editId):null;
    const cats=competitionCategories.map(c=>`<option value="${escapeHtml(c)}" ${x?.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('');
    content.innerHTML=`<span class="modal-close" onclick="closeModal()">✕</span><h3>${x?'✏️ প্রতিযোগিতার সাফল্য এডিট':'🏆 নতুন প্রতিযোগিতার সাফল্য'}</h3>
      <div class="field"><label>ছাত্র *</label><select id="m_cr_student">${competitionStudentOptions(x?.studentId||'')}</select></div>
      <div class="field"><label>প্রতিযোগিতার নাম *</label><input id="m_cr_competition" value="${escapeHtml(x?.competition||'')}" placeholder="যেমনঃ জাতীয় ক্বেরাত প্রতিযোগিতা"></div>
      <div class="field"><label>প্রতিযোগিতার ধরন *</label><select id="m_cr_category"><option value="">— বাছাই করুন —</option>${cats}</select></div>
      <div class="field"><label>সাল *</label><select id="m_cr_year">${competitionYearOptions(x?.year||new Date().getFullYear())}</select></div>
      <div class="field"><label>অর্জন/অবস্থান *</label><input id="m_cr_achievement" value="${escapeHtml(x?.achievement||'')}" placeholder="যেমনঃ ১ম স্থান / চ্যাম্পিয়ন"></div>
      <div class="field"><label>আয়োজক প্রতিষ্ঠান</label><input id="m_cr_organizer" value="${escapeHtml(x?.organizer||'')}" placeholder="ঐচ্ছিক"></div>
      <div class="field"><label>স্থান</label><input id="m_cr_location" value="${escapeHtml(x?.location||'')}" placeholder="যেমনঃ ঢাকা"></div>
      <div class="field"><label>বিবরণ</label><textarea id="m_cr_description" rows="3" placeholder="সংক্ষিপ্ত বিবরণ" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(18,73,46,0.15);font-family:inherit;font-size:14px;">${escapeHtml(x?.description||'')}</textarea></div>
      <button class="btn" onclick="submitCompetitionResult(${x?`'${x.id}'`:'null'})">${x?'💾 পরিবর্তন সংরক্ষণ':'➕ সাফল্য যোগ করুন'}</button>`;
  }
  else if(type==='oldStudentJamaat'){
    const jopts = data.jamaats.map(j=>`<option value="${j.id}">${j.name}</option>`).join('');
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>➕ পুরাতন ছাত্র যুক্ত করুন</h3>
      <div class="sub">কোন মারহালায় ছাত্র যুক্ত করবেন বাছাই করুন</div>
      <div class="field"><label>মারহালা/জামাত</label><select id="m_old_jamaat">${jopts}</select></div>
      <button class="btn" onclick="goAddOldStudent()">পরবর্তী ধাপ</button>
    `;
  }
  else if(type==='excelImport'){
    content.innerHTML = `
      <span class="modal-close" onclick="closeModal()">✕</span>
      <h3>📥 এক্সেল থেকে ডেটা ইমপোর্ট</h3>
      <div class="sub">কম্পিউটার বা মোবাইল থেকে .xlsx / .xls / .csv ফাইল নির্বাচন করুন। ফাইল ব্রাউজারেই পড়া হবে; সার্ভারে Excel ফাইল আপলোড করা হবে না।</div>
      <div class="field"><label>কোন ধরনের ডেটা ইমপোর্ট করবেন?</label>
        <select id="excel_import_type" onchange="resetExcelImportType()">
          <option value="students">👨‍🎓 ছাত্রদের তথ্য</option>
          <option value="exams">📋 পরীক্ষার ফলাফল</option>
          <option value="board">🏆 বোর্ড পরীক্ষার সাফল্য</option>
          <option value="competition">🎖️ প্রতিযোগিতার সাফল্য</option>
          <option value="fees">💰 বেতন/ফি</option>
        </select>
      </div>
      <div id="excel_import_extra"></div>
      <div class="field"><label>Excel/CSV ফাইল</label><input type="file" id="excel_import_file" accept=".xlsx,.xls,.csv" onchange="handleExcelImportFile(event)"></div>
      <div id="excel_import_status" style="margin-top:8px;font-size:12px;color:var(--muted);"></div>
      <div id="excel_import_mapping" style="margin-top:12px;"></div>
      <div id="excel_import_preview" style="margin-top:12px;"></div>
      <div id="excel_import_actions" style="margin-top:12px;"></div>
    `;
    renderExcelImportExtra();
  }
  const f = document.getElementById('m_sname') || document.getElementById('m_j_name') || document.getElementById('m_subname');
  f?.focus();
}

window.submitAddSubject = async function(){
  const name = document.getElementById('m_subname').value.trim();
  if(!name) return;
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  if(!jamaat.subjects) jamaat.subjects = [];
  jamaat.subjects.push({id:'sub_'+Date.now(), name});
  await saveData();
  closeModal();
  renderExamTable();
}
window.updateSubjectName = async function(subId, val){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  const sub = jamaat.subjects.find(s=>s.id===subId);
  if(sub){ sub.name = val.trim() || sub.name; await saveData(); renderExamTable(); }
}
window.deleteSubject = async function(subId){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  jamaat.subjects = jamaat.subjects.filter(s=>s.id!==subId);
  await saveData();
  closeModal();
  renderExamTable();
}
window.closeModal = function(){ document.getElementById('modalBg').classList.remove('show'); }
document.getElementById('modalBg').addEventListener('click', e=>{ if(e.target.id==='modalBg') closeModal(); });

let modalStudentId = null;

// শিক্ষকের সংক্ষিপ্ত ফর্মে শুধু নাম (এবং কখনো কখনো রোল) থাকে, বাকি ফিল্ড DOM-এ থাকে না —
// সেক্ষেত্রে existing (এডিট হলে) বা fallbackRoll (নতুন ছাত্র হলে) থেকে মান নেওয়া হয়,
// যাতে এডমিনের দেওয়া তথ্য মুছে না যায়।
function readStudentForm(existing, fallbackRoll){
  const g = id => document.getElementById(id);
  const rollEl = g('m_sroll');
  return {
    name: g('m_sname').value.trim(),
    roll: rollEl ? (Number(rollEl.value) || 1) : (existing?.roll ?? fallbackRoll ?? 1),
    dob: g('m_sdob')?.value ?? existing?.dob ?? '',
    birthReg: g('m_sbirthreg')?.value.trim() ?? existing?.birthReg ?? '',
    admissionDate: g('m_sadmdate')?.value ?? existing?.admissionDate ?? todayISO(),
    monthlyFee: g('m_sfee') ? (Number(g('m_sfee').value) || 0) : (existing?.monthlyFee ?? 0),
    fatherName: g('m_father')?.value.trim() ?? existing?.fatherName ?? '',
    fatherOccupation: g('m_fatherjob')?.value.trim() ?? existing?.fatherOccupation ?? '',
    motherName: g('m_mother')?.value.trim() ?? existing?.motherName ?? '',
    motherOccupation: g('m_motherjob')?.value.trim() ?? existing?.motherOccupation ?? '',
    guardianMobile: g('m_guardmobile')?.value.trim() ?? existing?.guardianMobile ?? '',
    guardianNID: g('m_guardnid')?.value.trim() ?? existing?.guardianNID ?? '',
    division: g('m_division')?.value ?? existing?.division ?? '',
    district: g('m_district')?.value ?? existing?.district ?? '',
    thana: g('m_thana')?.value ?? existing?.thana ?? '',
    village: g('m_village')?.value.trim() ?? existing?.village ?? ''
  };
}

window.onModalDivisionChange = function(){
  const divisionId = document.getElementById('m_division').value;
  const distSel = document.getElementById('m_district');
  const thanaSel = document.getElementById('m_thana');
  populateDistrictSelect(distSel, divisionId, '');
  populateThanaSelect(thanaSel, '', ''); // reset thana until district chosen
}
window.onModalDistrictChange = function(){
  const districtId = document.getElementById('m_district').value;
  const thanaSel = document.getElementById('m_thana');
  populateThanaSelect(thanaSel, districtId, '');
}

function generateStudentId(){
  const year = new Date().getFullYear();
  const count = data.students.length + 1;
  return 'AKQ-' + year + '-' + String(count).padStart(3,'0');
}

window.submitAddStudent = async function(){
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  const nextRoll = myStudents.length ? Math.max(...myStudents.map(s=>s.roll))+1 : 1;
  const form = readStudentForm(null, nextRoll);
  if(!form.name) return;
  const newStudent = {id:'s_'+Date.now(), studentId:'', jamaatId: state.jamaatId, ...form};
  data.students.push(newStudent);
  await saveData();                       // সার্ভার ডুপ্লিকেট-মুক্ত আইডি (AKQ-…) দিয়ে newStudent.studentId বসিয়ে দেয়
  closeModal();
  renderStudentList();
  showStudentIdPopup(form.name, newStudent.studentId || '—');
}
function showStudentIdPopup(name, studentId){
  const bg = document.getElementById('modalBg');
  const content = document.getElementById('modalContent');
  bg.classList.add('show');
  content.innerHTML = `
    <span class="modal-close" onclick="closeModal()">✕</span>
    <h3>✅ ${name} যোগ হয়েছে</h3>
    <div class="sub">এই আইডিটা অভিভাবককে দিন — অভিভাবক অ্যাপে লগইন করার সময় এটা লাগবে</div>
    <div style="background:var(--gold-light); border-radius:14px; padding:18px; text-align:center; margin-top:14px;">
      <div style="font-size:11px; color:var(--muted); font-weight:700;">ছাত্র আইডি</div>
      <div style="font-family:'Baloo Da 2'; font-size:26px; color:var(--green-deep); letter-spacing:1px; margin-top:4px;">${studentId}</div>
    </div>
    <button class="btn" onclick="closeModal()">ঠিক আছে</button>
  `;
}

window.submitEditStudent = async function(id){
  const s = data.students.find(x=>x.id===id);
  const form = readStudentForm(s);
  if(!form.name) return;
  Object.assign(s, form);
  await saveData();
  closeModal();
  renderStudentList();
}

window.deleteStudent = async function(id){
  data.students = data.students.filter(s=>s.id!==id);
  // also clean exam results referencing this student (সব বছর, সব পরীক্ষা)
  Object.keys(data.examResults||{}).forEach(year=>{
    Object.keys(data.examResults[year]||{}).forEach(examType=>{
      if(data.examResults[year][examType][id]) delete data.examResults[year][examType][id];
    });
  });
  await saveData();
  closeModal();
  renderStudentList();
}

window.openEditStudent = function(id){
  modalStudentId = id;
  openModal('editStudent');
}

// ---------- Report ----------
window.openReport = function(){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  showScreen('screen-report', jamaat.name+' — রিপোর্ট', 'হাজিরার হিস্ট্রি দেখুন', true);
  document.getElementById('rep_date').value = todayISO();
  const now = new Date();
  document.getElementById('rep_month').value = now.toISOString().slice(0,7);
  switchReportTab('date');
}
window.switchReportTab = function(tab){
  document.getElementById('repTabDate').style.background = tab==='date' ? 'var(--green)' : 'var(--white)';
  document.getElementById('repTabDate').style.color = tab==='date' ? 'white' : 'var(--green-deep)';
  document.getElementById('repTabMonth').style.background = tab==='month' ? 'var(--green)' : 'var(--white)';
  document.getElementById('repTabMonth').style.color = tab==='month' ? 'white' : 'var(--green-deep)';
  document.getElementById('reportDateView').style.display = tab==='date' ? 'block' : 'none';
  document.getElementById('reportMonthView').style.display = tab==='month' ? 'block' : 'none';
  if(tab==='date') renderDateReport(); else renderMonthReport();
}
let dateReportFilter = 'all'; // 'all' | 'present' | 'absent'
window.renderDateReport = function(){
  const date = document.getElementById('rep_date').value;
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId).sort((a,b)=>a.roll-b.roll);
  const rec = data.attendance[date] || {};
  const container = document.getElementById('reportDateList');
  if(myStudents.length===0){ container.innerHTML = `<div class="empty">এই জামাতে ছাত্র নেই।</div>`; return; }
  let present=0, absent=0;
  myStudents.forEach(s=>{
    const status = rec[s.id] || 'present';
    if(status==='present') present++; else absent++;
  });
  const filtered = myStudents.filter(s=>{
    const status = rec[s.id] || 'present';
    if(dateReportFilter==='present') return status==='present';
    if(dateReportFilter==='absent') return status==='absent';
    return true;
  });
  const rows = filtered.map(s=>{
    const status = rec[s.id] || 'present';
    return `<div class="srow"><div class="sname"><span class="roll">${s.roll}</span> ${s.name}</div>
      <span style="font-weight:700; font-size:12.5px; color:${status==='present'?'var(--green-deep)':'var(--red)'}">${status==='present'?'উপস্থিত':'অনুপস্থিত'}</span></div>`;
  }).join('');
  const activeStyle = (f) => dateReportFilter===f ? 'box-shadow: 0 0 0 2px var(--gold) inset;' : '';
  container.innerHTML = `
    <div class="stat-row" style="margin-bottom:12px;">
      <div class="stat" style="cursor:pointer; ${activeStyle('all')}" onclick="setDateReportFilter('all')"><div class="n">${myStudents.length}</div><div class="l">মোট</div></div>
      <div class="stat" style="cursor:pointer; ${activeStyle('present')}" onclick="setDateReportFilter('present')"><div class="n" style="color:var(--green-deep)">${present}</div><div class="l">উপস্থিত</div></div>
      <div class="stat absent" style="cursor:pointer; ${activeStyle('absent')}" onclick="setDateReportFilter('absent')"><div class="n">${absent}</div><div class="l">অনুপস্থিত</div></div>
    </div>${rows || '<div class="empty">এই তালিকায় কেউ নেই।</div>'}`;
}
window.setDateReportFilter = function(f){
  dateReportFilter = f;
  renderDateReport();
}
window.renderMonthReport = function(){
  const month = document.getElementById('rep_month').value; // YYYY-MM
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId).sort((a,b)=>a.roll-b.roll);
  const container = document.getElementById('reportMonthList');
  if(!month || myStudents.length===0){ container.innerHTML = `<div class="empty">তথ্য নেই।</div>`; return; }
  const dates = Object.keys(data.attendance).filter(d=>d.startsWith(month) && !isFriday(d));
  const rows = myStudents.map(s=>{
    let present=0, absent=0;
    dates.forEach(d=>{
      const st = data.attendance[d][s.id];
      if(st==='absent') absent++; else if(d in data.attendance && s.id in data.attendance[d]) present++;
    });
    return `<div class="srow"><div class="sname"><span class="roll">${s.roll}</span> ${s.name}</div>
      <span style="font-size:12.5px;"><span style="color:var(--green-deep); font-weight:700;">${present}</span> উপস্থিত • <span style="color:var(--red); font-weight:700;">${absent}</span> অনুপস্থিত</span></div>`;
  }).join('');
  container.innerHTML = rows || `<div class="empty">এই মাসে কোনো হাজিরার রেকর্ড নেই।</div>`;
}

window.downloadAttendanceReportPdf = function(type){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId).sort((a,b)=>a.roll-b.roll);
  const logoSrc = document.querySelector('.brandbox img')?.src || '';
  if(myStudents.length===0){ alert('এই জামাতে কোনো ছাত্র নেই।'); return; }

  let titleLine = '', rows = '', theadCols = '';
  if(type==='date'){
    const date = document.getElementById('rep_date').value;
    const rec = data.attendance[date] || {};
    titleLine = `তারিখ: ${new Date(date).toLocaleDateString('bn-BD', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}`;
    theadCols = `<th>রোল</th><th>নাম</th><th>অবস্থা</th>`;
    rows = myStudents.map(s=>{
      const status = rec[s.id] || 'present';
      return `<tr><td>${toBn(s.roll)}</td><td style="text-align:right;">${s.name}</td><td style="color:${status==='present'?'#12492e':'#c0483b'}; font-weight:700;">${status==='present'?'উপস্থিত':'অনুপস্থিত'}</td></tr>`;
    }).join('');
  } else {
    const month = document.getElementById('rep_month').value;
    const dates = Object.keys(data.attendance).filter(d=>d.startsWith(month) && !isFriday(d));
    titleLine = `শিক্ষাবর্ষ/মাস: ${new Date(month+'-01').toLocaleDateString('bn-BD', {month:'long', year:'numeric'})}`;
    theadCols = `<th>রোল</th><th>নাম</th><th>উপস্থিত</th><th>অনুপস্থিত</th>`;
    rows = myStudents.map(s=>{
      let present=0, absent=0;
      dates.forEach(d=>{
        const st = data.attendance[d][s.id];
        if(st==='absent') absent++; else if(d in data.attendance && s.id in data.attendance[d]) present++;
      });
      return `<tr><td>${toBn(s.roll)}</td><td style="text-align:right;">${s.name}</td><td style="color:#12492e; font-weight:700;">${toBn(present)}</td><td style="color:#c0483b; font-weight:700;">${toBn(absent)}</td></tr>`;
    }).join('');
  }

  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">হাজিরা রিপোর্ট<br><span style="font-weight:400; font-size:13px;">${jamaat?.name||''} — ${titleLine}</span></div>
    <table>
      <thead><tr>${theadCols}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}

// ---------- Exam ----------
const OLD_EXAM_TYPE_KEYS = ['tut1','tut2','tut3','sem1','sem2','annual'];
const LEGACY_EXAM_YEAR = '2026'; // পুরনো (বছরবিহীন) রেজাল্ট এই বছরের নামে রাখা হবে

// পুরনো ফরম্যাট: examResults[examType][studentId] -> নতুন ফরম্যাট: examResults[year][examType][studentId]
function migrateExamResultsToYearFormat(){
  const er = data.examResults || {};
  const topKeys = Object.keys(er);
  const looksOld = topKeys.length > 0 && topKeys.every(k => OLD_EXAM_TYPE_KEYS.includes(k));
  if(looksOld){
    data.examResults = { [LEGACY_EXAM_YEAR]: er };
  } else if(!data.examResults){
    data.examResults = {};
  }
}
function getExamYearList(){
  const years = new Set();
  Object.keys(data.examResults||{}).forEach(y=> years.add(y));
  const nowY = new Date().getFullYear();
  for(let y = nowY - 1; y <= nowY + 2; y++) years.add(String(y));
  return [...years].sort((a,b)=> b.localeCompare(a)); // নতুন বছর আগে
}
function populateExamYearSelect(){
  const sel = document.getElementById('exam_year');
  const prev = sel.value;
  const nowY = String(new Date().getFullYear());
  sel.innerHTML = getExamYearList().map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value = prev && [...sel.options].some(o=>o.value===prev) ? prev : nowY;
}
const EXAM_CONFIG = {
  tut1: { failBelow: 10, maxMarks: 25 },
  tut2: { failBelow: 10, maxMarks: 25 },
  tut3: { failBelow: 10, maxMarks: 25 },
  sem1: { failBelow: 23, maxMarks: 75 },
  sem2: { failBelow: 23, maxMarks: 75 },
  annual:{ failBelow: 23, maxMarks: 75 }
};

window.openExamScreen = function(){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  showScreen('screen-exam', jamaat.name+' — পরীক্ষার ফলাফল', 'বিষয়ভিত্তিক নম্বর দিন', true);
  populateExamYearSelect();
  renderExamTable();
}
window.renderExamTable = function(){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  const year = document.getElementById('exam_year').value;
  const examType = document.getElementById('exam_type').value;
  const cfg = EXAM_CONFIG[examType];
  const subjects = jamaat.subjects || [];
  const wrap = document.getElementById('examTableWrap');
  if(subjects.length===0){
    wrap.innerHTML = `<div class="empty">এই জামাতে এখনো কোনো বিষয় যোগ করা হয়নি।<br>উপরের "➕ নতুন বিষয় যোগ করুন" বাটন চাপুন।</div>`;
    return;
  }
  const rawStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  if(rawStudents.length===0){
    wrap.innerHTML = `<div class="empty">এই জামাতে ছাত্র নেই।</div>`;
    return;
  }
  if(!data.examResults) data.examResults = {};
  if(!data.examResults[year]) data.examResults[year] = {};
  if(!data.examResults[year][examType]) data.examResults[year][examType] = {};
  const results = data.examResults[year][examType];

  // calculate totals
  const totals = {};
  rawStudents.forEach(s=>{
    const marks = results[s.id] || {};
    totals[s.id] = subjects.reduce((sum,sub)=> sum + (Number(marks[sub.id]) || 0), 0);
  });
  // standard competition ranking (ties share rank, next rank skips)
  const sortedTotals = [...new Set(Object.values(totals))].sort((a,b)=>b-a);
  const ranks = {};
  rawStudents.forEach(s=>{
    ranks[s.id] = sortedTotals.indexOf(totals[s.id]) + 1;
  });
  // তালিকার ক্রম রোল নম্বর অনুযায়ী অপরিবর্তিত থাকবে; র‍্যাংক শুধু একটা তথ্য কলাম হিসেবে দেখানো হয়
  const myStudents = [...rawStudents].sort((a,b)=>a.roll-b.roll);

  let html = `<div style="font-size:12px; color:var(--muted); margin-bottom:8px;">প্রতি বিষয়ে সর্বোচ্চ ${cfg.maxMarks} নম্বর • ${cfg.failBelow}-এর নিচে পেলে লাল দেখাবে</div>
  <table style="width:100%; border-collapse:collapse; background:var(--white); border-radius:14px; overflow:hidden; box-shadow:var(--shadow);">
    <thead><tr style="background:var(--gold-light);">
      <th style="padding:10px; text-align:right; font-size:12px;">রোল</th>
      <th style="padding:10px; text-align:right; font-size:12px;">নাম</th>
      ${subjects.map(sub=>`<th style="padding:10px; font-size:12px;">${sub.name}</th>`).join('')}
      <th style="padding:10px; font-size:12px; background:var(--green); color:white;">মোট</th>
      <th style="padding:10px; font-size:12px; background:var(--green-deep); color:white;">র‍্যাংক</th>
    </tr></thead><tbody>`;
  myStudents.forEach(s=>{
    html += `<tr style="border-top:1px solid rgba(18,73,46,0.08);">
      <td style="padding:8px; text-align:center; font-size:13px;">${toBn(s.roll)}</td>
      <td style="padding:8px; font-size:13px; white-space:nowrap;">${s.name}</td>
      ${subjects.map(sub=>{
        const val = (results[s.id] && results[s.id][sub.id]) || '';
        const isFail = val !== '' && Number(val) < cfg.failBelow;
        return `<td style="padding:4px;"><input type="number" max="${cfg.maxMarks}" min="0" id="mark_${s.id}_${sub.id}" value="${val}" style="width:56px; padding:6px; border-radius:8px; border:1px solid rgba(18,73,46,0.15); text-align:center; ${isFail ? 'color:var(--red); font-weight:700; background:rgba(192,72,59,0.08); border-color:var(--red);' : ''}" oninput="clampMarkInput(this, ${cfg.maxMarks}); setExamMark('${year}','${examType}','${s.id}','${sub.id}', this.value); applyFailStyle(this, ${cfg.failBelow});"></td>`;
      }).join('')}
      <td id="total_${s.id}" style="padding:8px; text-align:center; font-size:14px; font-weight:700; background:rgba(31,122,77,0.08); color:var(--green-deep);">${toBn(totals[s.id])}</td>
      <td id="rank_${s.id}" style="padding:8px; text-align:center; font-size:14px; font-weight:700; background:rgba(18,73,46,0.06); color:var(--green-deep);">${toBn(ranks[s.id])}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}
window.applyFailStyle = function(el, failBelow){
  const isFail = el.value!=='' && Number(el.value) < failBelow;
  el.style.color = isFail ? 'var(--red)' : '';
  el.style.fontWeight = isFail ? '700' : 'normal';
  el.style.background = isFail ? 'rgba(192,72,59,0.08)' : '';
  el.style.borderColor = isFail ? 'var(--red)' : 'rgba(18,73,46,0.15)';
}
window.clampMarkInput = function(el, maxMarks){
  if(el.value === '') return;
  let n = Number(el.value);
  if(isNaN(n)) return;
  if(n > maxMarks){ n = maxMarks; el.value = n; }
  if(n < 0){ n = 0; el.value = n; }
}
window.setExamMark = function(year, examType, studentId, subjectId, val){
  if(!data.examResults[year]) data.examResults[year] = {};
  if(!data.examResults[year][examType]) data.examResults[year][examType] = {};
  if(!data.examResults[year][examType][studentId]) data.examResults[year][examType][studentId] = {};
  const cfg = EXAM_CONFIG[examType];
  let n = Number(val) || 0;
  if(n > cfg.maxMarks) n = cfg.maxMarks;
  if(n < 0) n = 0;
  data.examResults[year][examType][studentId][subjectId] = n;
  recalcTotalsAndRanks(year, examType);
}
function recalcTotalsAndRanks(year, examType){
  // নোট: টাইপ করার সময় সারির অবস্থান বদলায় না (কার্সার হারিয়ে যাওয়া এড়াতে) —
  // মেধাক্রম অনুযায়ী নতুন সাজানো দেখতে আবার এই পরীক্ষা/বছর বাছাই করুন বা স্ক্রিন রিলোড করুন।
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  const subjects = jamaat.subjects || [];
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  const results = (data.examResults[year] && data.examResults[year][examType]) || {};
  const totals = {};
  myStudents.forEach(s=>{
    const marks = results[s.id] || {};
    totals[s.id] = subjects.reduce((sum,sub)=> sum + (Number(marks[sub.id]) || 0), 0);
  });
  const sortedTotals = [...new Set(Object.values(totals))].sort((a,b)=>b-a);
  myStudents.forEach(s=>{
    const rank = sortedTotals.indexOf(totals[s.id]) + 1;
    const totalEl = document.getElementById('total_'+s.id);
    const rankEl = document.getElementById('rank_'+s.id);
    if(totalEl) totalEl.textContent = toBn(totals[s.id]);
    if(rankEl) rankEl.textContent = toBn(rank);
  });
}
window.saveExamResults = async function(){
  await saveData();
  const toast = document.getElementById('toast');
  toast.textContent = 'ফলাফল সংরক্ষণ হয়েছে ✓';
  toast.classList.add('show');
  setTimeout(()=>{ toast.classList.remove('show'); toast.textContent='হাজিরা সংরক্ষণ হয়েছে ✓'; }, 1800);
}

const EXAM_LABELS = {tut1:'১ম টিউটোরিয়াল পরীক্ষা',tut2:'২য় টিউটোরিয়াল পরীক্ষা',tut3:'৩য় টিউটোরিয়াল পরীক্ষা',sem1:'১ম সাময়িক পরীক্ষা',sem2:'২য় সাময়িক পরীক্ষা',annual:'বার্ষিক পরীক্ষা'};

window.downloadMarksheetPdf = function(){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  const year = document.getElementById('exam_year').value;
  const examType = document.getElementById('exam_type').value;
  const cfg = EXAM_CONFIG[examType];
  const subjects = jamaat.subjects || [];
  const rawStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  if(subjects.length===0 || rawStudents.length===0){
    alert('এই জামাতে বিষয় বা ছাত্র যোগ করা নেই, PDF বানানো যাবে না।');
    return;
  }
  const results = (data.examResults[year] && data.examResults[year][examType]) || {};
  const totals = {};
  rawStudents.forEach(s=>{
    const marks = results[s.id] || {};
    totals[s.id] = subjects.reduce((sum,sub)=> sum + (Number(marks[sub.id]) || 0), 0);
  });
  const sortedTotals = [...new Set(Object.values(totals))].sort((a,b)=>b-a);
  const myStudents = [...rawStudents].sort((a,b)=>a.roll-b.roll);
  const logoSrc = document.querySelector('.brandbox img')?.src || '';

  const rows = myStudents.map(s=>{
    const marks = results[s.id] || {};
    const rank = sortedTotals.indexOf(totals[s.id]) + 1;
    const cells = subjects.map(sub=>{
      const v = marks[sub.id] ?? '';
      const fail = v !== '' && Number(v) < cfg.failBelow;
      return `<td style="${fail ? 'color:#c0483b; font-weight:700;' : ''}">${v===''?'-':toBn(v)}</td>`;
    }).join('');
    return `<tr><td>${toBn(s.roll)}</td><td style="text-align:right;">${s.name}</td>${cells}<td style="font-weight:700;">${toBn(totals[s.id])}</td><td style="font-weight:700;">${toBn(rank)}</td></tr>`;
  }).join('');

  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">${EXAM_LABELS[examType]} (শিক্ষাবর্ষ ${toBn(year)}) — মার্কশীট<br><span style="font-weight:400; font-size:13px;">${jamaat.name}</span></div>
    <table>
      <thead><tr>
        <th>রোল</th><th>নাম</th>${subjects.map(sub=>`<th>${sub.name}<br><span style="font-weight:400;">(/${toBn(cfg.maxMarks)})</span></th>`).join('')}<th>মোট</th><th>র‍্যাংক</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}


window.openFeeScreen = function(){
  const jamaat = data.jamaats.find(j=>j.id===state.jamaatId);
  showScreen('screen-fees', jamaat.name+' — বেতন/ফি', 'মাসিক বেতনের হিসাব', true);
  document.getElementById('fee_month').value = new Date().toISOString().slice(0,7);
  renderFeeTable();
}

window.renderFeeTable = function(){
  const month = document.getElementById('fee_month').value || new Date().toISOString().slice(0,7);
  const isAdmin = isAdminUnlocked();
  const wrap = document.getElementById('feeTableWrap');
  const note = document.getElementById('feePermissionNote');
  const saveBtn = document.getElementById('feeSaveBtn');
  note.textContent = isAdmin ? '' : 'শুধু এডমিন বেতনের তথ্য পরিবর্তন করতে পারবেন — আপনি শুধু দেখতে পারছেন।';
  saveBtn.style.display = isAdmin ? 'block' : 'none';

  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId).sort((a,b)=>a.roll-b.roll);
  if(myStudents.length===0){
    wrap.innerHTML = `<div class="empty">এই জামাতে ছাত্র নেই।</div>`;
    return;
  }
  if(!data.feePayments) data.feePayments = {};
  if(!data.feePayments[month]) data.feePayments[month] = {};
  const monthData = data.feePayments[month];

  let html = `<table style="width:100%; border-collapse:collapse; background:var(--white); border-radius:14px; overflow:hidden; box-shadow:var(--shadow);">
    <thead><tr style="background:var(--gold-light);">
      <th style="padding:10px; font-size:12px;">রোল</th>
      <th style="padding:10px; font-size:12px;">নাম</th>
      <th style="padding:10px; font-size:12px;">নির্ধারিত বেতন</th>
      <th style="padding:10px; font-size:12px;">পরিশোধিত টাকা</th>
      <th style="padding:10px; font-size:12px;">অবস্থা</th>
      <th style="padding:10px; font-size:12px;">ইনভয়েস</th>
    </tr></thead><tbody>`;

  myStudents.forEach(s=>{
    const fee = s.monthlyFee || 0;
    const rec = monthData[s.id] || { amount: 0, status: fee>0 ? 'due' : 'paid' };
    const statusLabel = { paid:'✅ পরিশোধিত', partial:'⚠️ আংশিক', due:'❌ বাকি' };
    const statusColor = { paid:'var(--green-deep)', partial:'var(--gold)', due:'var(--red)' };
    html += `<tr style="border-top:1px solid rgba(18,73,46,0.08);">
      <td style="padding:8px; text-align:center; font-size:13px;">${toBn(s.roll)}</td>
      <td style="padding:8px; font-size:13px; white-space:nowrap;">${s.name}</td>
      <td style="padding:4px;">
        <input type="number" min="0" id="fee_fixed_${s.id}" value="${fee}" ${isAdmin?'':'disabled'}
          style="width:70px; padding:6px; border-radius:8px; border:1px solid rgba(18,73,46,0.15); text-align:center;"
          oninput="onFixedFeeInput('${s.id}', this.value)">
      </td>
      <td style="padding:4px;">
        <input type="number" min="0" max="${fee||undefined}" id="fee_amt_${s.id}" value="${rec.amount||0}" ${isAdmin?'':'disabled'}
          style="width:70px; padding:6px; border-radius:8px; border:1px solid rgba(18,73,46,0.15); text-align:center;"
          oninput="onFeeAmountInput('${s.id}', ${fee})">
      </td>
      <td style="padding:8px; text-align:center;">
        <span id="fee_status_${s.id}" style="font-size:12.5px; font-weight:700; color:${statusColor[rec.status]};">${statusLabel[rec.status]}</span>
      </td>
      <td style="padding:8px; text-align:center;">
        <button type="button" onclick="downloadFeeInvoicePdf('${s.id}')" style="border:none; background:var(--gold-light); color:var(--green-deep); border-radius:8px; padding:6px 9px; font-size:13px; cursor:pointer;">📄</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

window.onFixedFeeInput = function(studentId, val){
  let n = Number(val) || 0;
  if(n < 0) n = 0;
  const s = data.students.find(x=>x.id===studentId);
  if(s) s.monthlyFee = n; // live update in memory; persisted on save

  // keep the paid-amount input's status/logic in sync with the new fixed fee
  const amtEl = document.getElementById('fee_amt_'+studentId);
  if(amtEl){
    amtEl.max = n || '';
    onFeeAmountInput(studentId, n);
  }
}

window.onFeeAmountInput = function(studentId, fee){
  const el = document.getElementById('fee_amt_'+studentId);
  let n = Number(el.value) || 0;
  if(n < 0){ n = 0; el.value = 0; }
  if(fee > 0 && n > fee){ n = fee; el.value = n; }
  const statusEl = document.getElementById('fee_status_'+studentId);
  let status;
  if(fee === 0 || n >= fee) status = 'paid';
  else if(n > 0) status = 'partial';
  else status = 'due';
  const statusLabel = { paid:'✅ পরিশোধিত', partial:'⚠️ আংশিক', due:'❌ বাকি' };
  const statusColor = { paid:'var(--green-deep)', partial:'var(--gold)', due:'var(--red)' };
  statusEl.textContent = statusLabel[status];
  statusEl.style.color = statusColor[status];
}

window.saveFeeTable = async function(){
  if(!isAdminUnlocked()){ alert('শুধু এডমিন বেতনের তথ্য পরিবর্তন করতে পারবেন।'); return; }
  const month = document.getElementById('fee_month').value;
  const myStudents = data.students.filter(s=>s.jamaatId===state.jamaatId);
  if(!data.feePayments[month]) data.feePayments[month] = {};
  myStudents.forEach(s=>{
    // persist any edited fixed monthly fee
    const fixedEl = document.getElementById('fee_fixed_'+s.id);
    if(fixedEl) s.monthlyFee = Number(fixedEl.value) || 0;
    const fee = s.monthlyFee || 0;
    const el = document.getElementById('fee_amt_'+s.id);
    if(!el) return;
    const amount = Number(el.value) || 0;
    let status;
    if(fee === 0 || amount >= fee) status = 'paid';
    else if(amount > 0) status = 'partial';
    else status = 'due';
    data.feePayments[month][s.id] = { amount, status };
  });
  await saveData();
  const toast = document.getElementById('toast');
  toast.textContent = 'বেতনের তথ্য সংরক্ষণ হয়েছে ✓';
  toast.classList.add('show');
  setTimeout(()=>{ toast.classList.remove('show'); toast.textContent = 'হাজিরা সংরক্ষণ হয়েছে ✓'; }, 1800);
}

window.downloadFeeInvoicePdf = function(studentId){
  const s = data.students.find(x=>x.id===studentId);
  if(!s) return;
  const jamaat = data.jamaats.find(j=>j.id===s.jamaatId);
  const month = document.getElementById('fee_month').value || new Date().toISOString().slice(0,7);
  const monthLabel = new Date(month+'-01').toLocaleDateString('bn-BD', {month:'long', year:'numeric'});
  const logoSrc = document.querySelector('.brandbox img')?.src || '';

  const fee = s.monthlyFee || 0;
  const monthData = (data.feePayments && data.feePayments[month]) || {};
  const rec = monthData[s.id] || { amount:0, status: fee>0 ? 'due' : 'paid' };
  const paid = rec.amount || 0;
  const due = Math.max(fee - paid, 0);
  const statusLabel = { paid:'✅ সম্পূর্ণ পরিশোধিত', partial:'⚠️ আংশিক পরিশোধিত', due:'❌ বাকি আছে' };

  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">বেতন ইনভয়েস<br><span style="font-weight:400; font-size:13px;">${s.name} • রোল ${toBn(s.roll)} • ${jamaat?.name||""}</span></div>
    <table>
      <thead><tr><th>বিবরণ</th><th>টাকা</th></tr></thead>
      <tbody>
        <tr><td style="text-align:right;">${monthLabel} মাসের নির্ধারিত বেতন</td><td>${toBn(fee)}</td></tr>
        <tr><td style="text-align:right;">পরিশোধিত</td><td>${toBn(paid)}</td></tr>
        <tr><td style="text-align:right; font-weight:700;">বাকি</td><td style="font-weight:700;">${toBn(due)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:10px; font-size:14px; font-weight:700;">অবস্থা: ${statusLabel[rec.status]}</p>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}

// ===== ACCOUNTING =====
window.renderAccountingScreen = function(){
  const month = document.getElementById('acc_month').value || new Date().toISOString().slice(0,7);
  const isAdmin = isAdminUnlocked();

  let totalIncome = 0;
  const monthFees = (data.feePayments && data.feePayments[month]) || {};
  Object.values(monthFees).forEach(rec=>{ totalIncome += (rec.amount || 0); });

  const monthExpenses = (data.expenses || []).filter(e => e.date && e.date.startsWith(month));
  const totalExpense = monthExpenses.reduce((sum,e)=> sum + (Number(e.amount)||0), 0);
  const net = totalIncome - totalExpense;

  document.getElementById('accSummary').innerHTML = `
    <div class="ov-card">
      <div class="ov-label">মোট আয় (বেতন)</div>
      <div class="ov-num">${toBn(totalIncome)}</div>
    </div>
    <div class="ov-card red">
      <div class="ov-label">মোট খরচ</div>
      <div class="ov-num">${toBn(totalExpense)}</div>
    </div>
    <div class="ov-card ${net>=0?'':'red'}" style="grid-column:1 / -1;">
      <div class="ov-label">নিট (আয় - খরচ)</div>
      <div class="ov-num">${net>=0?'':'-'}${toBn(Math.abs(net))} টাকা</div>
    </div>
  `;

  const addBox = document.getElementById('accAdminAdd');
  if(isAdmin){
    addBox.innerHTML = `
      <div class="section-label">➕ নতুন খরচ যোগ করুন</div>
      <div class="select-card">
        <div class="field"><label>তারিখ</label><input type="date" id="exp_date" value="${month}-01"></div>
        <div class="field"><label>খাত/বিবরণ</label><input type="text" id="exp_note" placeholder="যেমনঃ বিদ্যুৎ বিল"></div>
        <div class="field"><label>টাকার পরিমাণ</label><input type="number" min="0" id="exp_amount"></div>
        <button class="btn" onclick="submitAddExpense()">যোগ করুন</button>
      </div>
    `;
  } else {
    addBox.innerHTML = '';
  }

  const listEl = document.getElementById('accExpenseList');
  if(monthExpenses.length===0){
    listEl.innerHTML = `<div class="empty" style="padding:16px;">এই মাসে কোনো খরচের এন্ট্রি নেই।</div>`;
  } else {
    listEl.innerHTML = monthExpenses.slice().sort((a,b)=> b.date.localeCompare(a.date)).map(e=>`
      <div class="citem" style="padding:10px 12px;">
        <div style="flex:1;">
          <div style="font-size:13.5px;">${escapeHtml(e.note||'')}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${e.date}</div>
        </div>
        <div style="font-weight:700; color:var(--red); margin-right:8px;">${toBn(e.amount)} টাকা</div>
        ${isAdmin ? `<button class="icon-btn del" onclick="deleteExpense('${e.id}')">✕</button>` : ''}
      </div>
    `).join('');
  }
}

window.submitAddExpense = async function(){
  const date = document.getElementById('exp_date').value;
  const note = document.getElementById('exp_note').value.trim();
  const amount = Number(document.getElementById('exp_amount').value) || 0;
  if(!date || !note || amount<=0) return;
  if(!data.expenses) data.expenses = [];
  data.expenses.push({ id:'exp_'+Date.now(), date, note, amount });
  await saveData();
  renderAccountingScreen();
}

window.deleteExpense = async function(id){
  data.expenses = (data.expenses||[]).filter(e=>e.id!==id);
  await saveData();
  renderAccountingScreen();
}

window.submitAddJamaat = async function(){
  const name = document.getElementById('m_j_name').value.trim();
  const teacher = document.getElementById('m_j_teacher').value.trim();
  if(!name) return;
  data.jamaats.push({id:'jm_'+Date.now(), branchId: (data.branches[0] && data.branches[0].id) || 'br_main', name, teacher});
  await saveData();
  closeModal();
  populateBranchSelect();
}

function renderEditJamaatList(){
  const container = document.getElementById('editJamaatList');
  const teacherOpts = Object.keys(data.teacherAccounts||{}).map(uid=>`<option value="${uid}">${data.teacherAccounts[uid].name} (${data.teacherAccounts[uid].mobile})</option>`).join('');
  container.innerHTML = data.jamaats.map(j=>`
          <div class="citem" style="padding:10px 12px; flex-direction:column; align-items:stretch; gap:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="text" value="${j.name}" onchange="updateJamaatName('${j.id}', this.value)" autocomplete="off" style="flex:1; border:none; background:transparent; font-weight:700; font-size:14px; padding:2px 0;">
              <button class="icon-btn del" onclick="deleteJamaat('${j.id}')">✕</button>
            </div>
            <input type="text" value="${j.teacher||''}" placeholder="শিক্ষকের নাম (তথ্যের জন্য)" onchange="updateJamaatTeacher('${j.id}', this.value)" style="width:100%; border:1px solid rgba(18,73,46,0.1); border-radius:8px; background:var(--cream); font-size:12px; padding:6px 8px;">
            <select onchange="assignTeacherAccount('${j.id}', this.value)" style="width:100%; border:1px solid rgba(18,73,46,0.1); border-radius:8px; background:var(--cream); font-size:12px; padding:6px 8px;">
              <option value="">— শিক্ষক অ্যাকাউন্ট যুক্ত করুন —</option>
              ${teacherOpts}
            </select>
            ${j.teacherUid && data.teacherAccounts[j.teacherUid] ? `<div style="font-size:11px; color:var(--green-deep); font-weight:700;">✓ যুক্ত আছে: ${data.teacherAccounts[j.teacherUid].name}</div>` : ''}
          </div>
        `).join('');
}
window.assignTeacherAccount = async function(jamaatId, uid){
  const jamaat = data.jamaats.find(j=>j.id===jamaatId);
  // remove this jamaat from any other teacher's list first
  Object.keys(data.teacherAccounts||{}).forEach(u=>{
    data.teacherAccounts[u].jamaatIds = (data.teacherAccounts[u].jamaatIds||[]).filter(id=>id!==jamaatId);
  });
  if(uid){
    jamaat.teacherUid = uid;
    if(!data.teacherAccounts[uid].jamaatIds) data.teacherAccounts[uid].jamaatIds = [];
    data.teacherAccounts[uid].jamaatIds.push(jamaatId);
  } else {
    delete jamaat.teacherUid;
  }
  await saveData();
  renderEditJamaatList();
}
window.updateJamaatName = async function(id, val){
  const j = data.jamaats.find(x=>x.id===id);
  if(j){ j.name = val.trim() || j.name; await saveData(); populateBranchSelect(); }
}
window.updateJamaatTeacher = async function(id, val){
  const j = data.jamaats.find(x=>x.id===id);
  if(j){ j.teacher = val.trim(); await saveData(); }
}
window.deleteJamaat = async function(id){
  data.jamaats = data.jamaats.filter(j=>j.id!==id);
  data.students = data.students.filter(s=>s.jamaatId!==id);
  await saveData();
  renderEditJamaatList();
  populateBranchSelect();
}

// ============ TEACHER AUTH ============
let teacherAuthMode = 'login';
let currentTeacherUid = null;

window.switchTeacherAuthTab = function(mode){
  teacherAuthMode = mode;
  document.getElementById('tAuthTabLogin').style.background = mode==='login' ? 'var(--green)' : 'var(--white)';
  document.getElementById('tAuthTabLogin').style.color = mode==='login' ? 'white' : 'var(--green-deep)';
  document.getElementById('tAuthTabSignup').style.background = mode==='signup' ? 'var(--green)' : 'var(--white)';
  document.getElementById('tAuthTabSignup').style.color = mode==='signup' ? 'white' : 'var(--green-deep)';
  renderTeacherAuth();
}
window.renderTeacherAuth = function(){
  document.getElementById('teacherAuthMsg').textContent = '';
  const form = document.getElementById('teacherAuthForm');
  if(teacherAuthMode==='login'){
    form.innerHTML = `
      <div class="field"><label>মোবাইল নম্বর</label><input type="text" id="t_mobile" placeholder="01XXXXXXXXX"></div>
      <div class="field"><label>পাসওয়ার্ড</label><input type="password" id="t_pass"></div>
      <button class="btn" onclick="submitTeacherLogin()">লগইন করুন</button>
    `;
  } else {
    form.innerHTML = `
      <div class="field"><label>আপনার নাম</label><input type="text" id="t_name" placeholder="যেমনঃ মাওলানা করিম"></div>
      <div class="field"><label>মোবাইল নম্বর</label><input type="text" id="t_mobile" placeholder="01XXXXXXXXX"></div>
      <div class="field"><label>পাসওয়ার্ড (নিজে ঠিক করুন)</label><input type="password" id="t_pass" placeholder="কমপক্ষে ৬ সংখ্যা"></div>
      <button class="btn" onclick="submitTeacherSignup()">অ্যাকাউন্ট তৈরি করুন</button>
    `;
  }
}
window.submitTeacherLogin = async function(){
  const mobile = document.getElementById('t_mobile').value.trim();
  const pass = document.getElementById('t_pass').value;
  const msg = document.getElementById('teacherAuthMsg');
  if(!mobile || !pass){ msg.textContent='মোবাইল ও পাসওয়ার্ড দিন'; return; }
  try{
    const u = await api.login('teacher', mobile, pass);
    await reloadData();
    currentTeacherUid = String(u.id);
    openTeacherDash();
  }catch(e){
    msg.textContent = e.status===401 || e.status===400 ? 'লগইন ব্যর্থ — মোবাইল বা পাসওয়ার্ড ভুল' : 'লগইন করা যায়নি: ' + e.message;
  }
}
window.submitTeacherSignup = async function(){
  const name = document.getElementById('t_name').value.trim();
  const mobile = document.getElementById('t_mobile').value.trim();
  const pass = document.getElementById('t_pass').value;
  const msg = document.getElementById('teacherAuthMsg');
  if(!name || !mobile || pass.length<6){ msg.textContent='সব ঘর পূরণ করুন, পাসওয়ার্ড কমপক্ষে ৬ সংখ্যা'; return; }
  try{
    const u = await api.teacherSignup(name, mobile, pass);
    await reloadData();
    currentTeacherUid = String(u.id);
    openTeacherDash();
  }catch(e){
    msg.textContent = e.status===409 ? 'এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে, লগইন করুন' : 'অ্যাকাউন্ট তৈরি করা যায়নি: ' + e.message;
  }
}
window.teacherLogout = async function(){
  api.logout();
  currentTeacherUid = null;
  await reloadData();
  goHome();
}
function openTeacherDash(){
  const acc = data.teacherAccounts[currentTeacherUid];
  showScreen('screen-teacher-dash', acc?.name || 'শিক্ষক ড্যাশবোর্ড', 'আপনার জামাতসমূহ', true);
  document.getElementById('teacherWelcome').innerHTML = `
    <div><div class="sc-label">স্বাগতম</div><div class="sc-num" style="font-size:18px;">${acc?.name||''}</div></div>
    <div style="font-size:30px;">🧑‍🏫</div>`;
  const myJamaats = data.jamaats.filter(j => (acc?.jamaatIds||[]).includes(j.id));
  const list = document.getElementById('teacherJamaatList');
  if(myJamaats.length===0){
    list.innerHTML = `<div class="empty"><div class="big">⏳</div>অ্যাডমিন এখনো আপনাকে কোনো জামাতে যুক্ত করেননি।<br>অ্যাডমিনের সাথে যোগাযোগ করুন।</div>`;
    return;
  }
  list.innerHTML = myJamaats.map(j=>{
    const count = data.students.filter(s=>s.jamaatId===j.id).length;
    return `<div class="citem" onclick="teacherEnterJamaat('${j.id}')">
      <div><div class="cname">${j.name}</div><div class="ccount">${count} জন ছাত্র</div></div>
      <span class="arrow">›</span>
    </div>`;
  }).join('');
}
window.teacherEnterJamaat = function(jamaatId){
  state.jamaatId = jamaatId;
  const jamaat = data.jamaats.find(j=>j.id===jamaatId);
  showScreen('screen-class', jamaat.name, `${jamaat.teacher||''}`, true);
  document.getElementById('classDate').textContent = '📅 ' + todayBn();
  renderStudentList();
  fromTeacherDash = true;
}
let fromTeacherDash = false;

// ============ GUARDIAN LOGIN ============
// ছাত্র আইডি (AKQ-…) + অভিভাবকের মোবাইল মিললে শুধু ওই সন্তানের তথ্য আনা হয়
window.renderGuardianSearch = function(){
  document.getElementById('guardianAuthMsg').textContent = '';
  document.getElementById('guardianSearchResults').innerHTML = '';
  document.getElementById('g_code').value = '';
  document.getElementById('g_mobile').value = '';
  document.getElementById('guardianSearchBtn').disabled = false;
}
window.submitGuardianSearch = async function(){
  const code = document.getElementById('g_code').value.trim();
  const mobile = document.getElementById('g_mobile').value.trim();
  const msg = document.getElementById('guardianAuthMsg');
  const box = document.getElementById('guardianSearchResults');
  msg.textContent = ''; box.innerHTML = '';
  if(!code || !mobile){ msg.textContent = 'ছাত্র আইডি ও অভিভাবকের মোবাইল নম্বর দিন'; return; }
  try{
    await api.guardianLogin(code, mobile);
    await loadGuardian(data);
    const s = data.students[0];
    box.innerHTML = renderGuardianStudentCard(s);
    const bm = findBoardResultsForStudent(s);
    if(bm.length) box.innerHTML += `<div class="sub" style="margin-top:14px;">🏆 বোর্ড পরীক্ষার সাফল্য</div>` + bm.map(b=>renderBoardResultCard(b)).join('');
  }catch(e){
    msg.textContent = e.status===401 ? 'আইডি বা মোবাইল নম্বর মেলেনি' : 'তথ্য আনা যায়নি: ' + e.message;
  }
}
function findBoardResultsForStudent(s){
  const list = data.boardResults || [];
  const sName = String(s.name||'').replace(/\s+/g,'').toLowerCase();
  const sRoll = String(s.roll||'').trim();
  return list.filter(b=>{
    if(b.studentId) return b.studentId === s.id;
    const bName = String(b.name||'').replace(/\s+/g,'').toLowerCase();
    if(!bName || bName !== sName) return false;
    if(b.roll && sRoll && String(b.roll).trim() !== sRoll) return false;
    return true;
  });
}
function renderGuardianStudentCard(s){
  const jamaat = data.jamaats.find(j=>j.id===s.jamaatId);
  // monthly attendance summary for current month
  let present = 0, absent = 0;
  const month = new Date().toISOString().slice(0,7);
  const dates = Object.keys(data.attendance).filter(d=>d.startsWith(month) && !isFriday(d));
  dates.forEach(d=>{
    const st = data.attendance[d][s.id];
    if(st==='absent') absent++; else if(s.id in (data.attendance[d]||{})) present++;
  });
  // exam results summary — সব শিক্ষাবর্ষ, নতুন বছর আগে
  const examLabels = {tut1:'১ম টিউটোরিয়াল',tut2:'২য় টিউটোরিয়াল',tut3:'৩য় টিউটোরিয়াল',sem1:'১ম সাময়িক',sem2:'২য় সাময়িক',annual:'বার্ষিক'};
  let examHtml = '';
  const examYears = Object.keys(data.examResults||{}).sort((a,b)=> b.localeCompare(a));
  examYears.forEach(year=>{
    const yearResults = data.examResults[year] || {};
    let yearHtml = '';
    Object.keys(examLabels).forEach(key=>{
      const res = (yearResults[key]||{})[s.id];
      if(res && jamaat.subjects && jamaat.subjects.length){
        const rows = jamaat.subjects.map(sub=>{
          const markVal = res[sub.id];
          const isFail = markVal !== undefined && markVal !== null && Number(markVal) < (EXAM_CONFIG[key]?.failBelow ?? 33);
          return `<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;"><span>${sub.name}</span><span style="font-weight:700; ${isFail ? 'color:var(--red);' : ''}">${markVal ?? '-'}</span></div>`;
        }).join('');
        // total & rank among classmates for this exam
        const classmates = data.students.filter(st=>st.jamaatId===s.jamaatId);
        const totalsMap = {};
        classmates.forEach(st=>{
          const m = (yearResults[key]||{})[st.id] || {};
          totalsMap[st.id] = jamaat.subjects.reduce((sum,sub)=> sum + (Number(m[sub.id])||0), 0);
        });
        const myTotal = totalsMap[s.id] || 0;
        const sortedTotals = [...new Set(Object.values(totalsMap))].sort((a,b)=>b-a);
        const myRank = sortedTotals.indexOf(myTotal) + 1;
        const totalRow = `<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:5px 0; margin-top:4px; border-top:1px dashed rgba(18,73,46,0.15); font-weight:700; color:var(--green-deep);"><span>মোট নম্বর</span><span>${myTotal}</span></div>
          <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0; font-weight:700; color:var(--gold);"><span>শ্রেণিতে অবস্থান</span><span>${myRank}</span></div>`;
        yearHtml += `<div style="margin-top:8px; padding:10px; background:var(--cream); border-radius:10px;"><div style="font-weight:700; font-size:12.5px; color:var(--green-deep); margin-bottom:4px;">${examLabels[key]}</div>${rows}${totalRow}</div>`;
      }
    });
    if(yearHtml){
      examHtml += `<div style="margin-top:12px;"><div class="datepill" style="margin-bottom:6px;">শিক্ষাবর্ষ ${year}</div>${yearHtml}</div>`;
    }
  });
  const feeRec = (data.feePayments && data.feePayments[month] && data.feePayments[month][s.id]) || null;
  const monthlyFee = s.monthlyFee || 0;
  const feeStatusLabel = { paid:'✅ পরিশোধিত', partial:'⚠️ আংশিক পরিশোধিত', due:'❌ বাকি আছে' };
  const feeStatusColor = { paid:'var(--green-deep)', partial:'var(--gold)', due:'var(--red)' };
  const feeStatus = feeRec ? feeRec.status : (monthlyFee>0 ? 'due' : null);
  const feePaidAmount = feeRec ? feeRec.amount : 0;
  const feeHtml = monthlyFee>0 ? `
    <div style="margin-top:10px; padding:10px 12px; background:var(--cream); border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:12px; color:var(--muted);">${new Date(month+'-01').toLocaleDateString('bn-BD', {month:'long'})} মাসের বেতন (${toBn(monthlyFee)} টাকা)</div>
        <div style="font-size:13px; font-weight:700; color:${feeStatusColor[feeStatus]};">${feeStatusLabel[feeStatus]} ${feeStatus!=='due' ? `(${toBn(feePaidAmount)} টাকা)` : ''}</div>
      </div>
      <button type="button" onclick="downloadGuardianFeeInvoicePdf('${s.id}','${month}')" style="border:none; background:var(--white); color:var(--green-deep); border-radius:8px; padding:8px 12px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:var(--shadow);">📄 ইনভয়েস</button>
    </div>` : '';
  const myBoardResults = findBoardResultsForStudent(s);
  const boardResultsHtml = myBoardResults.map(b=>`
    <div style="margin-top:8px; padding:10px; background:var(--cream); border-radius:10px;">
      <div style="font-weight:700; font-size:12.5px; color:var(--green-deep); margin-bottom:4px;">🏆 ${escapeHtml(b.board||'বোর্ড পরীক্ষা')}${b.year?(' ('+toBn(b.year)+')'):''}</div>
      ${b.marhala?`<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;"><span>মারহালা</span><span style="font-weight:700;">${escapeHtml(b.marhala)}</span></div>`:''}
      ${b.division?`<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;"><span>বিভাগ</span><span style="font-weight:700;">${escapeHtml(b.division)}</span></div>`:''}
      ${b.avgMark?`<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;"><span>গড় নম্বর</span><span style="font-weight:700;">${escapeHtml(b.avgMark)}</span></div>`:''}
      ${b.meritRank?`<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;"><span>মেধাক্রম</span><span style="font-weight:700; color:var(--gold);">${escapeHtml(b.meritRank)}</span></div>`:''}
    </div>
  `).join('');
  return `
    <div class="box">
      <div class="section-title" style="margin-top:0;">${s.name}</div>
      <div style="font-size:12.5px; color:var(--muted); margin-bottom:10px;">রোল ${s.roll} • ${jamaat?.name||''}</div>
      <div class="stat-row">
        <div class="stat"><div class="n" style="color:var(--green-deep)">${present}</div><div class="l">এ মাসে উপস্থিত</div></div>
        <div class="stat absent"><div class="n">${absent}</div><div class="l">এ মাসে অনুপস্থিত</div></div>
      </div>
      ${feeHtml}
      ${boardResultsHtml}
      ${examHtml || '<div class="empty" style="padding:16px;">এখনো কোনো পরীক্ষার ফলাফল যোগ হয়নি।</div>'}
      ${examHtml ? `<button class="btn outline" style="margin-top:12px;" onclick="downloadGuardianResultPdf('${s.id}')">📄 রেজাল্ট PDF ডাউনলোড করুন</button>` : ''}
    </div>
  `;
}

window.downloadGuardianFeeInvoicePdf = function(studentId, month){
  const s = data.students.find(x=>x.id===studentId);
  if(!s) return;
  const jamaat = data.jamaats.find(j=>j.id===s.jamaatId);
  const monthLabel = new Date(month+'-01').toLocaleDateString('bn-BD', {month:'long', year:'numeric'});
  const logoSrc = document.querySelector('.brandbox img')?.src || '';

  const fee = s.monthlyFee || 0;
  const monthData = (data.feePayments && data.feePayments[month]) || {};
  const rec = monthData[s.id] || { amount:0, status: fee>0 ? 'due' : 'paid' };
  const paid = rec.amount || 0;
  const due = Math.max(fee - paid, 0);
  const statusLabel = { paid:'✅ সম্পূর্ণ পরিশোধিত', partial:'⚠️ আংশিক পরিশোধিত', due:'❌ বাকি আছে' };

  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">বেতন ইনভয়েস<br><span style="font-weight:400; font-size:13px;">${s.name} • রোল ${toBn(s.roll)} • ${jamaat?.name||""}</span></div>
    <table>
      <thead><tr><th>বিবরণ</th><th>টাকা</th></tr></thead>
      <tbody>
        <tr><td style="text-align:right;">${monthLabel} মাসের নির্ধারিত বেতন</td><td>${toBn(fee)}</td></tr>
        <tr><td style="text-align:right;">পরিশোধিত</td><td>${toBn(paid)}</td></tr>
        <tr><td style="text-align:right; font-weight:700;">বাকি</td><td style="font-weight:700;">${toBn(due)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:10px; font-size:14px; font-weight:700;">অবস্থা: ${statusLabel[rec.status]}</p>
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}

window.downloadGuardianResultPdf = function(studentId){
  const s = data.students.find(st=>st.id===studentId);
  if(!s) return;
  const jamaat = data.jamaats.find(j=>j.id===s.jamaatId);
  const subjects = jamaat.subjects || [];
  const examLabels = {tut1:'১ম টিউটোরিয়াল',tut2:'২য় টিউটোরিয়াল',tut3:'৩য় টিউটোরিয়াল',sem1:'১ম সাময়িক',sem2:'২য় সাময়িক',annual:'বার্ষিক'};
  const logoSrc = document.querySelector('.brandbox img')?.src || '';

  let blocksHtml = '';
  const myBoardResults = findBoardResultsForStudent(s);
  if(myBoardResults.length){
    const boardRows = myBoardResults.map(b=>`<tr><td style="text-align:right;">${escapeHtml(b.board||'')}${b.year?(' ('+toBn(b.year)+')'):''}</td><td>${escapeHtml(b.marhala||'-')}</td><td>${escapeHtml(b.division||'-')}</td><td>${escapeHtml(b.avgMark||'-')}</td><td>${escapeHtml(b.meritRank||'-')}</td></tr>`).join('');
    blocksHtml += `
      <div class="ms-title" style="margin-top:0;">🏆 বোর্ড পরীক্ষার সাফল্য</div>
      <table>
        <thead><tr><th>বোর্ড</th><th>মারহালা</th><th>বিভাগ</th><th>গড় নম্বর</th><th>মেধাক্রম</th></tr></thead>
        <tbody>${boardRows}</tbody>
      </table>
    `;
  }
  const examYears = Object.keys(data.examResults||{}).sort((a,b)=> b.localeCompare(a));
  examYears.forEach(year=>{
    const yearResults = data.examResults[year] || {};
    Object.keys(examLabels).forEach(key=>{
      const res = (yearResults[key]||{})[s.id];
      if(!res || !subjects.length) return;
      const cfg = EXAM_CONFIG[key];
      const classmates = data.students.filter(st=>st.jamaatId===s.jamaatId);
      const totalsMap = {};
      classmates.forEach(st=>{
        const m = (yearResults[key]||{})[st.id] || {};
        totalsMap[st.id] = subjects.reduce((sum,sub)=> sum + (Number(m[sub.id])||0), 0);
      });
      const myTotal = totalsMap[s.id] || 0;
      const sortedTotals = [...new Set(Object.values(totalsMap))].sort((a,b)=>b-a);
      const myRank = sortedTotals.indexOf(myTotal) + 1;
      const rows = subjects.map(sub=>{
        const v = res[sub.id] ?? '';
        const fail = v !== '' && Number(v) < (cfg?.failBelow ?? 33);
        return `<tr><td style="text-align:right;">${sub.name}</td><td style="${fail?'color:#c0483b; font-weight:700;':''}">${v===''?'-':toBn(v)}</td><td>${toBn(cfg?.maxMarks ?? '')}</td></tr>`;
      }).join('');
      blocksHtml += `
        <div class="ms-title" style="margin-top:18px;">${examLabels[key]} — শিক্ষাবর্ষ ${toBn(year)}</div>
        <table>
          <thead><tr><th>বিষয়</th><th>প্রাপ্ত নম্বর</th><th>পূর্ণমান</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:6px; font-size:13px;"><b>মোট নম্বর:</b> ${toBn(myTotal)} &nbsp; | &nbsp; <b>শ্রেণিতে অবস্থান:</b> ${toBn(myRank)}</p>
      `;
    });
  });

  if(!blocksHtml){
    alert('এই ছাত্রের কোনো পরীক্ষার ফলাফল পাওয়া যায়নি।');
    return;
  }

  document.getElementById('printMarksheet').innerHTML = `
    ${logoSrc ? `<div class="ms-watermark" style="background-image:url('${logoSrc}')"></div>` : ''}
    <div class="ms-header">
      ${logoSrc ? `<img src="${logoSrc}" onerror="this.remove()">` : ''}
      <h2>শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা</h2>
      <p>ঈদ তোয়ারিয়া (ঈদগাহ মহল্লা), সুনামগঞ্জ</p>
    </div>
    <div class="ms-title">ফলাফল বিবরণী<br><span style="font-weight:400; font-size:13px;">${s.name} • রোল ${toBn(s.roll)} • ${jamaat?.name||""}</span></div>
    ${blocksHtml}
    <p style="margin-top:14px; font-size:11px; color:#777;">প্রস্তুতের তারিখ: ${todayBn()}</p>
  `;
  setTimeout(()=>window.print(), 200);
}


loadData();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.error('SW registration failed', e));
  });
}