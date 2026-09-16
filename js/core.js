/* ==================== 連線設定（固定值） ==================== */
const SUPABASE_URL='https://ekzqrpgrxicyvaqagdjp.supabase.co';
const ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrenFycGdyeGljeXZhcWFnZGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Mjk0MzIsImV4cCI6MjEwNTEwNTQzMn0._q-9afZXr-mgAcOWFF2ePVK5tp4YGw9yabMMmv6mV_s';

/* ==================== 登入狀態 ==================== */
const AUTH={
  get access(){return localStorage.getItem('fops.at')||''},
  get refresh(){return localStorage.getItem('fops.rt')||''},
  get expAt(){return Number(localStorage.getItem('fops.exp')||0)},
  set(a,r,expSec){localStorage.setItem('fops.at',a);localStorage.setItem('fops.rt',r);
    localStorage.setItem('fops.exp',String(Date.now()+(Number(expSec)||3600)*1000))},
  clear(){['fops.at','fops.rt','fops.exp'].forEach(k=>localStorage.removeItem(k))}
};
let ME=null,PROFILES=[],DEPTS=[];

async function authFetch(path,body){
  const r=await fetch(`${SUPABASE_URL}/auth/v1${path}`,{method:'POST',
    headers:{apikey:ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error_description||j.msg||j.error||'發生錯誤，請稍後再試');
  return j;
}
async function refreshSession(){
  if(!AUTH.refresh)throw new Error('no refresh token');
  const j=await authFetch('/token?grant_type=refresh_token',{refresh_token:AUTH.refresh});
  AUTH.set(j.access_token,j.refresh_token,j.expires_in);
}
async function ensureSession(){
  if(!AUTH.access)return;
  if(Date.now()>AUTH.expAt-60000){try{await refreshSession()}catch(e){AUTH.clear()}}
}
async function getMe(){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:ANON_KEY,Authorization:'Bearer '+AUTH.access}});
  if(!r.ok)throw new Error('SESSION_INVALID');
  return r.json();
}
async function onLogin(e){
  e.preventDefault();if(busy)return;
  const email=$('#li_email').value.trim(),pw=$('#li_pw').value;
  busy=true;const b=$('#authBtn');if(b)b.disabled=true;toast('登入中…');
  try{
    const j=await authFetch('/token?grant_type=password',{email,password:pw});
    AUTH.set(j.access_token,j.refresh_token,j.expires_in);
    await boot();
  }catch(err){toast(err.message,1)}
  finally{busy=false;const bb=$('#authBtn');if(bb)bb.disabled=false}
}
async function onSignup(e){
  e.preventDefault();if(busy)return;
  const name=$('#su_name').value.trim(),email=$('#su_email').value.trim(),pw=$('#su_pw').value;
  busy=true;const b=$('#authBtn');if(b)b.disabled=true;toast('註冊中…');
  try{
    const j=await authFetch('/signup',{email,password:pw,data:{name}});
    if(j.access_token){AUTH.set(j.access_token,j.refresh_token,j.expires_in);await boot()}
    else{authTab='login';render();toast('註冊成功，請完成信箱驗證後再登入')}
  }catch(err){toast(err.message,1)}
  finally{busy=false;const bb=$('#authBtn');if(bb)bb.disabled=false}
}
function doLogout(){
  const tok=AUTH.access;AUTH.clear();ME=null;PROFILES=[];DEPTS=[];view='dash';authTab='login';render();
  if(tok)fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:ANON_KEY,Authorization:'Bearer '+tok}}).catch(()=>{});
}
async function boot(){
  if(!AUTH.access){ME=null;render();return}
  $('#app').innerHTML='<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  try{
    await ensureSession();
    if(!AUTH.access)throw new Error('SESSION_INVALID');
    const u=await getMe();
    const rows=await api('profiles','GET',{query:`?id=eq.${u.id}&select=*`});
    const prof=rows&&rows[0];
    if(!prof)throw new Error('找不到帳號資料');
    ME={id:u.id,email:u.email,name:prof.name||u.email,role:prof.role,status:prof.status,perms:prof.perms||{},dept_id:prof.dept_id||null};
    if(ME.status==='active'){
      await loadAll();
      await loadDepts();
      if(ME.role==='admin')await loadProfiles();
      if(typeof onBootActive==='function')await onBootActive();
    }
  }catch(e){AUTH.clear();ME=null}
  render();
}

/* ==================== 資料表存取（帶使用者 access token，讓 RLS 生效） ==================== */
const TABLES=['vehicles','drivers','customers','trips','maint','petty','billing','insurance','docs'];
let CACHE={};
TABLES.forEach(t=>CACHE[t]=[]);

async function api(table,method,opt={}){
  await ensureSession();
  const h={apikey:ANON_KEY,Authorization:'Bearer '+(AUTH.access||ANON_KEY),'Content-Type':'application/json'};
  if(method!=='GET')h.Prefer='return=representation';
  const q=opt.query||(method==='GET'?'?select=*':'');
  const doFetch=()=>fetch(`${SUPABASE_URL}/rest/v1/${table}${q}`,{method,headers:h,body:opt.body?JSON.stringify(opt.body):undefined});
  let r=await doFetch();
  if(r.status===401){
    try{await refreshSession();h.Authorization='Bearer '+AUTH.access;r=await doFetch()}catch(_){}
  }
  if(!r.ok)throw new Error(`${r.status} ${(await r.text()).slice(0,200)}`);
  return r.status===204?null:r.json();
}
async function loadAll(){
  try{const res=await Promise.all(TABLES.map(t=>api(t,'GET')));TABLES.forEach((t,i)=>CACHE[t]=res[i]||[])}
  catch(e){/* 個別模組畫面會在操作時顯示錯誤 */}
}
async function loadProfiles(){
  try{PROFILES=await api('profiles','GET',{query:'?select=*&order=created_at.asc'})}catch(e){PROFILES=[]}
}
async function loadDepts(){
  try{DEPTS=await api('departments','GET',{query:'?select=*&order=sort.asc'})}catch(e){DEPTS=[]}
}
function deptName(id){const d=DEPTS.find(x=>x.id===id);return d?d.name:''}

