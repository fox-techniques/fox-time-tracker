/* ========= Storage & Utilities ========= */
const SESS_KEY='tt.sessions';        // project sessions
const PROJ_KEY='tt.projects';
const ACTIVE_KEY='tt.active';
const DONE_KEY='tt.done';            // array of done project names

const DAY_ACTIVE_KEY='tt.dayActive'; // day timer active
const DAY_SESS_KEY='tt.daySessions'; // day sessions [{start,end}]
const LAST_EXPORT_KEY='tt.lastExportWeekStart';
const LAST_ACTIVITY_KEY='tt.lastActivityMs';
const LAST_AUTO_CHECKOUT_KEY='tt.lastAutoCheckoutMs';
const OFF_DAYS_KEY='tt.offDays';
const LAST_OFF_CHECK_KEY='tt.lastOffCheckDay';
const CORR_KEY='tt.corrections';     // manual corrections [{project,day,deltaMs,at}]
const DAY_MS=24*60*60*1000;
const EIGHT_HOURS_MS=8*60*60*1000;
const BUSINESS_START_HOUR=8;
const BUSINESS_END_HOUR=18;
const AFTER_HOURS_IDLE_MS=60*60*1000;

const $=(id)=>document.getElementById(id);
const el={
  projectSelect:$('projectSelect'), newProject:$('newProject'),
  addProjectBtn:$('addProjectBtn'), renameProjectBtn:$('renameProjectBtn'),
  adjustStep:$('adjustStep'), adjustMinus:$('adjustMinus'), adjustPlus:$('adjustPlus'),
  customMinutes:$('customMinutes'), customMinus:$('customMinus'), customPlus:$('customPlus'),
  startBtn:$('startBtn'), stopBtn:$('stopBtn'),
  resetActiveBtn:$('resetActiveBtn'), exportWeekBtn:$('exportWeekBtn'),
  projectList:$('projectList'), status:$('status'), weekRange:$('weekRange'),
  nowTimer:$('nowTimer'), nowProject:$('nowProject'), todayTotal:$('todayTotal'),
  todayDate:$('todayDate'), weekTotal:$('weekTotal'), resetAll:$('resetAll'),
  bannerText:$('bannerText'),
  dayTimer:$('dayTimer'), dayInBtn:$('dayInBtn'), dayOutBtn:$('dayOutBtn'), dayStatus:$('dayStatus')
};

function load(k,d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)) }

function fmtDuration(ms){
  const safe=Math.max(0, ms);
  const s=Math.floor(safe/1000);
  const hh=String(Math.floor(s/3600)).padStart(2,'0');
  const mm=String(Math.floor((s%3600)/60)).padStart(2,'0');
  const ss=String(s%60).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
}
function fmtSignedDuration(ms){
  const sign=ms<0?'-':'';
  return `${sign}${fmtDuration(Math.abs(ms))}`;
}
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function startOfDay(ms){ const d=new Date(ms); d.setHours(0,0,0,0); return d.getTime(); }
function endOfToday(){ const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); }
function startOfWeekMonday(){ const d=new Date(); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d.getTime(); }
function endOfWeekMonday(){ const s=startOfWeekMonday(); return s + 7*24*3600*1000 - 1; }
function formatDateRange(ms1,ms2){
  const f=(ms)=>new Date(ms).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  return `${f(ms1)} - ${f(ms2)}`;
}
function formatDateShort(ms){ return new Date(ms).toLocaleDateString(undefined,{year:'numeric',month:'2-digit',day:'2-digit'}); }
function formatTime(ms){ return new Date(ms).toLocaleTimeString(); }
function isoWeekInfo(ms){
  const d=new Date(ms); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7)); // shift to Thursday
  const week1=new Date(d.getFullYear(),0,4);
  const week=1 + Math.round(((d - week1)/DAY_MS - 3 + ((week1.getDay()+6)%7))/7);
  return {week, year:d.getFullYear()};
}

