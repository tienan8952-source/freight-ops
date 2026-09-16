/* ==================== 階段六：工作單與轉交 ==================== */
NAV_GROUPS.push({label:'流程管理', keys:['tasks']});
M.tasks = {name:'我的工作', icon:'📋', render:()=>tasksHTML()};

let TASKS = [], TASKS_LOADED = false, TASK_TAB = 'todo';
let TASK_CREATE = null, TASK_DETAIL_ID = null, TASK_EVENTS = [];
const TASK_PRIORITY_LABEL = {low:'低',normal:'一般',high:'高'};

BOOT_HOOKS.push(async()=>{
  try{ await loadWorkflows() }catch(_){}
  if(canSee('tasks')){ try{ await loadTasks() }catch(_){} }
});
async function loadTasks(){
  try{ TASKS = await api('tasks','GET',{query:'?select=*&order=updated_at.desc'}) }catch(e){ TASKS=[] }
  TASKS_LOADED = true;
}
function isTodoForMe(t){
  if(t.status!=='open') return false;
  if(t.to_user) return t.to_user===ME.id;
  if(t.to_dept) return ME.dept_id && t.to_dept===ME.dept_id;
  return false;
}
function isOverdue(t){ return t.status==='open' && t.due && t.due < today() }
function myTaskCard(){
  if(!canSee('tasks')) return '';
  const todo = TASKS.filter(isTodoForMe);
  const overdue = todo.filter(isOverdue);
  return `<div class="card ${overdue.length?'alert':''}" onclick="go('tasks')" style="cursor:pointer">
    <span>待我處理</span><strong>${todo.length}</strong><em>${overdue.length?`其中逾期 ${overdue.length} 件`:'目前沒有逾期'}</em></div>`;
}
/* 總覽頁「待我處理的工作」面板；由 core.js dashHTML() 用 typeof 檢查後呼叫 */
function taskDashPanelHTML(){
  if(!TASKS_LOADED) return '<div style="padding:20px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  const todo = TASKS.filter(isTodoForMe).slice(0,5);
  if(!todo.length) return '<div class="empty">目前沒有待處理的工作</div>';
  return `<div class="listwrap">${todo.map(t=>`<div class="listrow" style="grid-template-columns:29px 1fr auto" onclick="taskOpenDetail('${t.id}')" role="button">
    <div class="lr-icon ${isOverdue(t)?'red':'pri'}">📋</div>
    <div class="lr-main"><div class="lr-title">${esc(t.title)}</div>
      <div class="lr-meta"><span>${t.module?esc((M[t.module]&&M[t.module].name)||t.module):'一般'}</span>${t.due?`<span>期限 ${esc(t.due)}</span>`:''}</div></div>
    <div class="lr-value"><span class="tag ${isOverdue(t)?'d':''}">${TASK_PRIORITY_LABEL[t.priority]||t.priority}</span></div>
  </div>`).join('')}</div>`;
}
function taskSendButton(moduleKey, rec){
  if(!canSee('tasks')) return '';
  return `<button class="rowbtn" onclick="openTaskCreate('${moduleKey}','${rec.id}')">送簽</button>`;
}