/* ==================== 工具 ==================== */
const $=s=>document.querySelector(s);
const money=n=>Number(n||0).toLocaleString('zh-TW');
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function monthStart(){return today().slice(0,8)+'01'}
function monthRange(offset){
  const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset);
  const y=d.getFullYear(),m=d.getMonth();
  const start=`${y}-${String(m+1).padStart(2,'0')}-01`;
  const endD=new Date(y,m+1,0);
  const end=`${y}-${String(m+1).padStart(2,'0')}-${String(endD.getDate()).padStart(2,'0')}`;
  return {start,end};
}
function daysTo(d){if(!d)return null;return Math.round((new Date(d)-new Date(today()))/86400000)}
function formatMoneyLive(el){
  let raw=el.value.replace(/[^0-9.\-]/g,'');
  const neg=raw.startsWith('-');if(neg)raw=raw.slice(1);
  const parts=raw.split('.');
  let intPart=parts[0].replace(/^0+(?=\d)/,'');
  intPart=intPart.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const out=(neg?'-':'')+intPart+(parts.length>1?'.'+parts[1].slice(0,2):'');
  const pos=el.selectionStart,oldLen=el.value.length;
  el.value=out;
  const newPos=Math.max(0,pos+(out.length-oldLen));
  try{el.setSelectionRange(newPos,newPos)}catch(_){}
}

/* ==================== 模組 ==================== */
const CAT_MAINT=['定期保養','輪胎','煞車系統','引擎','變速箱／離合器','電系／電瓶','氣壓系統','液壓／油壓','冷氣','車體板金／烤漆','拖板／尾門／貨櫃鎖','定期檢驗','事故維修','其他'];
const CAT_PETTY=['油資','過路費','停車費','耗材','餐費','文具','郵電','清潔','規費','司機零用','其他'];
const CAT_DOC=['公文','合約','信件','切結書','報價單','其他'];
const CAT_INS=['強制險','第三人責任險','車體險','貨物險','定期檢驗','牌照稅','燃料費','營業執照'];

const M={
  dash:{name:'總覽',icon:'📊',render:()=>dashHTML()},
  trips:{name:'出車報班',icon:'🚚',sum:['freight','bonus'],
    fields:[{k:'date',t:'date',l:'日期',req:1,def:'today',c:6},
      {k:'plate',t:'ref',ref:'vehicles',rk:'plate',l:'車號',req:1,plate:1,c:6},
      {k:'driver',t:'ref',ref:'drivers',rk:'name',l:'駕駛',req:1,c:6},
      {k:'customer',t:'ref',ref:'customers',rk:'name',l:'客戶',c:6},
      {k:'from',t:'text',l:'起點',c:6},{k:'to',t:'text',l:'迄點',c:6},
      {k:'trips',t:'number',l:'趟次',c:4},{k:'weight',t:'number',l:'噸數／件數',c:4},
      {k:'freight',t:'number',l:'運費',money:1,c:4},
      {k:'bonus',t:'number',l:'加班／獎金',money:1,c:6},
      {k:'deduct',t:'number',l:'扣款',money:1,c:6},
      {k:'note',t:'textarea',l:'備註',c:12}],
    cols:['date','plate','driver','customer','route','trips','freight','bonus']},
  maint:{name:'車輛維修',icon:'🔧',sum:['amount'],unpaid:'amount',
    fields:[{k:'plate',t:'ref',ref:'vehicles',rk:'plate',l:'車號',req:1,plate:1,c:6},
      {k:'date',t:'date',l:'進廠日期',req:1,def:'today',c:6},
      {k:'done',t:'date',l:'完工日期',c:6},
      {k:'driver',t:'ref',ref:'drivers',rk:'name',l:'駕駛',c:6},
      {k:'vendor',t:'text',l:'維修廠商',free:1,c:6},
      {k:'cat',t:'select',opts:CAT_MAINT,l:'維修類別',c:6},
      {k:'items',t:'textarea',l:'維修項目',c:12},
      {k:'labor',t:'number',l:'工資',money:1,c:6},
      {k:'parts',t:'number',l:'零件費',money:1,c:6},
      {k:'amount',t:'number',l:'合計',req:1,money:1,autosum:['labor','parts'],c:6},
      {k:'paid',t:'select',opts:['未付','已付'],l:'付款狀態',c:6},
      {k:'mileage',t:'number',l:'里程數',c:6},
      {k:'next',t:'number',l:'下次保養里程',c:6},
      {k:'invoice',t:'text',l:'發票號碼',c:12},
      {k:'note',t:'textarea',l:'備註',c:12},
      {k:'scans',t:'images',l:'單據照片',c:12}],
    cols:['plate','date','cat','vendor','items','amount','mileage','paid','scans']},
  petty:{name:'零用金',icon:'🧾',sum:['amount'],
    fields:[{k:'date',t:'date',l:'日期',req:1,def:'today',c:6},
      {k:'cat',t:'select',opts:CAT_PETTY,l:'分類',req:1,c:6},
      {k:'item',t:'text',l:'品名／用途',req:1,c:12},
      {k:'amount',t:'number',l:'金額',req:1,money:1,c:6},
      {k:'payer',t:'text',l:'付款人',free:1,c:6},
      {k:'plate',t:'ref',ref:'vehicles',rk:'plate',l:'相關車號',plate:1,c:6},
      {k:'invoice',t:'text',l:'發票／收據號',c:6},
      {k:'note',t:'textarea',l:'備註',c:12},
      {k:'scans',t:'images',l:'收據照片',c:12}],
    cols:['date','cat','item','payer','plate','amount','scans']},
  billing:{name:'客戶對帳',icon:'💰',sum:['amount','tax'],unpaid:'amount',
    fields:[{k:'date',t:'date',l:'日期',req:1,def:'today',c:6},
      {k:'kind',t:'select',opts:['銷項','進項'],l:'類型',req:1,c:6},
      {k:'customer',t:'ref',ref:'customers',rk:'name',l:'客戶／廠商',req:1,c:12},
      {k:'invoice',t:'text',l:'發票號碼',c:6},
      {k:'period',t:'text',l:'所屬期別',c:6},
      {k:'amount',t:'number',l:'金額（未稅）',req:1,money:1,c:6},
      {k:'tax',t:'number',l:'稅額',money:1,c:6},
      {k:'paid',t:'select',opts:['未收','已收'],l:'收款狀態',c:6},
      {k:'paydate',t:'date',l:'收款日',c:6},
      {k:'note',t:'textarea',l:'備註',c:12},
      {k:'scans',t:'images',l:'單據照片',c:12}],
    cols:['date','kind','customer','invoice','amount','tax','paid','scans']},
  insurance:{name:'保險／到期',icon:'📅',sum:['premium'],
    fields:[{k:'plate',t:'ref',ref:'vehicles',rk:'plate',l:'車號',req:1,plate:1,c:6},
      {k:'cat',t:'select',opts:CAT_INS,l:'類型',req:1,c:6},
      {k:'company',t:'text',l:'保險公司／機關',free:1,c:6},
      {k:'policy',t:'text',l:'保單／證號',c:6},
      {k:'start',t:'date',l:'生效日',c:6},
      {k:'end',t:'date',l:'到期日',req:1,c:6},
      {k:'premium',t:'number',l:'保費／規費',money:1,c:6},
      {k:'paid',t:'select',opts:['未付','已付'],l:'繳費狀態',c:6},
      {k:'note',t:'textarea',l:'備註',c:12},
      {k:'scans',t:'images',l:'保單照片',c:12}],
    cols:['plate','cat','company','start','end','due','premium','paid','scans']},
  docs:{name:'公文合約建檔',icon:'📁',
    fields:[{k:'date',t:'date',l:'日期',req:1,def:'today',c:6},
      {k:'cat',t:'select',opts:CAT_DOC,l:'類型',req:1,c:6},
      {k:'title',t:'text',l:'主旨／標題',req:1,c:12},
      {k:'party',t:'text',l:'來文者／對象',free:1,c:6},
      {k:'docno',t:'text',l:'文號',c:6},
      {k:'tags',t:'text',l:'分類標籤',c:6},
      {k:'due',t:'date',l:'期限／到期',c:6},
      {k:'note',t:'textarea',l:'摘要／備註',c:12},
      {k:'scans',t:'images',l:'掃描檔',c:12}],
    cols:['date','cat','title','party','docno','due','scans']},
  payroll:{name:'薪資計算',icon:'🧮',render:()=>payrollHTML()},
  vehicles:{name:'車輛',icon:'',
    fields:[{k:'plate',t:'text',l:'車號',req:1,plate:1,c:6},
      {k:'vtype',t:'select',opts:['曳引車','半拖車','貨車','吊車','其他'],l:'車種',c:6},
      {k:'driver',t:'ref',ref:'drivers',rk:'name',l:'固定駕駛',c:6},
      {k:'status',t:'select',opts:['在用','維修中','停用'],l:'狀態',c:6},
      {k:'note',t:'textarea',l:'備註',c:12}],
    cols:['plate','vtype','driver','status','note']},
  drivers:{name:'駕駛',icon:'',
    fields:[{k:'name',t:'text',l:'姓名',req:1,c:6},
      {k:'phone',t:'text',l:'電話',c:6},
      {k:'base',t:'number',l:'底薪',money:1,c:6},
      {k:'rate',t:'number',l:'趟次抽成（每趟）',money:1,c:6},
      {k:'pct',t:'number',l:'運費抽成（％）',c:6},
      {k:'status',t:'select',opts:['在職','離職'],l:'狀態',c:6},
      {k:'note',t:'textarea',l:'備註',c:12}],
    cols:['name','phone','base','rate','pct','status']},
  customers:{name:'客戶／廠商',icon:'',
    fields:[{k:'name',t:'text',l:'名稱',req:1,c:12},
      {k:'tax',t:'text',l:'統一編號',c:6},
      {k:'contact',t:'text',l:'聯絡人',c:6},
      {k:'phone',t:'text',l:'電話',c:6},
      {k:'kind',t:'select',opts:['客戶','廠商','兩者'],l:'屬性',c:6},
      {k:'note',t:'textarea',l:'備註',c:12}],
    cols:['name','tax','contact','phone','kind']},
  admin:{name:'帳號管理',icon:'👤',render:()=>adminHTML()}
};
const COLMAP={date:'日期',plate:'車號',driver:'駕駛',customer:'客戶',route:'路線',trips:'趟次',
freight:'運費',bonus:'加班',cat:'類別',vendor:'廠商',items:'項目',amount:'金額',mileage:'里程',
paid:'狀態',scans:'檔案',item:'品名',payer:'付款人',kind:'類型',invoice:'發票',tax:'稅額',
company:'公司／機關',start:'生效',end:'到期',due:'剩餘',premium:'保費',title:'主旨',party:'對象',
docno:'文號',vtype:'車種',status:'狀態',note:'備註',name:'姓名',phone:'電話',base:'底薪',
rate:'每趟',pct:'抽成％',contact:'聯絡人',done:'完工'};