function getData(){ return {
  projects: load(PROJ_KEY,['General']),
  sessions: load(SESS_KEY,[]),
  active:   load(ACTIVE_KEY,null),
  done:     new Set(load(DONE_KEY,[])),
  dayActive:load(DAY_ACTIVE_KEY,null),
  daySess:  load(DAY_SESS_KEY,[]),
  corrections: load(CORR_KEY,[])
};}

/* ========= Activity & time helpers ========= */
function getLastActivityMs(){
  const v=load(LAST_ACTIVITY_KEY,null);
  return (typeof v==='number' && !Number.isNaN(v)) ? v : Date.now();
}
let lastActivityCache=getLastActivityMs();
function touchActivity(ms){
  const t=ms ?? Date.now();
  if(t - lastActivityCache >= 5000){ save(LAST_ACTIVITY_KEY,t); }
  lastActivityCache=t;
  return t;
}
function isBusinessHours(ms){
  const h=new Date(ms).getHours();
  return h>=BUSINESS_START_HOUR && h<BUSINESS_END_HOUR;
}
function markDayOffIfNoSessions(dayStart){
  const arr = load(DAY_SESS_KEY,[]);
  const dayEnd = dayStart + DAY_MS - 1;
  const hadSession = arr.some(s=> !(s.end<dayStart || s.start>dayEnd));
  if(hadSession) return false;
  const offDays = load(OFF_DAYS_KEY,[]);
  if(!offDays.includes(dayStart)){
    offDays.push(dayStart);
    save(OFF_DAYS_KEY, offDays);
  }
  return true;
}
function maybeMarkPreviousDayOff(){
  const today = startOfToday();
  const lastChecked = load(LAST_OFF_CHECK_KEY,null);
  if(lastChecked === today) return;
  const yesterday = today - DAY_MS;
  if(yesterday >= 0){
    markDayOffIfNoSessions(yesterday);
  }
  save(LAST_OFF_CHECK_KEY, today);
}

