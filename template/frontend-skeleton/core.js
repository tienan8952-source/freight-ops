/* ==================== 範本：前端骨架 ====================
   抽自 freight-ops 的 js/core.js，拿掉所有業務邏輯（M 物件裡的模組、
   總覽頁的圖表/KPI 計算），保留可重複使用的引擎：登入狀態、api()、
   表單/清單產生、side nav／topbar／手機底部導覽、鍵盤快捷鍵。
   新專案要做的事：填 SUPABASE_URL/ANON_KEY、在 M 物件加自己的模組、
   在 TABLES 陣列加自己的表名、把 dashHTML() 換成自己的總覽頁內容。 */

/* ==================== 連線設定（換成你自己的專案） ==================== */
const SUPABASE_URL='<https://xxxxx.supabase.co>';
const ANON_KEY='<你的 anon / publishable key>';

/* ==================== 登入狀態 ==================== */
const AUTH={
  get access(){return localStorage.getItem('app.at')||''},
  get refresh(){return localStorage.getItem('app.rt')||''},
  get expAt(){return Number(localStorage.getItem('app.exp')||0)},
  set(a,r,expSec){localStorage.setItem('app.at',a);localStorage.setItem('app.rt',r);
    localStorage.setItem('app.exp',String(Date.now()+(Number(expSec)||3600)*1000))},
  clear(){['app.at','app.rt','app.exp'].forEach(k=>localStorage.removeItem(k))}
};
let ME=null,PROFILES=[],DEPTS=[];
const BOOT_HOOKS=[]; // 其他 js 檔用 BOOT_HOOKS.push(async()=>{...}) 掛入登入後才需要做的初始化

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
  $('#app').innerHTML='<div style="padding:60px;text-align:center;color:var(--mut)"><span class="spin"></span>載入中…</div>';
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
      for(const hook of BOOT_HOOKS){try{await hook()}catch(_){}}
    }
  }catch(e){AUTH.clear();ME=null}
  render();
}

/* ==================== 資料表存取（帶使用者 access token，讓 RLS 生效） ==================== */
const TABLES=[/* 換成你自己的業務表名，例如 'orders','items' */];
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
function toast(t,e){const el=$('#toast');if(!el)return;el.textContent=t;el.className='toast'+(e?' err':'');
  if(t&&!e)setTimeout(()=>{if(el.textContent===t)el.textContent=''},4000)}

/* ==================== 模組定義（換成你自己的） ====================
   範例：
   const M={
     dash:{name:'總覽',icon:'📊',render:()=>dashHTML()},
     orders:{name:'訂單',icon:'📦',sum:['amount'],
       fields:[{k:'date',t:'date',l:'日期',req:1,def:'today',c:6},
         {k:'customer',t:'text',l:'客戶',req:1,c:6},
         {k:'amount',t:'number',l:'金額',money:1,c:6}],
       cols:['date','customer','amount']}
   };
*/
const M={dash:{name:'總覽',icon:'📊',render:()=>dashHTML()}};
const ICON_COLOR={}; // 模組 key -> 'pri'/'amb'/'grn'/'red'/'pur'/'cy'，換清單列圖示顏色用
const COLMAP={date:'日期',amount:'金額',note:'備註',name:'姓名',status:'狀態'};
const NAV_GROUPS=[/* {label:'分組名',keys:['orders', ...]} */];
const SYSTEM_GROUP={label:'系統',keys:['admin']};
const PERM_OF={};
const ADMIN_ONLY_KEYS=['admin'];
const MODLIST=[/* {key:'orders',label:'訂單'} */];
function canSee(key){
  if(key==='help')return !!ME;
  if(ADMIN_ONLY_KEYS.includes(key))return !!(ME&&ME.role==='admin');
  if(!ME)return false;
  if(ME.role==='admin')return true;
  const perm=PERM_OF[key]||key;
  return !!(ME.perms&&ME.perms[perm]===true);
}

let view='dash',pending=[],editId='',autoTouched={},busy=false,F={},authTab='login',expandedUser='';