/* 導覽：其他階段的 js 檔會 push 進這些陣列 / 物件來擴充選單與權限，不需要改這個檔案 */
const NAV_GROUPS=[
  {label:'日常作業',keys:['trips','maint','petty','billing']},
  {label:'建檔管理',keys:['insurance','docs']},
  {label:'報表',keys:['payroll']},
  {label:'基本資料',keys:['vehicles','drivers','customers']}
];
const SYSTEM_GROUP={label:'系統',keys:['admin']};
const PERM_OF={vehicles:'masters',drivers:'masters',customers:'masters',files:'uploads'};
const ADMIN_ONLY_KEYS=['admin'];
const MODLIST=[
  {key:'trips',label:'出車報班'},{key:'maint',label:'車輛維修'},{key:'petty',label:'零用金'},
  {key:'billing',label:'客戶對帳'},{key:'insurance',label:'保險到期'},{key:'docs',label:'公文建檔'},
  {key:'payroll',label:'薪資計算'},{key:'masters',label:'基本資料'},{key:'admin',label:'帳號管理'},
  {key:'workflow',label:'流程設定'},{key:'tasks',label:'我的工作'},{key:'uploads',label:'檔案庫'}
];
function canSee(key){
  if(key==='help')return !!ME;
  if(ADMIN_ONLY_KEYS.includes(key))return !!(ME&&ME.role==='admin');
  if(!ME)return false;
  if(ME.role==='admin')return true;
  const perm=PERM_OF[key]||key;
  return !!(ME.perms&&ME.perms[perm]===true);
}

let view='dash',pending=[],editId='',autoTouched={},busy=false,F={},pMonth=today().slice(0,7),authTab='login',expandedUser='';

/* ==================== 導覽 ==================== */
function renderNav(){
  const dueN=CACHE.insurance.filter(r=>{const d=daysTo(r.end);return d!==null&&d<=30}).length;
  const pendN=PROFILES.filter(p=>p.status==='pending').length;
  const badgeFor=k=>{
    if(k==='insurance'&&dueN)return `<span class="badge">${dueN}</span>`;
    if(k==='admin'&&pendN)return `<span class="badge">${pendN}</span>`;
    if(typeof navBadge==='function'){const b=navBadge(k);if(b)return `<span class="badge">${b}</span>`}
    return '';
  };
  const grp=(t,keys)=>{
    const vis=keys.filter(canSee);
    if(!vis.length)return '';
    return `<div class="grp">${t}</div>`+vis.map(k=>
      `<a class="${view===k?'on':''}" onclick="go('${k}')">${M[k].icon} ${M[k].name}${badgeFor(k)}</a>`).join('')};
  let html=`<div class="brand">貨運行營運系統</div>`
    +(canSee('dash')?`<a class="${view==='dash'?'on':''}" onclick="go('dash')">📊 總覽</a>`:'');
  NAV_GROUPS.forEach(g=>{html+=grp(g.label,g.keys)});
  html+=grp(SYSTEM_GROUP.label,SYSTEM_GROUP.keys);
  if(canSee('help'))html+=`<a class="${view==='help'?'on':''}" onclick="go('help')">❓ 使用說明</a>`;
  $('#nav').innerHTML=html;
}
function go(k){if(!canSee(k)&&k!=='dash')return;view=k;pending=[];editId='';autoTouched={};F={};expandedUser='';render();window.scrollTo(0,0)}