/* ========= Project-level helpers ========= */
function setActive(a){ if(a) save(ACTIVE_KEY,a); else localStorage.removeItem(ACTIVE_KEY); }
function ensureProject(name){
  if(!name) return;
  const list=load(PROJ_KEY,['General']);
  if(!list.includes(name)){ list.push(name); save(PROJ_KEY,list); }
}
function addProject(name){
  const d=getData(); if(!name) return;
  if(!d.projects.includes(name)){ d.projects.push(name); save(PROJ_KEY,d.projects); }
  render(); el.projectSelect.value=name;
}
function getProjectForAdjustment(){
  const typed=el.newProject.value.trim();
  if(typed){
    addProject(typed);
    el.newProject.value='';
    return typed;
  }
  const selected=el.projectSelect.value;
  if(selected){
    ensureProject(selected);
    return selected;
  }
  ensureProject('General');
  return 'General';
}
function addCorrection(project,deltaMs,dayOverride){
  const name=String(project ?? '').trim();
  if(!name || !deltaMs) return;
  ensureProject(name);
  const day=typeof dayOverride==='number' ? dayOverride : startOfToday();
  const arr=load(CORR_KEY,[]);
  arr.push({project:name, day, deltaMs, at:Date.now()});
  save(CORR_KEY,arr);
  render();
}
function correctionsInRange(from,to){
  const arr=load(CORR_KEY,[]);
  return arr.filter(c=>c.day>=from && c.day<=to);
}
function applyCorrectionsToTotals(totals, corrections){
  for(const c of corrections){
    totals.set(c.project,(totals.get(c.project)||0)+c.deltaMs);
  }
  return totals;
}
function applyCorrectionsToPerDay(perDay, corrections){
  for(const c of corrections){
    const m=perDay.get(c.day) || new Map();
    m.set(c.project,(m.get(c.project)||0)+c.deltaMs);
    perDay.set(c.day,m);
  }
  return perDay;
}
function renameProject(oldName,newName){
  const from = String(oldName ?? '').trim();
  const to = String(newName ?? '').trim();
  if(!from || !to || from===to) return;

  const projects = load(PROJ_KEY,['General']);
  const exists = projects.includes(to);
  if(exists && !confirm(`"${to}" already exists. Merge "${from}" into "${to}"?`)) return;

  const nextProjects = projects.filter(p=>p!==from);
  if(!nextProjects.includes(to)) nextProjects.push(to);
  save(PROJ_KEY, nextProjects);

  const sessions = load(SESS_KEY,[]).map(s=> s.project===from ? {...s, project: to} : s);
  save(SESS_KEY, sessions);

  const corrections = load(CORR_KEY,[]).map(c=> c.project===from ? {...c, project: to} : c);
  save(CORR_KEY, corrections);

  const active = load(ACTIVE_KEY,null);
  if(active?.project===from){
    save(ACTIVE_KEY,{...active, project: to});
  }

  const done = load(DONE_KEY,[]);
  const isDone = done.includes(from) || done.includes(to);
  const nextDone = done.filter(p=>p!==from);
  if(isDone && !nextDone.includes(to)) nextDone.push(to);
  save(DONE_KEY, nextDone);

  render();
  el.projectSelect.value = to;
}
function startTimer(project){
  const d=getData();
  if(d.active){ if(d.active.project===project) return; stopTimer(); }
  if(!load(DAY_ACTIVE_KEY,null)) dayCheckIn({skipAutoProjectStart:true}); // auto check-in if not already
  ensureProject(project);
  touchActivity();
  setActive({project, startEpochMs:Date.now()}); render();
}
function stopTimer(){
  stopActiveAt(Date.now());
}
function stopActiveAt(endMs,{skipRender=false}={}){
  const d=getData(); if(!d.active) return;
  const safeEnd=Math.max(endMs, d.active.startEpochMs);
  const sess={project:d.active.project,start:d.active.startEpochMs,end:safeEnd};
  const arr=load(SESS_KEY,[]); arr.push(sess); save(SESS_KEY,arr);
  setActive(null);
  if(!skipRender) render();
}
function stopAllAt(endMs){
  stopActiveAt(endMs,{skipRender:true});
  const dayActive = normalizeDayActive();
  if(dayActive){
    const safeEnd=Math.max(endMs, dayActive.startEpochMs);
    const arr = load(DAY_SESS_KEY,[]);
    arr.push({start: dayActive.startEpochMs, end: safeEnd});
    save(DAY_SESS_KEY, arr);
    localStorage.removeItem(DAY_ACTIVE_KEY);
  }
  render();
}
function markDone(project){
  const d=getData();
  if(d.active?.project===project) stopTimer();
  const arr=load(DONE_KEY,[]);
  if(!arr.includes(project)) arr.push(project);
  save(DONE_KEY,arr); render();
}
function markUndone(project){
  const arr=load(DONE_KEY,[]).filter(p=>p!==project);
  save(DONE_KEY,arr); render();
}
function sessionsInRange(from,to){
  const arr=load(SESS_KEY,[]);
  return arr.flatMap(s=>{
    const s1=Math.max(s.start,from); const e1=Math.min(s.end,to);
    return (e1>=s1)?[{...s,start:s1,end:e1}]:[];
  });
}
function sumByProject(s){
  const m=new Map(); for(const x of s){ m.set(x.project,(m.get(x.project)||0)+(x.end-x.start)); } return m;
}
function splitSessionByDay(sess){
  const parts=[];
  let start=sess.start;
  const end=sess.end;
  while(start<=end){
    const day=startOfDay(start);
    const dayEnd=day+DAY_MS-1;
    const segEnd=Math.min(end,dayEnd);
    parts.push({...sess,start,end:segEnd,day});
    start=segEnd+1;
  }
  return parts;
}
function dailyTotals(segments, corrections=[]){
  const map=new Map();
  for(const seg of segments){
    const day=seg.day ?? startOfDay(seg.start);
    map.set(day,(map.get(day)||0)+(seg.end-seg.start));
  }
  for(const c of corrections){
    map.set(c.day,(map.get(c.day)||0)+c.deltaMs);
  }
  return map;
}
function projectTotalsWithOvertime(segments, corrections=[]){
  // Break down normal vs overtime per project, allocating overtime proportionally per day.
  const perDay=new Map(); // day -> Map(project, ms)
  for(const seg of segments){
    const day=seg.day ?? startOfDay(seg.start);
    const m=perDay.get(day) || new Map();
    m.set(seg.project,(m.get(seg.project)||0)+(seg.end-seg.start));
    perDay.set(day,m);
  }
  applyCorrectionsToPerDay(perDay, corrections);

  const totals=new Map(); // project -> {normal, overtime}
  for(const [day,map] of perDay.entries()){
    const dayTotal=[...map.values()].reduce((a,b)=>a+b,0);
    const safeDayTotal=Math.max(0, dayTotal);
    const dayOver=Math.max(0, safeDayTotal - EIGHT_HOURS_MS);
    const factor=safeDayTotal>0 ? dayOver/safeDayTotal : 0;
    for(const [project,ms] of map.entries()){
      const overtime=ms*factor;
      const normal=ms-overtime;
      const agg=totals.get(project)||{normal:0,overtime:0};
      agg.normal+=normal; agg.overtime+=overtime;
      totals.set(project, agg);
    }
  }
  return totals;
}
function dailyProjectTotalsWithOvertime(segments, corrections=[]){
  const perDay=new Map(); // day -> Map(project, ms)
  for(const seg of segments){
    const day=seg.day ?? startOfDay(seg.start);
    const m=perDay.get(day) || new Map();
    m.set(seg.project,(m.get(seg.project)||0)+(seg.end-seg.start));
    perDay.set(day,m);
  }
  applyCorrectionsToPerDay(perDay, corrections);

  const rows=[];
  for(const [day,map] of perDay.entries()){
    const dayTotal=[...map.values()].reduce((a,b)=>a+b,0);
    const safeDayTotal=Math.max(0, dayTotal);
    const dayOver=Math.max(0, safeDayTotal - EIGHT_HOURS_MS);
    const factor=safeDayTotal>0 ? dayOver/safeDayTotal : 0;
    for(const [project,ms] of map.entries()){
      const overtime=ms*factor;
      const normal=ms-overtime;
      rows.push({day, project, normal, overtime});
    }
  }
  return rows;
}

