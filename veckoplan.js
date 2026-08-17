
const SB_URL='https://fnxcuuyiggdcrouwxrza.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueGN1dXlpZ2dkY3JvdXd4cnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTY4NDMsImV4cCI6MjA5NTg5Mjg0M30.cYwJNI2zVS50W0ihx0f9fZdPAwU6SZdT1CpaEBzLU2Y';
const GCAL_AUTH_URL=SB_URL+'/functions/v1/google-auth';
const GCAL_EVENTS_URL=SB_URL+'/functions/v1/google-calendar-events';

async function sbFetch(path,opts={}){
  const res=await fetch(SB_URL+'/rest/v1/'+path,{
    headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=representation',...(opts.headers||{})},
    ...opts
  });
  if(!res.ok)throw new Error(await res.text());
  const text=await res.text();return text?JSON.parse(text):[];
}

const PERSONS=[
  {key:'olle',label:'Olle',emoji:'⭐',chipCls:'chip-olle',color:'#1D9E75'},
  {key:'alvar',label:'Alvar',emoji:'🙋',chipCls:'chip-alvar',color:'#3B82F6'},
  {key:'nils',label:'Nils',emoji:'👦',chipCls:'chip-nils',color:'#F97316'},
  {key:'pappa',label:'Pappa & Lina',emoji:'❤️',chipCls:'chip-pappa',color:'#A855F7'},
  {key:'ovrigt',label:'Övrigt',emoji:'📌',chipCls:'chip-ovrigt',color:'#EAB308'},
];
const SYMS=['⭐','🏫','🏠','🚶','🛁','⏰','🎉','⚽','🎓','🍕','🍳','🎬','🛒','💊','🎵','🏥','☕','🤝','🚌','🏋️','📚','✈️','🎂','💼','🏕️','🚗'];
const sortEvs=arr=>arr.slice().sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));

let events=[],currentWeekStart=getWeekStart(new Date()),currentView='olle';
let selPersons=new Set(['olle']);
let selSym='⭐';
let gcalToken=null;
let gcalEvents=[];
let gcalSelected=new Map();

// ── GOOGLE CALENDAR ──
function handleGcalBtn(){
  if(gcalToken){openGcalImport();}
  else{
    const popup=window.open(GCAL_AUTH_URL,'gcal_auth','width=500,height=600,left=100,top=100');
    showToast('Logga in med Google i popup-fönstret 🔐');
    // Poll för att se om token kommer via URL-hash efter redirect
    const check=setInterval(()=>{
      try{
        if(popup&&popup.closed){clearInterval(check);checkGcalToken();}
      }catch(e){}
    },500);
  }
}

function checkGcalToken(){
  const hash=window.location.hash;
  if(hash.includes('gcal_token=')){
    gcalToken=decodeURIComponent(hash.split('gcal_token=')[1]);
    window.location.hash='';
    document.getElementById('gcal-btn').classList.add('connected');
    document.getElementById('gcal-btn').title='Google Kalender ansluten';
    showToast('Google Kalender ansluten! ✅');
    setTimeout(()=>openGcalImport(),300);
  }
}

async function openGcalImport(){
  document.getElementById('gcal-modal-bg').classList.add('open');
  document.getElementById('gcal-body').innerHTML='<div class="gcal-empty">🔄 Hämtar händelser från Google...</div>';
  const from=dateStr(currentWeekStart),to=dateStr(addDays(currentWeekStart,6));
  try{
    const res=await fetch(GCAL_EVENTS_URL+'?token='+encodeURIComponent(gcalToken)+'&from='+from+'&to='+to);
    const data=await res.json();
    if(data.error){
      gcalToken=null;
      document.getElementById('gcal-btn').classList.remove('connected');
      document.getElementById('gcal-modal-bg').classList.remove('open');
      showToast('Sessionen gick ut — logga in igen');
      return;
    }
    gcalEvents=data.events||[];
    gcalSelected=new Map();
    gcalEvents.forEach(e=>gcalSelected.set(e.id,new Set(['olle'])));
    renderGcalList();
  }catch(e){
    document.getElementById('gcal-body').innerHTML='<div class="gcal-empty">Kunde inte hämta händelser 😕<br><small>'+e.message+'</small></div>';
  }
}