/* ==================== 影像 ==================== */
function shrink(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=rej;
  fr.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>{const mx=1100;let w=im.width,h=im.height;
    if(w>mx||h>mx){const r=Math.min(mx/w,mx/h);w=Math.round(w*r);h=Math.round(h*r)}
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);
    res(c.toDataURL('image/jpeg',.68))};im.src=fr.result};fr.readAsDataURL(file)})}
async function addFiles(inp){
  for(const f of inp.files){if(!f.type.startsWith('image/'))continue;
    try{pending.push(await shrink(f))}catch(_){toast('有一張照片讀不進來',1)}}
  inp.value='';drawThumbs()}
function drawThumbs(){const el=$('#thumbs');if(!el)return;
  el.innerHTML=pending.map((d,i)=>`<figure><img src="${d}" alt=""><button type="button" class="x" onclick="pending.splice(${i},1);drawThumbs()">×</button></figure>`).join('')}
function zoom(src){$('#viewerImg').src=src;$('#viewer').showModal()}
function toast(t,e){const el=$('#toast');if(!el)return;el.textContent=t;el.className='toast'+(e?' err':'');
  if(t&&!e)setTimeout(()=>{if(el.textContent===t)el.textContent=''},4000)}

/* ==================== 表單 ==================== */
function fieldHTML(f,v){
  const id='f_'+f.k,req=f.req?' <span class="req">*</span>':'';
  let inp='';
  if(f.t==='textarea')inp=`<textarea id="${id}">${esc(v)}</textarea>`;
  else if(f.t==='select')inp=`<select id="${id}">${f.opts.map(o=>`<option${o===v?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(f.t==='ref'){
    const opts=[...new Set(CACHE[f.ref].map(r=>r[f.rk]).filter(Boolean))].sort();
    inp=`<input type="text" id="${id}" list="dl_${f.k}" value="${esc(v)}" autocomplete="off" class="${f.plate?'plateIn':''}">
      <datalist id="dl_${f.k}">${opts.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`}
  else if(f.t==='images'&&typeof imagesFieldHTML==='function')inp=imagesFieldHTML(f);
  else if(f.t==='images')inp=`<div class="filebox"><input type="file" id="fileInput" accept="image/*" multiple onchange="addFiles(this)">
      <button type="button" onclick="document.getElementById('fileInput').click()">選擇照片</button>
      <p>可直接拍單據，會自動縮小後存起來</p><div class="thumbs" id="thumbs"></div></div>`;
  else if(f.t==='number'){
    if(f.money)inp=`<input type="text" inputmode="decimal" id="${id}" value="${v==null||v===''?'':money(v)}" class="moneyIn" oninput="formatMoneyLive(this)${f.autosum?`;autoTouched['${f.k}']=1`:''}${(f.k==='labor'||f.k==='parts')?';sumUp()':''}">`;
    else inp=`<input type="number" id="${id}" value="${v==null?'':v}"${f.autosum?` oninput="autoTouched['${f.k}']=1"`:''}${(f.k==='labor'||f.k==='parts')?' oninput="sumUp()"':''}>`;
  }
  else if(f.t==='date')inp=`<input type="date" id="${id}" value="${esc(v)}">`;
  else{const opts=f.free?[...new Set(CACHE[view].map(r=>r[f.k]).filter(Boolean))].sort():[];
    inp=`<input type="text" id="${id}" value="${esc(v)}" autocomplete="off"${f.free?` list="dl_${f.k}"`:''} class="${f.plate?'plateIn':''}">`
      +(f.free?`<datalist id="dl_${f.k}">${opts.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`:'')}
  return `<div class="field c${f.c||12}"><label for="${id}">${f.l}${req}</label>${inp}</div>`}
function sumUp(){const f=M[view].fields.find(x=>x.autosum);if(!f||autoTouched[f.k])return;
  const t=f.autosum.reduce((a,k)=>a+(Number(String($('#f_'+k)?.value||'').replace(/,/g,''))||0),0);
  const el=$('#f_'+f.k);if(el&&t)el.value=money(t)}
function copyLastTrip(){
  if(view!=='trips'||!CACHE.trips.length)return;
  const last=[...CACHE.trips].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  M.trips.fields.forEach(f=>{if(f.k==='date')return;const el=$('#f_'+f.k);if(!el||last[f.k]==null)return;
    el.value=f.money?money(last[f.k]):last[f.k]});
  toast('已複製上一筆資料，請確認後存檔')}
function formHTML(rec){const m=M[view];
  return `<h2>${rec?'修改':'新增'}${m.name}</h2><form onsubmit="saveRec(event)"><div class="grid">
    ${m.fields.map(f=>{let v=rec?rec[f.k]:'';
      if(!rec&&f.def==='today')v=today();
      if(!rec&&f.t==='select'&&!v)v=f.opts[0];
      return fieldHTML(f,v==null?'':v)}).join('')}
    </div><div class="actions"><button type="submit" class="btn btn-primary" id="saveBtn">${rec?'更新':'存檔'}</button>
    ${rec?`<button type="button" class="btn btn-ghost" onclick="go('${view}')">取消</button>`:''}
    ${(!rec&&view==='trips'&&CACHE.trips.length)?`<button type="button" class="btn btn-ghost" onclick="copyLastTrip()">複製上一筆</button>`:''}</div>
    <div class="toast" id="toast"></div></form>`}

function focusFirstField(){
  const el=$('#main .grid .field:first-child input,#main .grid .field:first-child textarea,#main .grid .field:first-child select');
  if(el)try{el.focus()}catch(_){}
}
async function saveRec(e){
  e.preventDefault();if(busy)return;
  const m=M[view],rec={};
  for(const f of m.fields){
    if(f.t==='images'){rec[f.k]=pending.slice();continue}
    let v=$('#f_'+f.k).value;
    if(f.plate)v=v.trim().toUpperCase();else if(typeof v==='string')v=v.trim();
    if(f.t==='number')v=v===''?null:Number(String(v).replace(/,/g,''));
    if(f.t==='date'&&v==='')v=null;
    if(f.req&&(v===''||v===null)){toast('請填「'+f.l+'」',1);$('#f_'+f.k).focus();return}
    rec[f.k]=v===''?null:v}
  busy=true;$('#saveBtn').disabled=true;toast('儲存中…');
  try{
    if(editId){const out=await api(view,'PATCH',{body:rec,query:`?id=eq.${editId}`});
      const i=CACHE[view].findIndex(r=>r.id===editId);if(i>=0)CACHE[view][i]=out[0]}
    else{const out=await api(view,'POST',{body:rec});CACHE[view].unshift(out[0])}
    editId='';pending=[];autoTouched={};
    render();toast('已存檔');focusFirstField();
  }catch(err){toast('存檔失敗：'+err.message,1)}
  finally{busy=false;const b=$('#saveBtn');if(b)b.disabled=false}
}
function editRec(id){editId=id;const r=CACHE[view].find(x=>x.id===id);
  pending=(r.scans||[]).slice();autoTouched={};
  M[view].fields.forEach(f=>{if(f.autosum)autoTouched[f.k]=1});
  render();window.scrollTo({top:0,behavior:'smooth'})}
async function delRec(id){
  if(!confirm('確定刪除這筆紀錄？'))return;
  try{await api(view,'DELETE',{query:`?id=eq.${id}`});
    CACHE[view]=CACHE[view].filter(r=>r.id!==id);render();toast('已刪除')}
  catch(e){toast('刪除失敗：'+e.message,1)}}
async function togglePaid(id){
  const r=CACHE[view].find(x=>x.id===id);
  const pair=view==='billing'?['未收','已收']:['未付','已付'];
  const nv=r.paid===pair[0]?pair[1]:pair[0];
  try{const out=await api(view,'PATCH',{body:{paid:nv},query:`?id=eq.${id}`});
    Object.assign(r,out[0]);render()}catch(e){toast('更新失敗：'+e.message,1)}}

/* ==================== 清單 ==================== */
function setF(k,v){F[k]=v;const el=$('#listArea');if(el)el.innerHTML=listHTML()}
function cellHTML(r,k){
  if(k==='scans')return typeof scansCellHTML==='function'?scansCellHTML(r):
    ((r.scans||[]).map(s=>`<img src="${s}" onclick="zoom(this.src)" alt="">`).join('')||'<span style="color:var(--muted)">—</span>');
  if(k==='plate')return r.plate?`<span class="plate">${esc(r.plate)}</span>`+(r.vtype?`<div class="meta">${esc(r.vtype)}</div>`:''):'—';
  if(k==='route')return esc([r.from,r.to].filter(Boolean).join(' → ')||'—');
  if(k==='cat'||k==='kind')return `<span class="tag">${esc(r[k]||'—')}</span>`;
  if(k==='paid'){const un=r.paid==='未付'||r.paid==='未收';
    return `<span class="tag ${un?'w':'g'}">${esc(r.paid||'—')}</span><div><button class="rowbtn" onclick="togglePaid('${r.id}')">改</button></div>`}
  if(k==='due'){const d=daysTo(r.end);if(d===null)return '—';
    return `<span class="tag ${d<0?'d':d<=30?'w':''}">${d<0?'已過期 '+(-d)+' 天':d+' 天'}</span>`}
  if(['items','title','note','item'].includes(k))
    return `<div class="wrap2">${esc(r[k]||'—')}</div>`+(k==='items'&&r.note?`<div class="meta">${esc(r.note)}</div>`:'')+(k==='items'&&r.invoice?`<div class="meta">發票 ${esc(r.invoice)}</div>`:'');
  if(['amount','freight','bonus','premium','tax','base','rate','mileage','trips'].includes(k)){
    let ex='';
    if(k==='amount'&&view==='maint'&&(r.labor!=null||r.parts!=null))ex=`<div class="meta">工 ${money(r.labor)} ／ 料 ${money(r.parts)}</div>`;
    if(k==='mileage'&&r.next)ex=`<div class="meta">下次 ${money(r.next)}</div>`;
    return (r[k]==null?'—':money(r[k]))+ex}
  if(k==='date')return esc(r.date||'—')+(r.done?`<div class="meta">完工 ${esc(r.done)}</div>`:'');
  return esc(r[k]||'—')}
function filtered(){
  const m=M[view],dk=m.fields.find(f=>f.t==='date')?.k||'date';
  return CACHE[view].filter(r=>{
    for(const[k,v]of Object.entries(F)){
      if(!v)continue;
      if(k==='_from'){if((r[dk]||'')<v)return false;continue}
      if(k==='_to'){if((r[dk]||'')>v)return false;continue}
      if(k==='_q'){const s=Object.entries(r).filter(([kk])=>kk!=='scans').map(([,vv])=>vv).join(' ').toLowerCase();
        if(!s.includes(v.toLowerCase()))return false;continue}
      if((r[k]||'')!==v)return false}
    return true}).sort((a,b)=>{
    if(view==='insurance')return (a.end||'').localeCompare(b.end||'');
    return (b[dk]||'').localeCompare(a[dk]||'')})}
function listHTML(){
  const m=M[view],rows=filtered(),all=CACHE[view];
  const dk=m.fields.find(f=>f.t==='date')?.k;
  let f=`<div class="filters">`;
  m.fields.filter(x=>x.t==='select').forEach(x=>{
    const o=[...new Set(all.map(r=>r[x.k]).filter(Boolean))].sort();
    f+=`<div class="field"><label>${x.l}</label><select onchange="setF('${x.k}',this.value)">
      <option value="">全部</option>${o.map(v=>`<option${F[x.k]===v?' selected':''}>${esc(v)}</option>`).join('')}</select></div>`});
  m.fields.filter(x=>x.plate).forEach(x=>{
    const o=[...new Set(all.map(r=>r[x.k]).filter(Boolean))].sort();
    f+=`<div class="field"><label>車號</label><select onchange="setF('${x.k}',this.value)">
      <option value="">全部</option>${o.map(v=>`<option${F[x.k]===v?' selected':''}>${esc(v)}</option>`).join('')}</select></div>`});
  if(dk)f+=`<div class="field"><label>起</label><input type="date" value="${F._from||''}" onchange="setF('_from',this.value)"></div>
    <div class="field"><label>迄</label><input type="date" value="${F._to||''}" onchange="setF('_to',this.value)"></div>`;
  f+=`<div class="field"><label>搜尋</label><input type="text" value="${F._q||''}" oninput="setF('_q',this.value)" placeholder="關鍵字"></div>
    <button class="btn btn-ghost btn-sm" onclick="F={};render()">清除</button>
    <button class="btn btn-ghost btn-sm" onclick="exportCSV()">匯出 Excel</button></div>`;
  let s='';
  if(m.sum||m.unpaid){
    const tot=k=>rows.reduce((a,r)=>a+(Number(r[k])||0),0);
    s=`<div class="summary"><div><span>筆數</span><strong>${rows.length}</strong></div>`;
    (m.sum||[]).forEach(k=>{s+=`<div><span>${COLMAP[k]||k}合計</span><strong>${money(tot(k))}</strong></div>`});
    if(m.unpaid){const u=rows.filter(r=>r.paid==='未付'||r.paid==='未收').reduce((a,r)=>a+(Number(r[m.unpaid])||0),0);
      s+=`<div class="alert"><span>${view==='billing'?'未收':'未付'}</span><strong>${money(u)}</strong></div>`}
    s+=`</div>`}
  if(!all.length)return f+`<div class="empty"><strong>還沒有紀錄</strong>左邊填一筆，存檔後就會出現在這裡。</div>`;
  const NC=['amount','freight','bonus','premium','tax','mileage','trips','base','rate'];
  return f+s+`<div class="tablewrap"><table><thead><tr>
    ${m.cols.map(c=>`<th class="${NC.includes(c)?'num':''}">${COLMAP[c]||c}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.length?rows.map(r=>`<tr>
      ${m.cols.map(c=>`<td class="${NC.includes(c)?'num':''}${c==='scans'?' scans':''}">${cellHTML(r,c)}</td>`).join('')}
      <td style="white-space:nowrap"><button class="rowbtn" onclick="editRec('${r.id}')">修改</button>
      ${(typeof taskSendButton==='function')?taskSendButton(view,r):''}
      <button class="rowbtn del" onclick="delRec('${r.id}')">刪除</button></td></tr>`).join('')
      :`<tr><td colspan="${m.cols.length+1}" style="padding:30px;text-align:center;color:var(--muted)">這個條件沒有符合的紀錄</td></tr>`}
    </tbody></table></div>`}
function exportCSV(){
  const m=M[view],rows=filtered();
  if(!rows.length)return toast('目前沒有可以匯出的紀錄',1);
  const fs=m.fields.filter(f=>f.t!=='images');
  const q=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const csv=[fs.map(f=>q(f.l)).join(',')].concat(rows.map(r=>fs.map(f=>q(r[f.k])).join(','))).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`${m.name}_${today()}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast(`已匯出 ${rows.length} 筆`)}