/* ========= Day timer helpers ========= */
function normalizeDayActive(){
  const dayActive = load(DAY_ACTIVE_KEY,null);
  const todayStart = startOfToday();
  if(!dayActive || typeof dayActive.startEpochMs !== 'number') return null;
  if(dayActive.startEpochMs < todayStart){
    const arr = load(DAY_SESS_KEY,[]);
    arr.push({start: dayActive.startEpochMs, end: todayStart - 1});
    save(DAY_SESS_KEY, arr);
    const updated = {startEpochMs: todayStart};
    save(DAY_ACTIVE_KEY, updated);
    return updated;
  }
  return dayActive;
}
function dayCheckIn({skipAutoProjectStart=false}={}){
  const dayActive = normalizeDayActive();
  if(dayActive){
    if(!skipAutoProjectStart && !load(ACTIVE_KEY,null)){
      ensureProject('General');
      startTimer('General');
    }
    return dayActive;
  }
  const now = Date.now();
  save(DAY_ACTIVE_KEY,{startEpochMs: now});
  touchActivity(now);
  if(!skipAutoProjectStart && !load(ACTIVE_KEY,null)){
    ensureProject('General');
    startTimer('General');
    return;
  }
  render();
}
function dayCheckOut(endOverrideMs){
  const endMs = typeof endOverrideMs==='number' ? endOverrideMs : Date.now();
  stopAllAt(endMs);
  touchActivity(endMs);
}
function daySessionsToday(){
  const from = startOfToday(), to = endOfToday();
  const arr = load(DAY_SESS_KEY,[]);
  return arr.flatMap(s=>{
    const s1=Math.max(s.start,from); const e1=Math.min(s.end,to);
    return (e1>=s1)?[{start:s1,end:e1}]:[];
  });
}
function dayTotalMsNow(activeOverride){
  const todayStart = startOfToday();
  const sessions = daySessionsToday();
  let ms = sessions.reduce((a,s)=>a+(s.end-s.start),0);
  const active = activeOverride ?? normalizeDayActive();
  if(active){
    const activeStart = Math.max(active.startEpochMs, todayStart);
    ms += (Date.now() - activeStart);
  }
  return ms;
}
function maybeAfterHoursAutoCheckout(){
  const dayActive = normalizeDayActive();
  const active = load(ACTIVE_KEY,null);
  if(!dayActive && !active) return; // nothing running
  const now = Date.now();
  if(isBusinessHours(now)) return;
  const lastAct = getLastActivityMs();
  if(now - lastAct < AFTER_HOURS_IDLE_MS) return;
  const lastAuto = load(LAST_AUTO_CHECKOUT_KEY,null);
  if(lastAuto && startOfDay(lastAuto) === startOfDay(now)) return; // already handled today
  const cutoff = Math.max(lastAct, dayActive?.startEpochMs ?? 0, active?.startEpochMs ?? 0);
  stopAllAt(cutoff);
  save(LAST_AUTO_CHECKOUT_KEY, now);
}