/* ---------- 建立工作單 ---------- */
function openTaskCreate(moduleKey, refId){
  const rec = (moduleKey && refId) ? CACHE[moduleKey].find(r=>r.id===refId) : null;
  const label = rec ? (rec.plate || rec.title || rec.name || rec.item || '') : '';
  TASK_CREATE = {module:moduleKey||null, ref_id:refId||null,
    title: moduleKey ? `${M[moduleKey].name}${label?'｜'+label:''}` : '', files:[]};
  let dlg = document.getElementById('taskCreateDlg');
  if(!dlg){ dlg=document.createElement('dialog'); dlg.id='taskCreateDlg'; dlg.style.maxWidth='560px'; dlg.style.width='92vw'; document.body.appendChild(dlg) }
  dlg.innerHTML = taskCreateFormHTML();
  dlg.showModal();
}
function taskCreateFormHTML(){
  const t = TASK_CREATE;
  return `<div class="dlgbar"><strong style="margin-right:auto">建立工作單</strong>
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('taskCreateDlg').close()">關閉</button></div>
  <div style="padding:0 16px 16px" class="grid">
    <div class="field c12"><label>標題 <span class="req">*</span></label><input type="text" id="tc_title" value="${esc(t.title)}"></div>
    <div class="field c12"><label>說明</label><textarea id="tc_note"></textarea></div>
    <div class="field c6"><label>優先順序</label><select id="tc_priority">
      <option value="low">低</option><option value="normal" selected>一般</option><option value="high">高</option></select></div>
    <div class="field c6"><label>期限</label><input type="date" id="tc_due"></div>
    <div class="field c6"><label>指派部門</label><select id="tc_dept" onchange="$('#tc_user').value=''">
      <option value="">未指定</option>${DEPTS.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
    <div class="field c6"><label>指派給（可留空＝整部門）</label><select id="tc_user" onchange="if(this.value)$('#tc_dept').value=''">
      <option value="">（不指定人）</option>${PROFILES.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field c12"><label>附件</label>
      <button type="button" class="btn btn-ghost btn-sm" onclick="openFilePicker(p=>{TASK_CREATE.files.push(p);toast('已附加 1 個檔案')})">從檔案庫選擇附件</button>
    </div>
  </div>
  <div class="actions" style="padding:0 16px 16px">
    <button class="btn btn-primary" onclick="taskCreateSubmit()">送出</button>
    <button class="btn btn-ghost" onclick="document.getElementById('taskCreateDlg').close()">取消</button>
  </div>
  <div class="toast" id="toast" style="padding:0 16px"></div>`;
}
async function taskCreateSubmit(){
  const title = $('#tc_title').value.trim();
  if(!title){ toast('請填標題',1); return }
  const to_dept = $('#tc_dept').value || null;
  const to_user = $('#tc_user').value || null;
  if(!to_dept && !to_user){ toast('請選部門或指派對象',1); return }
  const note = $('#tc_note').value.trim() || null;
  const body = {
    title, module:TASK_CREATE.module, ref_id:TASK_CREATE.ref_id,
    note, priority:$('#tc_priority').value, due:$('#tc_due').value||null,
    from_user:ME.id, to_user, to_dept: to_user?null:to_dept, files:TASK_CREATE.files
  };
  try{
    const rows = await api('tasks','POST',{body});
    const t = rows[0];
    await api('task_events','POST',{body:{task_id:t.id, actor:ME.id, action:'create', from_user:ME.id, to_user:body.to_user, to_dept:body.to_dept, comment:note}});
    const dlg = document.getElementById('taskCreateDlg'); if(dlg) dlg.close();
    TASK_CREATE = null;
    await loadTasks();
    if(view==='tasks') render(); else if(typeof renderNav==='function') renderNav();
    toast('已送出工作單');
  }catch(e){ toast('建立失敗：'+e.message,1) }
}

