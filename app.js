/* ========= Storage & Utilities ========= */
const SESS_KEY='tt.sessions';        // project sessions
const PROJ_KEY='tt.projects';
const ACTIVE_KEY='tt.active';
const DONE_KEY='tt.done';            // array of done project names

const DAY_ACTIVE_KEY='tt.dayActive'; // day timer active
const DAY_SESS_KEY='tt.daySessions'; // day sessions [{start,end}]
const LAST_EXPORT_KEY='tt.lastExportWeekStart';
const DAY_MS=24*60*60*1000;
const EIGHT_HOURS_MS=8*60*60*1000;

const $=(id)=>document.getElementById(id);
const el={
  projectSelect:$('projectSelect'), newProject:$('newProject'),
  addProjectBtn:$('addProjectBtn'), startBtn:$('startBtn'), stopBtn:$('stopBtn'),
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
  const s=Math.floor(ms/1000);
  const hh=String(Math.floor(s/3600)).padStart(2,'0');
  const mm=String(Math.floor((s%3600)/60)).padStart(2,'0');
  const ss=String(s%60).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
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
  daySess:  load(DAY_SESS_KEY,[])
};}

/* ========= Project-level helpers ========= */
function setActive(a){ if(a) save(ACTIVE_KEY,a); else localStorage.removeItem(ACTIVE_KEY); }
function addProject(name){
  const d=getData(); if(!name) return;
  if(!d.projects.includes(name)){ d.projects.push(name); save(PROJ_KEY,d.projects); }
  render(); el.projectSelect.value=name;
}
function startTimer(project){
  const d=getData();
  if(d.active){ if(d.active.project===project) return; stopTimer(); }
  if(!load(DAY_ACTIVE_KEY,null)) dayCheckIn(); // auto check-in if not already
  setActive({project, startEpochMs:Date.now()}); render();
}
function stopTimer(){
  const d=getData(); if(!d.active) return;
  const now=Date.now();
  const sess={project:d.active.project,start:d.active.startEpochMs,end:now};
  const arr=load(SESS_KEY,[]); arr.push(sess); save(SESS_KEY,arr);
  setActive(null); render();
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
function dailyTotals(segments){
  const map=new Map();
  for(const seg of segments){
    const day=seg.day ?? startOfDay(seg.start);
    map.set(day,(map.get(day)||0)+(seg.end-seg.start));
  }
  return map;
}

/* ========= Day timer helpers ========= */
function dayCheckIn(){
  const dayActive = load(DAY_ACTIVE_KEY,null);
  if(dayActive) return;
  save(DAY_ACTIVE_KEY,{startEpochMs: Date.now()});
  render();
}
function dayCheckOut(){
  stopTimer(); // ensure all projects end when checking out
  const dayActive = load(DAY_ACTIVE_KEY,null);
  if(!dayActive){ render(); return; }
  const now = Date.now();
  const arr = load(DAY_SESS_KEY,[]);
  arr.push({start: dayActive.startEpochMs, end: now});
  save(DAY_SESS_KEY, arr);
  localStorage.removeItem(DAY_ACTIVE_KEY);
  stopTimer(); // end any running project when clocking out for the day
  render();
}
function daySessionsToday(){
  const from = startOfToday(), to = endOfToday();
  const arr = load(DAY_SESS_KEY,[]);
  return arr.flatMap(s=>{
    const s1=Math.max(s.start,from); const e1=Math.min(s.end,to);
    return (e1>=s1)?[{start:s1,end:e1}]:[];
  });
}
function dayTotalMsNow(){
  const sessions = daySessionsToday();
  let ms = sessions.reduce((a,s)=>a+(s.end-s.start),0);
  const active = load(DAY_ACTIVE_KEY,null);
  if(active && active.startEpochMs >= startOfToday()) ms += (Date.now() - active.startEpochMs);
  return ms;
}

/* ========= Export ========= */
function exportCSVForRange(from,to, filename){
  const sessions=sessionsInRange(from,to);
  const segments=sessions.flatMap(splitSessionByDay).sort((a,b)=>a.start-b.start);
  const dayTotalsMap=dailyTotals(segments);
  const projectTotals=sumByProject(sessions);

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

  rows.push([]);
  rows.push(['Daily totals']);
  rows.push(['Date','Total (hh:mm:ss)','Overtime?','Overtime (hh:mm:ss)']);
  for(const day of [...dayTotalsMap.keys()].sort((a,b)=>a-b)){
    const total=dayTotalsMap.get(day);
    const overtimeMs=Math.max(0, total - EIGHT_HOURS_MS);
    rows.push([
      formatDateShort(day),
      fmtDuration(total),
      overtimeMs>0?'Yes':'No',
      fmtDuration(overtimeMs)
    ]);
  }

  rows.push([]);
  rows.push(['Project totals']);
  rows.push(['Project','Total (hh:mm:ss)']);
  for(const [p,ms] of projectTotals.entries()){
    rows.push([p, fmtDuration(ms)]);
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
  const weekSessions=sessionsInRange(startOfWeekMonday(), endOfWeekMonday());
  const totals=sumByProject(weekSessions);
  if(active){
    const extraFrom=Math.max(active.startEpochMs,startOfWeekMonday());
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
  const weekSessions=sessionsInRange(startOfWeekMonday(), endOfWeekMonday());
  const totals=sumByProject(weekSessions);
  if(active){
    const now=Date.now(), extraFrom=Math.max(active.startEpochMs,startOfWeekMonday());
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
        <div>
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
  const todaySessions=sessionsInRange(startOfToday(), endOfToday());
  let todayMs=todaySessions.reduce((a,s)=>a+(s.end-s.start),0);
  if(active && active.startEpochMs>=startOfToday()){ todayMs += (Date.now()-active.startEpochMs); }
  el.todayTotal.textContent=fmtDuration(todayMs);
  el.todayDate.textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});

  const weekMs=Array.from(totals.values()).reduce((a,b)=>a+b,0);
  el.weekTotal.textContent=fmtDuration(weekMs);

  // Day timer panel
  const dayAct = load(DAY_ACTIVE_KEY,null);
  const dayMs = dayTotalMsNow();
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
  el.dayTimer.textContent = fmtDuration(dayTotalMsNow());
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
  save(SESS_KEY,kept); render();
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

/* Auto-export weekly rollover */
setInterval(maybeAutoExport, 60*1000);
maybeAutoExport();

/* Initial render */
render();