/* ========= Export ========= */
function exportCSVForRange(from,to, filename){
  const sessions=sessionsInRange(from,to);
  const segments=sessions.flatMap(splitSessionByDay).sort((a,b)=>a.start-b.start);
  const corrections=correctionsInRange(from,to);
  const dayTotalsMap=dailyTotals(segments, corrections);
  const projectTotals=sumByProject(sessions);
  applyCorrectionsToTotals(projectTotals, corrections);
  const projectTotalsOT=projectTotalsWithOvertime(segments, corrections);
  const dailyProjectTotals=dailyProjectTotalsWithOvertime(segments, corrections);

  const rows=[['Date','Project','Start','End','Duration (hh:mm:ss)','Day total','Overtime?','Overtime (hh:mm:ss)']];
  for(const seg of segments){
    const dayTotal=dayTotalsMap.get(seg.day)||0;
    const overtimeMs=Math.max(0, dayTotal - EIGHT_HOURS_MS);
    rows.push([
      formatDateShort(seg.day),
      seg.project,
      formatTime(seg.start),
      formatTime(seg.end),
      fmtDuration(seg.end - seg.start),
      fmtDuration(dayTotal),
      overtimeMs>0?'Yes':'No',
      fmtDuration(overtimeMs)
    ]);
  }
  for(const c of corrections){
    const dayTotal=dayTotalsMap.get(c.day)||0;
    const overtimeMs=Math.max(0, dayTotal - EIGHT_HOURS_MS);
    rows.push([
      formatDateShort(c.day),
      c.project,
      'Correction',
      '',
      fmtSignedDuration(c.deltaMs),
      fmtDuration(dayTotal),
      overtimeMs>0?'Yes':'No',
      fmtDuration(overtimeMs)
    ]);
  }

  rows.push([]);
  rows.push(['Daily totals T/O']);
  rows.push(['Date','Project','Time (hh:mm:ss)','Overtime (hh:mm:ss)']);
  for(const item of dailyProjectTotals.sort((a,b)=> a.day===b.day ? a.project.localeCompare(b.project) : a.day-b.day)){
    const total=item.normal + item.overtime;
    rows.push([
      formatDateShort(item.day),
      item.project,
      fmtDuration(total),
      fmtDuration(item.overtime)
    ]);
  }

  rows.push([]);
  rows.push(['Project totals T/O']);
  rows.push(['Project','Time (hh:mm:ss)','Overtime (hh:mm:ss)']);
  for(const p of [...projectTotals.keys()].sort((a,b)=>a.localeCompare(b))){
    const totals = projectTotalsOT.get(p) || {normal:0,overtime:0};
    rows.push([p, fmtDuration(totals.normal), fmtDuration(totals.overtime)]);
  }

  rows.push([]);
  rows.push(['Project totals (sum)']);
  rows.push(['Project','Total (hh:mm:ss)']);
  for(const p of [...projectTotals.keys()].sort((a,b)=>a.localeCompare(b))){
    rows.push([p, fmtDuration(projectTotals.get(p)||0)]);
  }

  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}