/* ==================== 總覽 ==================== */
function dashHTML(){
  const ms=monthStart(),td=today(),inM=r=>r.date>=ms&&r.date<=td;
  const sum=(a,k)=>a.reduce((x,r)=>x+(Number(r[k])||0),0);
  const mF=sum(CACHE.trips.filter(inM),'freight'),mM=sum(CACHE.maint.filter(inM),'amount'),mP=sum(CACHE.petty.filter(inM),'amount');
  const uM=sum(CACHE.maint.filter(r=>r.paid==='未付'),'amount');
  const uR=sum(CACHE.billing.filter(r=>r.kind==='銷項'&&r.paid==='未收'),'amount');
  const due=CACHE.insurance.map(r=>({...r,d:daysTo(r.end)})).filter(r=>r.d!==null&&r.d<=45).sort((a,b)=>a.d-b.d);
  const empty=TABLES.every(t=>!CACHE[t].length);

  const prev=monthRange(-1);
  const inPrev=r=>r.date>=prev.start&&r.date<=prev.end;
  const pF=sum(CACHE.trips.filter(inPrev),'freight'),pM2=sum(CACHE.maint.filter(inPrev),'amount'),pP=sum(CACHE.petty.filter(inPrev),'amount');
  const cmp=(cur,prv)=>{const diff=cur-prv,pct=prv?Math.round(diff/prv*100):(cur?100:0);
    return `<span style="color:${diff>0?'var(--ok)':diff<0?'var(--danger)':'var(--muted)'}">${diff>0?'▲':diff<0?'▼':'—'} ${money(Math.abs(diff))}${prv?`（${diff>=0?'+':''}${pct}%）`:''}</span>`};

  return `<div class="head"><h1>總覽</h1><span class="sub">${td}</span><span class="spacer"></span>
    <button class="btn btn-ghost btn-sm" onclick="refresh()">重新整理</button></div>
  ${empty?`<div class="hint">目前沒有可看的資料。如果剛拿到帳號，建議先確認自己的權限，或到「基本資料 → 車輛」把車號建起來。</div>`:''}
  <div class="cards">
    <div class="card"><span>本月運費收入</span><strong>${money(mF)}</strong><em>${CACHE.trips.filter(inM).length} 趟</em></div>
    <div class="card"><span>本月維修支出</span><strong>${money(mM)}</strong><em>${CACHE.maint.filter(inM).length} 張</em></div>
    <div class="card"><span>本月零用金</span><strong>${money(mP)}</strong><em>${CACHE.petty.filter(inM).length} 筆</em></div>
    <div class="card ${uM?'alert':''}"><span>維修未付</span><strong>${money(uM)}</strong><em>${CACHE.maint.filter(r=>r.paid==='未付').length} 張</em></div>
    <div class="card ${uR?'alert':''}"><span>客戶未收帳款</span><strong>${money(uR)}</strong><em>${CACHE.billing.filter(r=>r.kind==='銷項'&&r.paid==='未收').length} 筆</em></div>
    ${typeof myTaskCard==='function'?myTaskCard():''}
  </div>
  <h2>本月 vs 上月</h2>
  <div class="tablewrap"><table><thead><tr><th></th><th class="num">本月</th><th class="num">上月</th><th>差異</th></tr></thead><tbody>
    <tr><td>運費收入</td><td class="num">${money(mF)}</td><td class="num">${money(pF)}</td><td>${cmp(mF,pF)}</td></tr>
    <tr><td>維修支出</td><td class="num">${money(mM)}</td><td class="num">${money(pM2)}</td><td>${cmp(mM,pM2)}</td></tr>
    <tr><td>零用金</td><td class="num">${money(mP)}</td><td class="num">${money(pP)}</td><td>${cmp(mP,pP)}</td></tr>
  </tbody></table></div>
  <h2>45 天內到期（保險／定檢／稅費）</h2>
  ${due.length?`<div class="tablewrap"><table><thead><tr><th>車號</th><th>類型</th><th>公司／機關</th><th>到期日</th><th>剩餘</th><th class="num">保費</th><th>繳費</th></tr></thead><tbody>
    ${due.map(r=>`<tr><td><span class="plate">${esc(r.plate)}</span></td><td><span class="tag">${esc(r.cat)}</span></td>
    <td>${esc(r.company||'—')}</td><td>${esc(r.end)}</td>
    <td><span class="tag ${r.d<0?'d':'w'}">${r.d<0?'已過期 '+(-r.d)+' 天':r.d+' 天'}</span></td>
    <td class="num">${money(r.premium)}</td><td><span class="tag ${r.paid==='未付'?'w':'g'}">${esc(r.paid||'—')}</span></td></tr>`).join('')}
    </tbody></table></div>`:`<div class="empty">45 天內沒有到期項目。<br><span style="font-size:13px">到「保險／到期」把強制險、第三人責任險、定檢、牌照稅建進去，這裡就會自動提醒。</span></div>`}
  ${typeof backupReminderHTML==='function'?backupReminderHTML():''}
  <footer>資料存在 Supabase 雲端資料庫，登入同一組帳號就能看到同一份資料（依權限顯示）。</footer>`}