function renderGcalList(){
  if(gcalEvents.length===0){
    document.getElementById('gcal-body').innerHTML='<div class="gcal-empty">Inga händelser den här veckan i Google Kalender</div>';
    return;
  }
  const DNF2=['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
  let html='<div class="gcal-event-list">';
  gcalEvents.forEach(ev=>{
    const sp=gcalSelected.get(ev.id)||new Set();
    const checked=sp.size>0;
    const d=new Date(ev.date+'T12:00:00');
    const dl=DNF2[d.getDay()]+' '+d.getDate();
    const tl=ev.time?'kl '+ev.time:(ev.allDay?'Heldag':'');
    const persRow=PERSONS.map(function(p){
      return '<button class="gcal-pb '+(sp.has(p.key)?'sel-'+p.key:'')+'" id="gpb-'+ev.id+'-'+p.key+'" onclick="event.stopPropagation();toggleGcalPerson(this,\''+ev.id+'\',\''+p.key+'\')">'+p.label+'</button>';
    }).join('');
    html+='<div class="gcal-event-row '+(checked?'sel':'')+'" id="grow-'+ev.id+'" onclick="toggleGcalRow(this,\''+ev.id+'\')">'
      +'<div class="gcal-check" id="gck-'+ev.id+'">'+(checked?'&#10003;':'')+'</div>'
      +'<div class="gcal-info">'
      +'<div class="gcal-title">'+ev.title+'</div>'
      +'<div class="gcal-meta">'+dl+(tl?' &middot; '+tl:'')+'</div>'
      +'<div class="gcal-person-row" onclick="event.stopPropagation()">'+persRow+'</div>'
      +'</div></div>';
  });
  html+='</div>';
  document.getElementById('gcal-body').innerHTML=html;
}

function toggleGcalRow(id){
  const sp=gcalSelected.get(id)||new Set();
  if(sp.size>0)gcalSelected.set(id,new Set());
  else gcalSelected.set(id,new Set(['olle']));
  renderGcalList();
}

function toggleGcalPerson(evId,pKey){
  const sp=gcalSelected.get(evId)||new Set();
  if(sp.has(pKey))sp.delete(pKey);else sp.add(pKey);
  gcalSelected.set(evId,sp);
  const row=document.getElementById('grow-'+evId);
  const chk=document.getElementById('gck-'+evId);
  if(row)row.classList.toggle('sel',sp.size>0);
  if(chk)chk.textContent=sp.size>0?'✓':'';
  PERSONS.forEach(p=>{
    const btn=document.getElementById('gpb-'+evId+'-'+p.key);
    if(btn)btn.className='gcal-pb '+(sp.has(p.key)?'sel-'+p.key:'');
  });
}

async function importGcalEvents(){
  const toImport=[];
  gcalEvents.forEach(ev=>{
    const sp=gcalSelected.get(ev.id)||new Set();
    sp.forEach(person=>toImport.push({date:ev.date,person,name:ev.title,emoji:'📅',time:ev.time||''}));
  });
  if(toImport.length===0){showToast('Välj minst en händelse!');return;}
  const btn=document.getElementById('gcal-import-btn');
  btn.textContent='Importerar...';btn.disabled=true;
  try{
    for(const ev of toImport){
      const saved=await sbFetch('events',{method:'POST',body:JSON.stringify(ev)});
      if(saved&&saved[0])events.push(saved[0]);
    }
    events=sortEvs(events);
    closeGcalModal();render();
    showToast(toImport.length+' händelser importerade ✅');
  }catch(e){showToast('Kunde inte importera 😕');}
  btn.textContent='Importera valda';btn.disabled=false;
}

function closeGcalModal(){document.getElementById('gcal-modal-bg').classList.remove('open');}

// ── DATUM ──
function getWeekStart(d){const date=new Date(d);const day=date.getDay();const diff=day===0?-6:1-day;date.setDate(date.getDate()+diff);date.setHours(0,0,0,0);return date;}
function dateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function isToday(d){const t=new Date();return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate();}
function fmtDate(d){const m=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];return d.getDate()+' '+m[d.getMonth()];}
function weekNum(d){const date=new Date(d);date.setHours(0,0,0,0);date.setDate(date.getDate()+3-(date.getDay()+6)%7);const w1=new Date(date.getFullYear(),0,4);return 1+Math.round(((date-w1)/86400000-3+(w1.getDay()+6)%7)/7);}
const DN=['Sön','Mån','Tis','Ons','Tor','Fre','Lör'],DNF=['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];

async function loadWeek(){
  const btn=document.getElementById('sync-btn');btn.classList.add('syncing');
  try{
    const from=dateStr(currentWeekStart),to=dateStr(addDays(currentWeekStart,6));
    const rows=await sbFetch('events?date=gte.'+from+'&date=lte.'+to+'&order=date.asc,time.asc');
    events=sortEvs(rows);render();
  }catch(e){showToast('Kunde inte hämta data 😕');}
  btn.classList.remove('syncing');
}

function render(){
  const ws=currentWeekStart,wn=weekNum(ws),months=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  document.getElementById('week-label').textContent='v.'+wn+' · '+months[ws.getMonth()]+' '+ws.getFullYear();
  document.getElementById('week-nav-label').textContent=fmtDate(ws)+' – '+fmtDate(addDays(ws,6));
  if(currentView==='family'){renderFamily();document.getElementById('legend').style.display='flex';}
  else{renderOlle();document.getElementById('legend').style.display='none';}
}

function renderFamily(){
  const cw=document.getElementById('cal-wrap');cw.style.display='block';
  const ob=document.getElementById('olle-body');if(ob)ob.remove();
  const table=document.getElementById('cal-table');
  let html='<thead class="cal-head"><tr><th>Dag</th><th class="col-alvar-head">Alvar</th><th class="col-olle-head">⭐ Olle</th><th class="col-nils-head">Nils</th><th class="col-pappa-head">Pappa & Lina</th><th class="col-ovrigt-head">Övrigt</th></tr></thead><tbody>';
  for(let i=0;i<7;i++){
    const day=addDays(currentWeekStart,i),ds=dateStr(day),today=isToday(day),dayEvs=events.filter(e=>e.date===ds);
    html+='<tr class="cal-row '+(today?'today':'')+'"><td class="day-label-cell"><div class="day-number">'+day.getDate()+'</div><div class="day-name">'+DN[day.getDay()]+'</div>'+(today?'<div class="today-dot"></div>':'')+'</td>';
    ['alvar','olle','nils','pappa','ovrigt'].forEach(person=>{
      const p=PERSONS.find(x=>x.key===person),pevs=dayEvs.filter(e=>e.person===person);
      html+='<td class="day-cell" onclick="openAddModal(\''+ds+'\',\''+person+'\')">';
      pevs.forEach(ev=>{html+='<div class="event-chip '+p.chipCls+'" onclick="event.stopPropagation();openEditModal('+ev.id+')"><span style="font-size:12px;flex-shrink:0">'+ev.emoji+'</span><span style="flex:1;word-break:break-word">'+(ev.time?'<span class="chip-time">'+ev.time+'</span>':'')+ev.name+'</span><span class="chip-del" onclick="event.stopPropagation();deleteEvent('+ev.id+')">✕</span></div>';});
      html+='<div class="add-chip" onclick="event.stopPropagation();openAddModal(\''+ds+'\',\''+person+'\')">+</div></td>';
    });
    html+='</tr>';
  }
  table.innerHTML=html+'</tbody>';
}

function renderOlle(){
  document.getElementById('cal-wrap').style.display='none';
  let ob=document.getElementById('olle-body');
  if(!ob){ob=document.createElement('div');ob.id='olle-body';document.getElementById('scroll-body').appendChild(ob);}
  ob.innerHTML='';
  const wrap=document.createElement('div');wrap.className='olle-week';
  for(let i=0;i<7;i++){
    const day=addDays(currentWeekStart,i),ds=dateStr(day),today=isToday(day);
    const olleEvs=events.filter(e=>e.date===ds&&e.person==='olle');
    const famEvs=events.filter(e=>e.date===ds&&e.person!=='olle');
    const card=document.createElement('div');card.className='olle-day-card'+(today?' today':'');
    let inner='<div class="olle-day-header"><div class="olle-day-num">'+day.getDate()+'</div><div class="olle-day-name">'+DNF[day.getDay()]+'</div>'+(today?'<div class="olle-today-badge">Idag</div>':'')+'</div>';
    if(olleEvs.length>0){inner+='<div class="olle-events">';olleEvs.forEach(ev=>{
      const isMood=ev.type==='mood';
      const moodBadge=isMood&&ev.mood_response?'<span style="font-size:22px;margin-left:4px">'+ev.mood_response+'</span>':'';
      const iconOrEmoji=isMood?'&#128512;':ev.emoji;
      inner+='<div class="olle-event'+(isMood?' mood-event':'')+'" onclick="say(\''+ev.name+(ev.time?' klockan '+ev.time:'')+'\')"><div class="olle-event-icon">'+iconOrEmoji+'</div><div style="flex:1"><div class="olle-event-name">'+ev.name+moodBadge+'</div>'+(ev.time?'<div class="olle-event-time">kl '+ev.time+'</div>':'')+'</div><div style="display:flex;gap:6px"><div class="olle-speak" onclick="event.stopPropagation();openEditModal('+ev.id+')" title="Redigera">&#9998;</div><div class="olle-speak" onclick="event.stopPropagation();deleteEvent('+ev.id+')" title="Ta bort" style="color:#E24B4A">&#128465;</div></div></div>';
    });inner+='</div>';}
    else{inner+='<div class="olle-empty">Inget inbokat ännu</div>';}
    if(famEvs.length>0){inner+='<div class="olle-fam-row">';famEvs.slice(0,4).forEach(ev=>{const p=PERSONS.find(x=>x.key===ev.person);inner+='<div class="fam-chip" style="background:'+p.color+'22;color:'+p.color+';border:1px solid '+p.color+'44">'+ev.emoji+' '+(ev.name.length>14?ev.name.slice(0,14)+'…':ev.name)+'</div>';});inner+='</div>';}
    card.innerHTML=inner;wrap.appendChild(card);
  }
  ob.appendChild(wrap);
}

function setView(v){currentView=v;document.getElementById('vt-fam').classList.toggle('on',v==='family');document.getElementById('vt-olle').classList.toggle('on',v==='olle');render();}
function shiftWeek(n){currentWeekStart=addDays(currentWeekStart,n*7);loadWeek();}

async function deleteEvent(id){
  try{await sbFetch('events?id=eq.'+id,{method:'DELETE'});events=events.filter(e=>e.id!==id);render();showToast('Borttaget ✓');}
  catch(e){showToast('Kunde inte ta bort 😕');}
}

let selDays = new Set();
let editId = null; // null = ny händelse, number = redigera befintlig

var selEventType='normal';

function setEventType(type){
  selEventType=type;
  document.getElementById('type-normal').classList.toggle('sel',type==='normal');
  document.getElementById('type-mood').classList.toggle('sel',type==='mood');
  document.getElementById('normal-fields').style.display=type==='normal'?'block':'none';
  document.getElementById('mood-fields').style.display=type==='mood'?'block':'none';
  if(type==='mood'){
    document.getElementById('ev-name').value='Hur mar du idag?';
  }
}

function openAddModal(ds, person) {
  editId = null;
  const editDay = ds || dateStr(currentWeekStart);
  selPersons = new Set([person || 'olle']);
  selDays = new Set([editDay]);
  selSym = '&#11088;';
  setEventType('normal');
  document.getElementById('modal-title').textContent = 'Ny handelse';
  document.getElementById('sym-grid').innerHTML = SYMS.map(s =>
    '<div class="sp' + (s === selSym ? ' sel' : '') + '" onclick="pickSym(\'' + s + '\',this)">' + s + '</div>'
  ).join('');
  renderPersonGrid();
  renderDayGrid();
  document.getElementById('ev-name').value = '';
  document.getElementById('ev-time').value = '';
  document.getElementById('modal-bg').classList.add('open');
}

function openEditModal(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  editId = id;
  selPersons = new Set([ev.person]);
  selDays = new Set([ev.date]);
  selSym = ev.emoji || '&#11088;';
  const evType = ev.type || 'normal';
  setEventType(evType);
  document.getElementById('modal-title').textContent = 'Redigera handelse';
  document.getElementById('sym-grid').innerHTML = SYMS.map(s =>
    '<div class="sp' + (s === selSym ? ' sel' : '') + '" onclick="pickSym(\'' + s + '\',this)">' + s + '</div>'
  ).join('');
  renderPersonGrid();
  renderDayGrid();
  document.getElementById('ev-name').value = ev.name;
  document.getElementById('ev-time').value = ev.time || '';
  document.getElementById('modal-bg').classList.add('open');
}

function renderDayGrid() {
  const todayDs = dateStr(new Date());
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(currentWeekStart, i);
    const ds = dateStr(d);
    const isSel = selDays.has(ds);
    const isToday = ds === todayDs;
    html += '<button class="day-btn' + (isSel ? ' sel' : '') + (isToday ? ' today-day' : '') + '" onclick="toggleDay(\'' + ds + '\')">'
      + '<div style="font-size:10px;opacity:.7">' + DN[d.getDay()] + '</div>'
      + '<div>' + d.getDate() + '</div>'
      + '</button>';
  }
  document.getElementById('day-grid').innerHTML = html;
}