function maybeAutoExport(){
  const currentWeekStart=startOfWeekMonday();
  const lastExportWeekStart=load(LAST_EXPORT_KEY,null);
  if(lastExportWeekStart===null){ save(LAST_EXPORT_KEY,currentWeekStart); return; }
  if(currentWeekStart>lastExportWeekStart){
    const from=lastExportWeekStart, to=lastExportWeekStart+7*24*3600*1000-1;
    exportCSVForRange(from,to, `times_${formatDateShort(from)}_to_${formatDateShort(to)}.csv`);
    save(LAST_EXPORT_KEY,currentWeekStart);
  }
}

/* ========= Banner text (multi-project, colored by status) ========= */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function buildBannerHTML(){
  const {projects, sessions, active, done} = getData();
  const now=Date.now();
  const weekStart=startOfWeekMonday();
  const weekEnd=endOfWeekMonday();
  const weekSessions=sessionsInRange(weekStart, weekEnd);
  const weekCorrections=correctionsInRange(weekStart, weekEnd);
  const totals=sumByProject(weekSessions);
  applyCorrectionsToTotals(totals, weekCorrections);
  if(active){
    const extraFrom=Math.max(active.startEpochMs,weekStart);
    if(now>=extraFrom) totals.set(active.project,(totals.get(active.project)||0)+(now-extraFrom));
  }
  const names=[...new Set([...projects, ...totals.keys()])].sort((a,b)=>a.localeCompare(b));
  const parts=[];
  for(const name of names){
    const isRunning = active?.project === name;
    const isDone = done.has(name);
    const runField = isRunning ? fmtDuration(now - active.startEpochMs)
                    : isDone    ? ''     // done: "Name | total"
                                : '00:00:00';   // stopped: "Name 00:00:00 | total"
    const totalField = fmtDuration(totals.get(name)||0);
    const cls = isRunning ? 'running' : (isDone ? 'done' : 'notrunning');

    const left = isDone ? `${escapeHtml(name)} | ${totalField}`
                        : `${escapeHtml(name)} ${runField} | ${totalField}`;
    parts.push(`<span class="proj ${cls}">${left}</span>`);
  }
  // No ALL total; use diamond separators with spacing.
  return parts.join(`<span class="sep">◆</span>`);
}