/* ==================== 薪資 ==================== */
function payrollHTML(){
  const ds=CACHE.drivers.filter(d=>d.status!=='離職');
  const ts=CACHE.trips.filter(r=>(r.date||'').slice(0,7)===pMonth);
  const rows=ds.map(d=>{const t=ts.filter(r=>r.driver===d.name);
    const nT=t.reduce((a,r)=>a+(Number(r.trips)||0),0),fr=t.reduce((a,r)=>a+(Number(r.freight)||0),0);
    const bo=t.reduce((a,r)=>a+(Number(r.bonus)||0),0),de=t.reduce((a,r)=>a+(Number(r.deduct)||0),0);
    const bt=nT*(Number(d.rate)||0),bp=Math.round(fr*(Number(d.pct)||0)/100);
    return{d,n:t.length,nT,fr,bt,bp,bo,de,total:(Number(d.base)||0)+bt+bp+bo-de}});
  return `<div class="head"><h1>薪資計算</h1><span class="sub">依「出車報班」自動彙總</span><span class="spacer"></span>
    <input type="month" value="${pMonth}" onchange="pMonth=this.value;render()" style="width:160px">
    <button class="btn btn-ghost btn-sm" onclick="exportPayroll()">匯出 Excel</button></div>
  ${ds.length?'':`<div class="hint">還沒有駕駛資料。先到「基本資料 → 駕駛」建立駕駛，並填底薪、每趟抽成或運費抽成％，這裡就會自動算。</div>`}
  <div class="summary"><div><span>${pMonth} 應付薪資總額</span><strong>${money(rows.reduce((a,r)=>a+r.total,0))}</strong></div>
    <div><span>人數</span><strong>${rows.length}</strong></div>
    <div><span>總趟次</span><strong>${rows.reduce((a,r)=>a+r.nT,0)}</strong></div></div>
  <div class="tablewrap"><table><thead><tr><th>駕駛</th><th class="num">趟次</th><th class="num">運費</th>
    <th class="num">底薪</th><th class="num">趟次抽成</th><th class="num">運費抽成</th>
    <th class="num">加班獎金</th><th class="num">扣款</th><th class="num">應付</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td><strong>${esc(r.d.name)}</strong><div class="meta">${r.n} 筆報班</div></td>
      <td class="num">${r.nT}</td><td class="num">${money(r.fr)}</td><td class="num">${money(r.d.base)}</td>
      <td class="num">${money(r.bt)}</td><td class="num">${money(r.bp)}</td><td class="num">${money(r.bo)}</td>
      <td class="num">${r.de?'-'+money(r.de):'—'}</td><td class="num"><strong>${money(r.total)}</strong></td></tr>`).join('')
      ||`<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--muted)">這個月沒有資料</td></tr>`}
  </tbody></table></div>
  <footer>公式：底薪 ＋ 趟次 × 每趟抽成 ＋ 運費 × 抽成％ ＋ 加班獎金 － 扣款。要改公式跟我說。</footer>`}
function exportPayroll(){
  const ds=CACHE.drivers.filter(d=>d.status!=='離職');
  const ts=CACHE.trips.filter(r=>(r.date||'').slice(0,7)===pMonth);
  const q=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const L=[['月份','駕駛','趟次','運費','底薪','趟次抽成','運費抽成','加班獎金','扣款','應付'].map(q).join(',')];
  ds.forEach(d=>{const t=ts.filter(r=>r.driver===d.name);
    const nT=t.reduce((a,r)=>a+(Number(r.trips)||0),0),fr=t.reduce((a,r)=>a+(Number(r.freight)||0),0);
    const bo=t.reduce((a,r)=>a+(Number(r.bonus)||0),0),de=t.reduce((a,r)=>a+(Number(r.deduct)||0),0);
    const bt=nT*(Number(d.rate)||0),bp=Math.round(fr*(Number(d.pct)||0)/100);
    L.push([pMonth,d.name,nT,fr,d.base||0,bt,bp,bo,de,(Number(d.base)||0)+bt+bp+bo-de].map(q).join(','))});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+L.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  a.download=`薪資_${pMonth}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

