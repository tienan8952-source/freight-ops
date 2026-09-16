/* ==================== 階段七：站內通知 ==================== */
let NOTIFICATIONS = [], NOTIF_OPEN = false, POLL_TIMER = null;

BOOT_HOOKS.push(async()=>{
  await loadNotifications();
  requestBrowserNotifPermissionOnce();
  startPolling();
});

async function loadNotifications(){
  if(!ME) return;
  try{ NOTIFICATIONS = await api('notifications','GET',{query:`?user_id=eq.${ME.id}&select=*&order=created_at.desc&limit=50`}) }
  catch(e){ /* 靜默失敗，不要因為通知打不開影響其他功能 */ }
}
function unreadNotifCount(){ return NOTIFICATIONS.filter(n=>!n.read_at).length }
function navBadge(k){
  if(k==='tasks') return unreadNotifCount() || '';
  if(k==='alerts' && typeof unresolvedAlertCount==='function') return unresolvedAlertCount() || '';
  return '';
}

function bellHTML(){
  const n = unreadNotifCount();
  return `<div style="position:relative">
    <button type="button" class="bell" onclick="toggleBell(event)">🔔${n?`<span class="dot">${n}</span>`:''}</button>
    ${NOTIF_OPEN?bellDropHTML():''}
  </div>`;
}
function toggleBell(e){
  e.stopPropagation();
  NOTIF_OPEN = !NOTIF_OPEN;
  render();
  if(NOTIF_OPEN) setTimeout(()=>document.addEventListener('click', closeBellOnce, {once:true}), 0);
}
function closeBellOnce(){ NOTIF_OPEN=false; render() }
function bellDropHTML(){
  return `<div class="belldrop" onclick="event.stopPropagation()">
    ${NOTIFICATIONS.length?NOTIFICATIONS.map(n=>`<div class="n ${n.read_at?'':'unread'}" onclick="notifClick('${n.id}','${n.task_id||''}')">
      <strong>${esc(n.title||'通知')}</strong>${esc(n.body||'')}<div class="meta">${esc((n.created_at||'').replace('T',' ').slice(0,16))}</div>
    </div>`).join(''):'<div class="empty">目前沒有通知</div>'}
    <div style="padding:8px 14px;border-top:1px solid var(--rule)"><label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
      <input type="checkbox" ${localStorage.getItem('fops.browserNotif')==='1'?'checked':''} onchange="toggleBrowserNotif(this.checked)">開啟瀏覽器通知</label></div>
  </div>`;
}
async function notifClick(id, taskId){
  try{ await api('notifications','PATCH',{body:{read_at:new Date().toISOString()},query:`?id=eq.${id}`}) }catch(_){}
  await loadNotifications();
  NOTIF_OPEN = false;
  render();
  if(taskId && canSee('tasks')) taskOpenDetail(taskId);
}

/* ---------- 輪詢：一般 60 秒，有未處理 action alert 時 15 秒（見 alerts.js） ---------- */
function startPolling(){
  if(POLL_TIMER) clearTimeout(POLL_TIMER);
  const tick = async ()=>{
    const before = unreadNotifCount();
    await loadNotifications();
    if(typeof pollAlerts==='function'){ try{ await pollAlerts() }catch(_){} }
    if(unreadNotifCount() > before) maybeBrowserNotify('有新的待處理工作');
    if(ME && ME.status==='active') render();
    const interval = (typeof hasUnresolvedActionAlert==='function' && hasUnresolvedActionAlert()) ? 15000 : 60000;
    POLL_TIMER = setTimeout(tick, interval);
  };
  POLL_TIMER = setTimeout(tick, 60000);
}

/* ---------- 瀏覽器通知 ---------- */
function requestBrowserNotifPermissionOnce(){
  if(!('Notification' in window)) return;
  if(localStorage.getItem('fops.browserNotif')===null){
    if(Notification.permission==='default'){
      Notification.requestPermission().then(p=>{
        localStorage.setItem('fops.browserNotif', p==='granted' ? '1':'0');
      });
    }else{
      localStorage.setItem('fops.browserNotif', Notification.permission==='granted' ? '1':'0');
    }
  }
}
function toggleBrowserNotif(on){
  if(on && 'Notification' in window && Notification.permission!=='granted'){
    Notification.requestPermission().then(p=>{
      localStorage.setItem('fops.browserNotif', p==='granted'?'1':'0');
      render();
    });
    return;
  }
  localStorage.setItem('fops.browserNotif', on?'1':'0');
}
function maybeBrowserNotify(body){
  if(localStorage.getItem('fops.browserNotif')!=='1') return;
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  try{ new Notification('貨運行營運系統', {body}) }catch(_){}
}