function toggleDay(ds) {
  if (selDays.has(ds)) selDays.delete(ds); else selDays.add(ds);
  renderDayGrid();
}

function renderPersonGrid(){
  document.getElementById('person-grid').innerHTML=PERSONS.map(p=>{
    const isSel=selPersons.has(p.key);
    return '<button class="person-btn '+(isSel?'sel-'+p.key:'')+' " onclick="togglePerson(\''+p.key+'\')">'+(p.label)+'<span class="person-check">'+(isSel?'&#10003;':'')+'</span></button>';
  }).join('');
}

function togglePerson(key){
  if(selPersons.has(key))selPersons.delete(key);else selPersons.add(key);
  renderPersonGrid();
}

function closeModal(){document.getElementById('modal-bg').classList.remove('open');}
function pickSym(s,el){selSym=s;document.querySelectorAll('.sp').forEach(b=>b.classList.remove('sel'));el.classList.add('sel');}

async function saveEvent(){
  const nameRaw=document.getElementById('ev-name').value.trim();
  const name=nameRaw||(selEventType==='mood'?'Hur mar du idag?':'');
  if(!name){showToast('Skriv ett namn!');return;}
  if(selPersons.size===0){showToast('Valj minst en person!');return;}
  if(selDays.size===0){showToast('Valj minst en dag!');return;}
  const time=document.getElementById('ev-time').value;
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const emoji=selEventType==='mood'?'&#128512;':selSym;

  // Redigera befintlig
  if(editId!==null){
    try{
      const ds=Array.from(selDays)[0];
      const person=Array.from(selPersons)[0];
      await sbFetch('events?id=eq.'+editId,{
        method:'PATCH',
        body:JSON.stringify({date:ds,person:person,name:name,emoji:emoji,time:time||'',timezone:tz,type:selEventType})
      });
      const idx=events.findIndex(e=>e.id===editId);
      if(idx>=0)events[idx]={...events[idx],date:ds,person:person,name:name,emoji:emoji,time:time||'',type:selEventType};
      events=sortEvs(events);
      closeModal();render();showToast('Uppdaterat!');
    }catch(e){showToast('Kunde inte uppdatera');}
    return;
  }

  // Ny händelse
  try{
    for(const ds of selDays){
      for(const person of selPersons){
        const saved=await sbFetch('events',{method:'POST',body:JSON.stringify({date:ds,person:person,name:name,emoji:emoji,time:time||'',timezone:tz,type:selEventType})});
        if(saved&&saved[0])events.push(saved[0]);
      }
    }
    events=sortEvs(events);
    closeModal();render();
    const tot=selDays.size*selPersons.size;
    showToast(tot===1?'Sparat!':tot+' poster sparade!');
  }catch(e){showToast('Kunde inte spara');}
}