/* ========= UI Render ========= */
function render(){
  const {projects, sessions, active, done} = getData();

  // Picker
  el.projectSelect.innerHTML = projects.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(!el.projectSelect.value && projects.length) el.projectSelect.value=projects[0];

  // Week label
  const weekInfo = isoWeekInfo(startOfWeekMonday());
  el.weekRange.textContent = `Week ${weekInfo.week} (${weekInfo.year}): ${formatDateRange(startOfWeekMonday(), endOfWeekMonday())}`;

  // Per-project list (this week)
  const weekStart=startOfWeekMonday();
  const weekEnd=endOfWeekMonday();
  const weekSessions=sessionsInRange(weekStart, weekEnd);
  const weekCorrections=correctionsInRange(weekStart, weekEnd);
  const totals=sumByProject(weekSessions);
  applyCorrectionsToTotals(totals, weekCorrections);
  if(active){
    const now=Date.now(), extraFrom=Math.max(active.startEpochMs,weekStart);
    if(now>=extraFrom) totals.set(active.project,(totals.get(active.project)||0)+(now-extraFrom));
  }
  const names=[...new Set([...projects, ...totals.keys()])].sort((a,b)=>a.localeCompare(b));
  el.projectList.innerHTML=names.map(name=>{
    const isActive=active?.project===name;
    const isDone=done.has(name);
    const ms=totals.get(name)||0;
    const esc=escapeHtml(name);
    return `
      <div class="project">
        <div class="project-meta">
          <div class="pname">${esc} ${isActive?'<span class="muted">(running)</span>':''} ${isDone?'<span class="muted">(done)</span>':''}</div>
          <div class="muted">This week: ${fmtDuration(ms)}</div>
        </div>
        <div class="row" style="gap:8px">
          ${isActive?`<button data-act="stop" data-p="${esc}">Stop</button>`:`<button class="btn-ok" data-act="start" data-p="${esc}">Start</button>`}
          ${isDone?`<button class="btn-undone" data-act="undone" data-p="${esc}">Undone</button>`
                  :`<button class="btn-done"   data-act="done"   data-p="${esc}">Done</button>`}
          <button class="btn-danger" data-act="resetOne" data-p="${esc}">Reset</button>
        </div>
      </div>
    `;
  }).join('');

  // Panels
  if(active){ el.status.textContent=`Running: ${active.project}`; el.nowProject.textContent=active.project; }
  else { el.status.textContent='Idle'; el.nowProject.textContent='—'; }

  // Today + week (projects)
  const todayStart=startOfToday();
  const todayEnd=endOfToday();
  const todaySessions=sessionsInRange(todayStart, todayEnd);
  const todayCorrections=correctionsInRange(todayStart, todayEnd);
  const todayCorrectionMs=todayCorrections.reduce((a,c)=>a+c.deltaMs,0);
  let todayMs=todaySessions.reduce((a,s)=>a+(s.end-s.start),0);
  if(active && active.startEpochMs>=todayStart){ todayMs += (Date.now()-active.startEpochMs); }
  todayMs += todayCorrectionMs;
  el.todayTotal.textContent=fmtDuration(todayMs);
  el.todayDate.textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});

  const weekMs=Array.from(totals.values()).reduce((a,b)=>a+b,0);
  el.weekTotal.textContent=fmtDuration(weekMs);

  // Day timer panel
  const dayAct = normalizeDayActive();
  const dayMs = dayTotalMsNow(dayAct);
  el.dayTimer.textContent = fmtDuration(dayMs);
  el.dayStatus.textContent = dayAct ? 'Checked in' : 'Not checked in';

  // Banner HTML (colored per project)
  el.bannerText.innerHTML = buildBannerHTML();
}

/* ========= Timers & events ========= */
setInterval(()=>{
  const a=load(ACTIVE_KEY,null);
  el.nowTimer.textContent = a ? fmtDuration(Date.now()-a.startEpochMs) : '00:00:00';
  // day timer tick
  const dayAct = normalizeDayActive();
  el.dayTimer.textContent = fmtDuration(dayTotalMsNow(dayAct));
  render();
},1000);

function resetProjectWeek(p){
  const from=startOfWeekMonday(), to=endOfWeekMonday();
  const arr=load(SESS_KEY,[]);
  const kept=arr.filter(s=>{
    const overlap=!(s.end<from||s.start>to);
    if(!overlap) return true;
    return s.project!==p;
  });
  save(SESS_KEY,kept);
  const corr=load(CORR_KEY,[]).filter(c=> !(c.project===p && c.day>=from && c.day<=to));
  save(CORR_KEY,corr);
  render();
}