/* ---------- 列表 ---------- */
function tasksHTML(){
  if(!TASKS_LOADED){
    loadTasks().then(()=>{ if(view==='tasks') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  const todo = TASKS.filter(isTodoForMe);
  const sent = TASKS.filter(t=>t.from_user===ME.id);
  const done = TASKS.filter(t=>t.status==='done');
  const list = TASK_TAB==='todo'?todo:TASK_TAB==='sent'?sent:done;
  const tab=(k,l,n)=>`<button class="btn ${TASK_TAB===k?'btn-primary':'btn-ghost'} btn-sm" onclick="taskSetTab('${k}')">${l}（${n}）</button>`;
  return `<div class="head"><h1>📋 我的工作</h1><span class="spacer"></span>
    <button class="btn btn-primary btn-sm" onclick="openTaskCreate()">＋ 新增工作單</button></div>
  <div class="actions" style="margin-bottom:14px">${tab('todo','待我處理',todo.length)}${tab('sent','我送出的',sent.length)}${tab('done','已完成',done.length)}</div>
  <div class="panel">${list.length?`<div class="listwrap">${list.map(t=>`<div class="listrow" onclick="taskOpenDetail('${t.id}')" role="button">
    <div class="lr-icon ${isOverdue(t)?'red':'pri'}">📋</div>
    <div class="lr-main"><div class="lr-title">${esc(t.title)}</div>
      <div class="lr-meta"><span>${t.module?esc((M[t.module]&&M[t.module].name)||t.module):'一般'}</span>
        <span>對象：${t.to_user?esc(uploaderLabel(t.to_user)):(t.to_dept?esc(deptName(t.to_dept)):'—')}</span>
        ${t.note?`<span>${esc(t.note)}</span>`:''}</div>
      <div class="lr-tags"><span class="tag">${TASK_PRIORITY_LABEL[t.priority]||t.priority}</span>
        ${t.due?`<span class="tag ${isOverdue(t)?'d':''}">${esc(t.due)}${isOverdue(t)?'（逾期）':''}</span>`:''}
        <span class="tag ${t.status==='done'?'g':t.status==='cancelled'?'d':''}">${t.status==='open'?'處理中':t.status==='done'?'已完成':'已取消'}</span></div>
    </div>
    <div class="lr-value"></div>
  </div>`).join('')}</div>`:`<div class="empty">這個分頁沒有工作單</div>`}</div>
  <div class="toast" id="toast"></div>`;
}
function taskSetTab(k){ TASK_TAB=k; render() }

/* ---------- 詳情 / 轉交 / 核准退回 ---------- */
function currentStepDef(t){
  if(!t.workflow_id) return null;
  const wf = WORKFLOWS.find(w=>w.id===t.workflow_id);
  if(!wf) return null;
  return (wf.steps||[])[t.step] || null;
}
async function taskOpenDetail(id){
  TASK_DETAIL_ID = id;
  TASK_EVENTS = [];
  let dlg = document.getElementById('taskDetailDlg');
  if(!dlg){ dlg=document.createElement('dialog'); dlg.id='taskDetailDlg'; dlg.style.maxWidth='620px'; dlg.style.width='92vw'; document.body.appendChild(dlg) }
  dlg.innerHTML = taskDetailHTML();
  dlg.showModal();
  try{ TASK_EVENTS = await api('task_events','GET',{query:`?task_id=eq.${id}&select=*&order=created_at.asc`}) }catch(_){ TASK_EVENTS=[] }
  const dlg2 = document.getElementById('taskDetailDlg');
  if(dlg2 && dlg2.open) dlg2.innerHTML = taskDetailHTML();
}
const TASK_ACTION_LABEL = {create:'建立',transfer:'轉交',comment:'留言',approve:'核准',reject:'退回',done:'完成'};
function taskDetailHTML(){
  const t = TASKS.find(x=>x.id===TASK_DETAIL_ID);
  if(!t) return '<div class="dlgbar"><button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'taskDetailDlg\').close()">關閉</button></div>';
  const step = currentStepDef(t);
  const isMine = t.status==='open' && (t.to_user===ME.id || (!t.to_user && t.to_dept && t.to_dept===ME.dept_id) || ME.role==='admin');
  const isReview = step && step.action==='review';
  return `<div class="dlgbar"><strong style="margin-right:auto">${esc(t.title)}</strong>
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('taskDetailDlg').close()">關閉</button></div>
  <div style="padding:0 16px 16px">
    <div class="sub">模組：${t.module?esc((M[t.module]&&M[t.module].name)||t.module):'—'}　優先：${TASK_PRIORITY_LABEL[t.priority]||t.priority}　期限：${t.due?esc(t.due):'—'}</div>
    ${t.note?`<p>${esc(t.note)}</p>`:''}
    <div class="sub">目前狀態：<span class="tag ${t.status==='done'?'g':''}">${t.status==='open'?'處理中':t.status==='done'?'已完成':'已取消'}</span>
      　目前對象：${t.to_user?esc(uploaderLabel(t.to_user)):(t.to_dept?esc(deptName(t.to_dept)):'—')}</div>
    ${(t.files||[]).length?`<div class="sub" style="margin-top:8px">附件：${t.files.map(p=>`<a href="#" onclick="event.preventDefault();getSignedUrl('${p}').then(u=>u&&window.open(u,'_blank'))">檔案</a>`).join('　')}</div>`:''}

    ${isMine ? `<h2 style="margin-top:16px">處理</h2>
      <div class="grid">
        <div class="field c6"><label>轉交部門</label><select id="td_dept"><option value="">未指定</option>${DEPTS.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="field c6"><label>轉交給（可留空＝整部門）</label><select id="td_user"><option value="">（不指定人）</option>${PROFILES.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field c12"><label>說明 <span class="req">*</span></label><textarea id="td_comment" placeholder="轉交說明 / 核准或退回原因"></textarea></div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" onclick="taskAction('transfer')">轉交</button>
        ${isReview?`<button class="btn btn-primary" onclick="taskAction('approve')">核准</button><button class="btn btn-ghost" onclick="taskAction('reject')">退回</button>`:''}
        <button class="btn btn-primary" onclick="taskAction('done')">處理完成</button>
      </div>` : ''}

    <h2 style="margin-top:16px">流程軌跡</h2>
    <div class="timeline2">${TASK_EVENTS.length?TASK_EVENTS.map(ev=>`<div class="ev">
      <strong>${esc(uploaderLabel(ev.actor))}　${TASK_ACTION_LABEL[ev.action]||ev.action}</strong>
      <div class="meta">${esc((ev.created_at||'').replace('T',' ').slice(0,16))}${ev.comment?`　${esc(ev.comment)}`:''}</div>
    </div>`).join(''):'<div class="sub">尚無紀錄</div>'}</div>
  </div>
  <div class="toast" id="toast" style="padding:0 16px"></div>`;
}
async function taskAction(kind){
  const t = TASKS.find(x=>x.id===TASK_DETAIL_ID);
  if(!t) return;
  const comment = $('#td_comment') ? $('#td_comment').value.trim() : '';
  if((kind==='transfer'||kind==='reject') && !comment){ toast('請填說明',1); return }
  try{
    if(kind==='done'){
      await api('tasks','PATCH',{body:{status:'done'},query:`?id=eq.${t.id}`});
      await api('task_events','POST',{body:{task_id:t.id, actor:ME.id, action:'done', comment:comment||null}});
    }else if(kind==='transfer'){
      const to_dept = $('#td_dept').value||null, to_user=$('#td_user').value||null;
      if(!to_dept && !to_user){ toast('請選轉交對象',1); return }
      await api('tasks','PATCH',{body:{to_user:to_user||null, to_dept:to_user?null:to_dept},query:`?id=eq.${t.id}`});
      await api('task_events','POST',{body:{task_id:t.id, actor:ME.id, action:'transfer', from_user:ME.id, to_user, to_dept:to_user?null:to_dept, comment}});
    }else if(kind==='approve'){
      const wf = WORKFLOWS.find(w=>w.id===t.workflow_id);
      const nextStep = wf ? (wf.steps||[])[t.step+1] : null;
      if(nextStep){
        await api('tasks','PATCH',{body:{step:t.step+1, to_user:nextStep.user_id||null, to_dept:nextStep.user_id?null:nextStep.dept_id||null},query:`?id=eq.${t.id}`});
      }else{
        await api('tasks','PATCH',{body:{status:'done'},query:`?id=eq.${t.id}`});
      }
      await api('task_events','POST',{body:{task_id:t.id, actor:ME.id, action:'approve', comment:comment||null}});
    }else if(kind==='reject'){
      const prevEvent = [...TASK_EVENTS].reverse().find(ev=>ev.action==='transfer'||ev.action==='create');
      const backTo = prevEvent ? prevEvent.from_user : t.from_user;
      await api('tasks','PATCH',{body:{to_user:backTo, to_dept:null},query:`?id=eq.${t.id}`});
      await api('task_events','POST',{body:{task_id:t.id, actor:ME.id, action:'reject', from_user:ME.id, to_user:backTo, comment}});
    }
    await loadTasks();
    await taskOpenDetail(t.id);
    if(view==='tasks') render();
    toast('已更新');
  }catch(e){ toast('操作失敗：'+e.message,1) }
}