/* ==================== 導覽 ==================== */
function renderNav(){
  const badgeFor=k=>{
    if(typeof navBadge==='function'){const b=navBadge(k);if(b)return `<span class="badge">${b}</span>`}
    return '';
  };
  const grp=(t,keys)=>{
    const vis=keys.filter(canSee);
    if(!vis.length)return '';
    return `<div class="grp">${t}</div>`+vis.map(k=>
      `<a class="${view===k?'on':''}" onclick="go('${k}')">${M[k].icon} ${M[k].name}${badgeFor(k)}</a>`).join('')};
  let html=`<div class="side-logo"><div class="box">🧩</div><div class="txt">
      <div class="name">你的專案名稱</div><div class="sub">Your App</div></div></div>`
    +(canSee('dash')?`<a class="${view==='dash'?'on':''}" onclick="go('dash')">📊 總覽</a>`:'');
  NAV_GROUPS.forEach(g=>{html+=grp(g.label,g.keys)});
  html+=grp(SYSTEM_GROUP.label,SYSTEM_GROUP.keys);
  $('#nav').innerHTML=html;
}
function initials(name){const s=(name||'').trim();return s?s.slice(0,1).toUpperCase():'?'}
function go(k){if(!canSee(k)&&k!=='dash')return;view=k;pending=[];editId='';autoTouched={};F={};expandedUser='';render();window.scrollTo(0,0)}
function mobileNavHTML(){
  const items=[{k:'dash',ic:'🏠',l:'首頁'},null,{k:'admin',ic:'⚙️',l:'設定'}]; // 依實際模組調整成 5 格
  return `<div class="mobnav">${items.map(it=>{
    if(!it)return `<div class="fab-slot"><div class="fab" onclick="go('dash')">＋</div></div>`;
    if(!canSee(it.k))return `<div></div>`;
    return `<a class="${view===it.k?'on':''}" onclick="go('${it.k}')"><span class="ic">${it.ic}</span>${it.l}</a>`;
  }).join('')}</div>`;
}