/* ==================== 帳號管理（admin 專用） ==================== */
async function refreshProfiles(){await loadProfiles();render()}
function adminRowHTML(p){
  const isMe=p.id===ME.id;
  const statusTag=p.status==='pending'?'<span class="tag w">待審核</span>':p.status==='suspended'?'<span class="tag d">已停權</span>':'<span class="tag g">已啟用</span>';
  let rows=`<tr><td><strong>${esc(p.name||'—')}</strong>${isMe?'<div class="meta">（我）</div>':''}</td>
    <td>${esc(p.email||'—')}</td>
    <td><select onchange="setRole('${p.id}',this.value)"${isMe?' disabled':''}>
      <option value="user"${p.role==='user'?' selected':''}>user</option>
      <option value="admin"${p.role==='admin'?' selected':''}>admin</option></select></td>
    <td><select onchange="setStatus('${p.id}',this.value)"${isMe?' disabled':''}>
      <option value="pending"${p.status==='pending'?' selected':''}>待審核</option>
      <option value="active"${p.status==='active'?' selected':''}>啟用</option>
      <option value="suspended"${p.status==='suspended'?' selected':''}>停權</option></select> ${statusTag}</td>
    <td><select onchange="setDept('${p.id}',this.value)">
      <option value="">未指定</option>
      ${DEPTS.map(d=>`<option value="${d.id}"${p.dept_id===d.id?' selected':''}>${esc(d.name)}</option>`).join('')}</select></td>
    <td>${esc((p.created_at||'').slice(0,16).replace('T',' '))}</td>
    <td><button class="rowbtn" onclick="toggleExpand('${p.id}')">${expandedUser===p.id?'收合':'權限'}</button></td></tr>`;
  if(expandedUser===p.id){
    rows+=`<tr><td colspan="7"><div class="permgrid">${MODLIST.map(mk=>`
      <label><input type="checkbox" ${p.perms&&p.perms[mk.key]?'checked':''} onchange="setPerm('${p.id}','${mk.key}',this.checked)">${mk.label}</label>`).join('')}</div></td></tr>`;
  }
  return rows;
}
function adminHTML(){
  const rows=PROFILES.slice().sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
  const pendN=rows.filter(p=>p.status==='pending').length;
  return `<div class="head"><h1>👤 帳號管理</h1><span class="sub">${rows.length} 個帳號${pendN?`，${pendN} 個待審核`:''}</span>
    <span class="spacer"></span><button class="btn btn-ghost btn-sm" onclick="refreshProfiles()">重新整理</button></div>
    ${pendN?`<div class="hint">有 ${pendN} 個帳號正在等待審核，請將狀態切換為「啟用」並勾選需要的權限。</div>`:''}
    <div class="tablewrap"><table><thead><tr><th>姓名</th><th>Email</th><th>角色</th><th>狀態</th><th>部門</th><th>註冊時間</th><th></th></tr></thead>
    <tbody>${rows.length?rows.map(adminRowHTML).join(''):'<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--muted)">還沒有任何帳號</td></tr>'}</tbody></table></div>
    <div class="toast" id="toast"></div>`;
}
function toggleExpand(id){expandedUser=expandedUser===id?'':id;render()}
async function setRole(id,role){
  try{await api('profiles','PATCH',{body:{role},query:`?id=eq.${id}`});await refreshProfiles();toast('已更新')}
  catch(e){toast('更新失敗：'+e.message,1)}
}
async function setStatus(id,status){
  try{await api('profiles','PATCH',{body:{status},query:`?id=eq.${id}`});await refreshProfiles();toast('已更新')}
  catch(e){toast('更新失敗：'+e.message,1)}
}
async function setDept(id,deptId){
  try{await api('profiles','PATCH',{body:{dept_id:deptId||null},query:`?id=eq.${id}`});await refreshProfiles();toast('已更新')}
  catch(e){toast('更新失敗：'+e.message,1)}
}
async function setPerm(id,key,val){
  const p=PROFILES.find(x=>x.id===id);if(!p)return;
  const perms={...(p.perms||{}),[key]:val};
  try{await api('profiles','PATCH',{body:{perms},query:`?id=eq.${id}`});await refreshProfiles();toast('已更新')}
  catch(e){toast('更新失敗：'+e.message,1)}
}

