/* ==================== 階段八：Claude Code 主動回報（Web 端） ====================
   agent_alerts 只有 admin 能讀（RLS），所以橫幅／音效／title 閃爍只會對 admin 生效。 */
ADMIN_ONLY_KEYS.push('alerts');
SYSTEM_GROUP.keys.push('alerts');
M.alerts = {name:'執行紀錄', icon:'🤖', render:()=>alertsHTML()};

let AGENT_ALERTS = [], ALERTS_LOADED = false;
let _notifiedActionIds = new Set();
let _titleFlashTimer = null, _origTitle = document.title;

BOOT_HOOKS.push(async()=>{ if(ME && ME.role==='admin') await loadAlerts() });

async function loadAlerts(){
  try{ AGENT_ALERTS = await api('agent_alerts','GET',{query:'?select=*&order=created_at.desc&limit=200'}) }
  catch(e){ AGENT_ALERTS=[] }
  ALERTS_LOADED = true;
}
async function pollAlerts(){ if(ME && ME.role==='admin') await loadAlerts() }
function unresolvedAlertCount(){ return AGENT_ALERTS.filter(a=>a.level==='action' && !a.resolved_at).length }
function hasUnresolvedActionAlert(){ return unresolvedAlertCount()>0 }

function renderAlertBanner(){
  const existing = document.getElementById('actionBanner');
  if(existing) existing.remove();
  if(!(ME && ME.role==='admin')) return;
  const unresolved = AGENT_ALERTS.filter(a=>a.level==='action' && !a.resolved_at);
  if(!unresolved.length){ stopTitleFlash(); return }
  const a = unresolved[0];
  const el = document.getElementById('app');
  if(!el) return;
  const banner = document.createElement('div');
  banner.id = 'actionBanner';
  banner.className = 'actionbanner';
  banner.innerHTML = `<strong>${esc(a.title)}</strong><span>${esc(a.body||'')}</span>
    <button type="button" onclick="resolveAlert('${a.id}')">我知道了</button>`;
  el.insertAdjacentElement('afterbegin', banner);
  startTitleFlash();
  if(!_notifiedActionIds.has(a.id)){
    _notifiedActionIds.add(a.id);
    beep();
    forceBrowserNotify(a.title, a.body||'');
  }
}
function beep(){
  try{
    const Ctx = window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime+0.28);
    osc.onended = ()=>{ try{ctx.close()}catch(_){} };
  }catch(_){}
}
function forceBrowserNotify(title, body){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  try{ new Notification('⚠ '+title, {body}) }catch(_){}
}
function startTitleFlash(){
  if(_titleFlashTimer) return;
  _origTitle = document.title;
  let on = false;
  _titleFlashTimer = setInterval(()=>{ document.title = on ? _origTitle : '⚠ 需要處理'; on = !on }, 1000);
}
function stopTitleFlash(){
  if(_titleFlashTimer){ clearInterval(_titleFlashTimer); _titleFlashTimer=null; document.title=_origTitle }
}
async function resolveAlert(id){
  try{ await api('agent_alerts','PATCH',{body:{resolved_at:new Date().toISOString()},query:`?id=eq.${id}`}) }
  catch(e){ toast('操作失敗：'+e.message,1); return }
  await loadAlerts();
  render();
}

const ALERT_LEVEL_LABEL = {action:'需要處理', info:'進度', done:'完成'};
function alertsHTML(){
  if(!ALERTS_LOADED){
    loadAlerts().then(()=>{ if(view==='alerts') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  const groups = {};
  AGENT_ALERTS.forEach(a=>{ const s=a.session||'（未分類）'; (groups[s]=groups[s]||[]).push(a) });
  const sessions = Object.keys(groups);
  return `<div class="head"><h1>🤖 執行紀錄</h1><span class="sub">Claude Code 回報的通知，依 session 分組</span><span class="spacer"></span>
    <button class="btn btn-ghost btn-sm" onclick="alertsRefresh()">重新整理</button></div>
  ${sessions.length?sessions.map(s=>`<h2>${esc(s)}</h2>
    <div class="tablewrap" style="margin-bottom:20px"><table><thead><tr><th>等級</th><th>標題</th><th>內容</th><th>時間</th><th>狀態</th><th></th></tr></thead><tbody>
      ${groups[s].map(a=>`<tr>
        <td><span class="tag ${a.level==='action'?(a.resolved_at?'':'d'):a.level==='done'?'g':''}">${ALERT_LEVEL_LABEL[a.level]||a.level}</span></td>
        <td>${esc(a.title)}</td>
        <td><div class="wrap2">${esc(a.body||'')}</div></td>
        <td>${esc((a.created_at||'').replace('T',' ').slice(0,16))}</td>
        <td>${a.resolved_at?`<span class="tag g">已處理</span>`:(a.level==='action'?`<span class="tag d">未處理</span>`:'—')}</td>
        <td>${(a.level==='action'&&!a.resolved_at)?`<button class="rowbtn" onclick="resolveAlert('${a.id}')">標記已處理</button>`:''}</td>
      </tr>`).join('')}
    </tbody></table></div>`).join('') : '<div class="empty">還沒有任何回報紀錄</div>'}
  <div class="toast" id="toast"></div>`;
}
async function alertsRefresh(){ await loadAlerts(); render() }