/* ==================== 表單（通用，跟 freight-ops 一致） ==================== */
function fieldHTML(f,v){
  const id='f_'+f.k,req=f.req?' <span class="req">*</span>':'';
  let inp='';
  if(f.t==='textarea')inp=`<textarea id="${id}">${esc(v)}</textarea>`;
  else if(f.t==='select')inp=`<select id="${id}">${f.opts.map(o=>`<option${o===v?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(f.t==='number'){
    if(f.money)inp=`<input type="text" inputmode="decimal" id="${id}" value="${v==null||v===''?'':money(v)}" class="moneyIn">`;
    else inp=`<input type="number" id="${id}" value="${v==null?'':v}">`;
  }
  else if(f.t==='date')inp=`<input type="date" id="${id}" value="${esc(v)}">`;
  else inp=`<input type="text" id="${id}" value="${esc(v)}">`;
  return `<div class="field c${f.c||12}"><label for="${id}">${f.l}${req}</label>${inp}</div>`}
function formHTML(rec){const m=M[view];
  return `<h2>${rec?'修改':'新增'}${m.name}</h2><form onsubmit="saveRec(event)"><div class="grid">
    ${m.fields.map(f=>{let v=rec?rec[f.k]:'';
      if(!rec&&f.def==='today')v=today();
      if(!rec&&f.t==='select'&&!v)v=f.opts[0];
      return fieldHTML(f,v==null?'':v)}).join('')}
    </div><div class="actions"><button type="submit" class="btn btn-primary" id="saveBtn">${rec?'更新':'存檔'}</button>
    ${rec?`<button type="button" class="btn btn-ghost" onclick="go('${view}')">取消</button>`:''}</div>
    <div class="toast" id="toast"></div></form>`}
function focusFirstField(){
  const el=$('#main .grid .field:first-child input,#main .grid .field:first-child textarea,#main .grid .field:first-child select');
  if(el)try{el.focus()}catch(_){}
}
async function saveRec(e){
  e.preventDefault();if(busy)return;
  const m=M[view],rec={};
  for(const f of m.fields){
    let v=$('#f_'+f.k).value;
    if(typeof v==='string')v=v.trim();
    if(f.t==='number')v=v===''?null:Number(String(v).replace(/,/g,''));
    if(f.t==='date'&&v==='')v=null;
    if(f.req&&(v===''||v===null)){toast('請填「'+f.l+'」',1);$('#f_'+f.k).focus();return}
    rec[f.k]=v===''?null:v}
  busy=true;$('#saveBtn').disabled=true;toast('儲存中…');
  try{
    if(editId){const out=await api(view,'PATCH',{body:rec,query:`?id=eq.${editId}`});
      const i=CACHE[view].findIndex(r=>r.id===editId);if(i>=0)CACHE[view][i]=out[0]}
    else{const out=await api(view,'POST',{body:rec});CACHE[view].unshift(out[0])}
    editId='';render();toast('已存檔');focusFirstField();
  }catch(err){toast('存檔失敗：'+err.message,1)}
  finally{busy=false;const b=$('#saveBtn');if(b)b.disabled=false}
}
function editRec(id){editId=id;render();window.scrollTo({top:0,behavior:'smooth'})}
async function delRec(id){
  if(!confirm('確定刪除這筆紀錄？'))return;
  try{await api(view,'DELETE',{query:`?id=eq.${id}`});
    CACHE[view]=CACHE[view].filter(r=>r.id!==id);render();toast('已刪除')}
  catch(e){toast('刪除失敗：'+e.message,1)}}

/* ==================== 清單（卡片式，通用） ==================== */
function cellHTML(r,k){return esc(r[k]==null?'—':(typeof r[k]==='number'?money(r[k]):r[k]))}
function filtered(){return CACHE[view]||[]}
function rowCardHTML(r){
  const m=M[view];
  const titleCol=m.cols[0];
  return `<div class="listrow">
    <div class="lr-icon ${ICON_COLOR[view]||'pri'}">${m.icon||'📄'}</div>
    <div class="lr-main"><div class="lr-title">${cellHTML(r,titleCol)}</div></div>
    <div class="lr-value">${m.sum?cellHTML(r,m.sum[0]):''}</div>
    <div class="lr-actions"><button class="rowbtn" onclick="editRec('${r.id}')">修改</button>
      <button class="rowbtn del" onclick="delRec('${r.id}')">刪除</button></div>
  </div>`}
function listHTML(){
  const m=M[view],rows=filtered();
  if(!rows.length)return '<div class="panel"><div class="empty">還沒有紀錄</div></div>';
  return `<div class="panel"><div class="listwrap">${rows.map(rowCardHTML).join('')}</div></div>`;
}

/* ==================== 總覽（換成你自己的內容） ==================== */
function dashHTML(){
  return `<div class="head"><h1>總覽</h1></div>
    <div class="empty">這是範本，換上你自己的 KPI／面板／圖表內容（參考 freight-ops 的
    js/core.js 裡的 dashHTML() 寫法）。</div>`;
}

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
  return `<div class="topbar">
    <div class="tb-search"><input type="text" id="tbSearch" placeholder="搜尋…"><span class="kbd">Ctrl K</span></div>
    <span class="tb-spacer"></span>
    <span class="tb-status"><span class="dot"></span>系統運作中</span>
    <span class="who">${ME?esc(ME.name):''}${ME&&ME.role==='admin'?' <span class="tag">管理員</span>':''}</span>
    <div class="tb-avatar">${esc(initials(ME&&ME.name))}</div>
    <button class="btn btn-ghost btn-sm" onclick="doLogout()">登出</button></div>${inner}`;
}
function gateShellHTML(title,msg){
  return shellWithTopbar(`<div class="gatepage"><div class="icon">${title==='帳號已停權'?'⛔':'⏳'}</div><h1>${esc(title)}</h1><p style="color:var(--mut)">${esc(msg)}</p></div>`);
}
function render(){
  if(!AUTH.access){
    $('#app').innerHTML=`<div class="authwrap"><div class="authcard">
      <h1>你的專案名稱</h1><div class="sub">登入後依帳號權限使用系統</div>
      <div class="authtabs">
        <button class="${authTab==='login'?'on':''}" onclick="authTab='login';render()">登入</button>
        <button class="${authTab==='signup'?'on':''}" onclick="authTab='signup';render()">註冊</button>
      </div>
      ${authFormHTML()}
      <div class="toast" id="toast"></div>
    </div></div>`;
    return;
  }
  if(!ME){$('#app').innerHTML='<div style="padding:60px;text-align:center;color:var(--mut)"><span class="spin"></span>載入中…</div>';return}
  if(ME.status==='pending'){$('#app').innerHTML=gateShellHTML('帳號等待管理員核准','您的註冊已送出，請等待管理員啟用帳號並設定權限後即可使用系統。');return}
  if(ME.status==='suspended'){$('#app').innerHTML=gateShellHTML('帳號已停權','此帳號已被管理員停權，如有疑問請聯繫系統管理員。');return}

  $('#app').innerHTML=shellWithTopbar('<div class="app"><nav id="nav"></nav><main id="main"></main></div>')+mobileNavHTML();
  renderNav();
  const m=M[view];
  if(m&&typeof m.render==='function'){$('#main').innerHTML=m.render();return}
  if(!m){view='dash';$('#main').innerHTML=dashHTML();return}
  const rec=editId?CACHE[view].find(r=>r.id===editId):null;
  $('#main').innerHTML=`<div class="head"><h1>${m.icon} ${m.name}</h1>
    <span class="sub">${(CACHE[view]||[]).length} 筆</span><span class="spacer"></span>
    <button class="btn btn-ghost btn-sm" onclick="printPage()">列印</button></div>
    <div class="split"><section>${formHTML(rec)}</section>
    <section><h2>紀錄</h2><div id="listArea">${listHTML()}</div></section></div>`;
}
function printPage(){window.print()}

/* ==================== 鍵盤快捷鍵 ==================== */
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape'){
    if(document.querySelector('dialog[open]'))return;
    if(editId){go(view)}
    return;
  }
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='k'||e.key==='K')){
    e.preventDefault();const s=$('#tbSearch');if(s)s.focus();return;
  }
  if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S'||e.key==='Enter')){
    const form=document.querySelector('#main form');
    if(form){e.preventDefault();form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event('submit',{cancelable:true}))}
    return;
  }
  if(e.altKey&&(e.key==='n'||e.key==='N')){
    const m=M[view];
    if(m&&m.fields){e.preventDefault();editId='';render();focusFirstField()}
  }
});

/* 這支檔案最後要由 index.html 的最後一個 <script> 呼叫 boot()，
   等所有擴充模組 js 都載入完成後才啟動（參考 freight-ops 的
   js/app-init.js）。 */