async function refresh(){toast('載入中…');await loadAll();render()}

/* ==================== 繪製 ==================== */
function authFormHTML(){
  if(authTab==='signup'){
    return `<form onsubmit="onSignup(event)">
      <div class="field"><label>姓名 <span class="req">*</span></label><input type="text" id="su_name" required></div>
      <div class="field"><label>Email <span class="req">*</span></label><input type="email" id="su_email" required></div>
      <div class="field"><label>密碼 <span class="req">*</span></label><input type="password" id="su_pw" required minlength="6"></div>
      <div class="actions"><button type="submit" class="btn btn-primary" id="authBtn" style="width:100%">註冊</button></div>
    </form>`;
  }
  return `<form onsubmit="onLogin(event)">
    <div class="field"><label>Email <span class="req">*</span></label><input type="email" id="li_email" required></div>
    <div class="field"><label>密碼 <span class="req">*</span></label><input type="password" id="li_pw" required></div>
    <div class="actions"><button type="submit" class="btn btn-primary" id="authBtn" style="width:100%">登入</button></div>
  </form>`;
}
function shellWithTopbar(inner){
  const bell=(ME&&typeof bellHTML==='function')?bellHTML():'';
  return `<div class="topbar">${bell}<span class="who">${ME?esc(ME.name):''}${ME&&ME.role==='admin'?' <span class="tag">管理員</span>':''}</span>
    <button class="btn btn-ghost btn-sm" onclick="doLogout()">登出</button></div>${inner}`;
}
function gateShellHTML(title,msg){
  return shellWithTopbar(`<div class="gatepage"><div class="icon">${title==='帳號已停權'?'⛔':'⏳'}</div><h1>${esc(title)}</h1><p style="color:var(--muted)">${esc(msg)}</p></div>`);
}
function render(){
  if(!AUTH.access){
    $('#app').innerHTML=`<div class="authwrap"><div class="authcard">
      <h1>貨運行營運系統</h1><div class="sub">登入後依帳號權限使用系統</div>
      <div class="authtabs">
        <button class="${authTab==='login'?'on':''}" onclick="authTab='login';render()">登入</button>
        <button class="${authTab==='signup'?'on':''}" onclick="authTab='signup';render()">註冊</button>
      </div>
      ${authFormHTML()}
      <div class="toast" id="toast"></div>
    </div></div>`;
    return;
  }
  if(!ME){$('#app').innerHTML='<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';return}
  if(ME.status==='pending'){$('#app').innerHTML=gateShellHTML('帳號等待管理員核准','您的註冊已送出，請等待管理員啟用帳號並設定權限後即可使用系統。');return}
  if(ME.status==='suspended'){$('#app').innerHTML=gateShellHTML('帳號已停權','此帳號已被管理員停權，如有疑問請聯繫系統管理員。');return}

  $('#app').innerHTML=shellWithTopbar('<div class="app"><nav id="nav"></nav><main id="main"></main></div>');
  if(typeof renderAlertBanner==='function')renderAlertBanner();
  renderNav();
  const m=M[view];
  if(m&&typeof m.render==='function'){$('#main').innerHTML=m.render();drawThumbs();return}
  if(!m){view='dash';$('#main').innerHTML=dashHTML();drawThumbs();return}
  const rec=editId?CACHE[view].find(r=>r.id===editId):null;
  if(!editId)pending=[];
  $('#main').innerHTML=`<div class="head"><h1>${m.icon} ${m.name}</h1>
    <span class="sub">${CACHE[view].length} 筆</span><span class="spacer"></span>
    <button class="btn btn-ghost btn-sm" onclick="refresh()">重新整理</button></div>
    <div class="split"><section>${formHTML(rec)}</section>
    <section><h2>紀錄</h2><div id="listArea">${listHTML()}</div></section></div>`;
  drawThumbs()
}
/* boot() 是在所有功能模組 js 檔都載入完成後，由 index.html 最後一個 <script> 呼叫，
   避免 onBootActive／navBadge／myTaskCard 等擴充點在還沒定義時就被呼叫到。 */