/* Buttons & delegation */
el.exportWeekBtn.addEventListener('click', ()=>{
  const from=startOfWeekMonday(), to=endOfWeekMonday();
  exportCSVForRange(from,to, `times_${formatDateShort(from)}_to_${formatDateShort(to)}.csv`);
});
el.addProjectBtn.addEventListener('click', ()=>{
  const txt=el.newProject.value.trim();
  if(txt){ addProject(txt); el.newProject.value=''; } else if(el.projectSelect.value){ render(); }
});
el.renameProjectBtn.addEventListener('click', ()=>{
  const from = el.projectSelect.value;
  const to = el.newProject.value.trim();
  if(!from || !to) return;
  renameProject(from, to);
  el.newProject.value='';
});
el.adjustMinus.addEventListener('click', ()=>{
  const step=Number(el.adjustStep.value)||0;
  if(!step) return;
  const p=getProjectForAdjustment();
  addCorrection(p, -step);
});
el.adjustPlus.addEventListener('click', ()=>{
  const step=Number(el.adjustStep.value)||0;
  if(!step) return;
  const p=getProjectForAdjustment();
  addCorrection(p, step);
});
el.customMinus.addEventListener('click', ()=>{
  const mins=Number(el.customMinutes.value)||0;
  if(mins<=0) return;
  const p=getProjectForAdjustment();
  addCorrection(p, -mins*60*1000);
});
el.customPlus.addEventListener('click', ()=>{
  const mins=Number(el.customMinutes.value)||0;
  if(mins<=0) return;
  const p=getProjectForAdjustment();
  addCorrection(p, mins*60*1000);
});
el.startBtn.addEventListener('click', ()=>{
  const p=el.projectSelect.value || el.newProject.value.trim() || 'General';
  addProject(p); startTimer(p);
});
el.stopBtn.addEventListener('click', ()=> stopTimer());
el.resetActiveBtn.addEventListener('click', ()=>{
  const p=el.projectSelect.value; if(!p) return;
  if(confirm(`Reset THIS WEEK for "${p}"?`)) resetProjectWeek(p);
});
el.resetAll.addEventListener('click', ()=>{
  if(confirm('Delete ALL data?')){
    localStorage.removeItem(SESS_KEY); localStorage.removeItem(PROJ_KEY);
    localStorage.removeItem(ACTIVE_KEY); localStorage.removeItem(DONE_KEY);
    localStorage.removeItem(DAY_ACTIVE_KEY); localStorage.removeItem(DAY_SESS_KEY);
    localStorage.removeItem(LAST_EXPORT_KEY);
    localStorage.removeItem(CORR_KEY);
    render();
  }
});
el.projectList.addEventListener('click',(e)=>{
  const btn=e.target.closest('button'); if(!btn) return;
  const act=btn.dataset.act; const p=btn.dataset.p;
  if(act==='start'){ addProject(p); startTimer(p); }
  if(act==='stop'){ stopTimer(); }
  if(act==='done'){ markDone(p); }
  if(act==='undone'){ markUndone(p); }
  if(act==='resetOne'){
    if(confirm(`Reset THIS WEEK for "${p}"?`)) resetProjectWeek(p);
  }
});
el.dayInBtn.addEventListener('click', dayCheckIn);
el.dayOutBtn.addEventListener('click', dayCheckOut);

/* Activity tracking */
['mousemove','keydown','click'].forEach(evt=>{
  document.addEventListener(evt, ()=>touchActivity());
});
document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden) touchActivity();
});
window.addEventListener('focus', ()=>touchActivity());
touchActivity(getLastActivityMs()); // seed cached activity
maybeMarkPreviousDayOff();

/* Auto-export weekly rollover */
setInterval(maybeAutoExport, 60*1000);
setInterval(maybeAfterHoursAutoCheckout, 60*1000);
setInterval(maybeMarkPreviousDayOff, 60*60*1000);
maybeAutoExport();

/* Initial render */
render();