const synth=window.speechSynthesis;
function say(txt){if(!synth)return;synth.cancel();const u=new SpeechSynthesisUtterance(txt);u.lang='sv-SE';u.rate=0.88;synth.speak(u);}
let toastTimer;
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2500);}

async function copyPrevWeek(){
  const prevStart=addDays(currentWeekStart,-7);
  const prevEnd=addDays(currentWeekStart,-1);
  const thisFrom=dateStr(currentWeekStart);
  const thisTo=dateStr(addDays(currentWeekStart,6));

  try{
    // Hämta förra veckans aktiviteter
    const prevRows=await sbFetch('events?date=gte.'+dateStr(prevStart)+'&date=lte.'+dateStr(prevEnd)+'&person=eq.olle&order=date.asc,time.asc');
    if(prevRows.length===0){showToast('Inga aktiviteter förra veckan');return;}

    // Kolla vad som redan finns denna vecka
    const thisRows=await sbFetch('events?date=gte.'+thisFrom+'&date=lte.'+thisTo+'&person=eq.olle');
    const existingKeys=new Set(thisRows.map(e=>e.date.slice(5)+e.time+e.name));

    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    let copied=0;

    for(const ev of prevRows){
      // Beräkna motsvarande dag denna vecka (flytta 7 dagar fram)
      const newDate=dateStr(addDays(new Date(ev.date+'T12:00:00'),7));
      const key=newDate.slice(5)+(ev.time||'')+ev.name;
      if(existingKeys.has(key))continue; // Hoppa över dubletter

      const saved=await sbFetch('events',{method:'POST',body:JSON.stringify({
        date:newDate,
        person:'olle',
        name:ev.name,
        emoji:ev.emoji,
        time:ev.time||'',
        timezone:tz
      })});
      if(saved&&saved[0])events.push(saved[0]);
      copied++;
    }

    events=sortEvs(events);
    render();
    showToast(copied===0?'Allt finns redan!':copied+' aktiviteter kopierade!');
  }catch(e){showToast('Kunde inte kopiera');}
}

loadWeek();
checkGcalToken();

window.loadWeek=loadWeek;window.setView=setView;window.shiftWeek=shiftWeek;
window.openAddModal=openAddModal;window.closeModal=closeModal;window.closeGcalModal=closeGcalModal;
window.pickSym=pickSym;window.togglePerson=togglePerson;
window.saveEvent=saveEvent;window.deleteEvent=deleteEvent;window.say=say;
window.openEditModal=openEditModal;
window.toggleDay=toggleDay;window.handleGcalBtn=handleGcalBtn;window.toggleGcalRow=toggleGcalRow;
window.toggleGcalPerson=toggleGcalPerson;window.importGcalEvents=importGcalEvents;
window.copyPrevWeek=copyPrevWeek;
window.setEventType=setEventType;
