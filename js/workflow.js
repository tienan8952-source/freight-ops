/* ==================== 階段五：流程設定 ＋ 部門管理 ==================== */
NAV_GROUPS.push({label:'流程管理', keys:['workflow']});
ADMIN_ONLY_KEYS.push('depts');
SYSTEM_GROUP.keys.push('depts');
M.workflow = {name:'流程設定', icon:'🔀', render:()=>workflowHTML()};
M.depts = {name:'部門管理', icon:'🏢', render:()=>deptsHTML()};

const WF_MODULES = ['trips','maint','petty','billing','insurance','docs'];
const WF_ACTIONS = [{k:'process',l:'處理'},{k:'review',l:'審核'},{k:'notify',l:'知會'}];
let WORKFLOWS = [], WORKFLOWS_LOADED = false;
let WF_EDIT = null; // 編輯中的流程物件（新增或修改）
let WF_DRAG_IDX = null;

async function loadWorkflows(){
  try{ WORKFLOWS = await api('workflows','GET',{query:'?select=*&order=created_at.asc'}) }catch(e){ WORKFLOWS=[] }
  WORKFLOWS_LOADED = true;
}
function newWorkflowDraft(){
  return {id:null, name:'', module:WF_MODULES[0], active:true,
    steps:[{name:'', dept_id:'', user_id:'', action:'process'}]};
}
function workflowHTML(){
  if(!WORKFLOWS_LOADED){
    loadWorkflows().then(()=>{ if(view==='workflow') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  return `<div class="head"><h1>🔀 流程設定</h1><span class="sub">${WORKFLOWS.length} 個流程範本</span><span class="spacer"></span>
    <button class="btn btn-primary btn-sm" onclick="wfEditNew()">新增流程</button></div>
  <div id="wfEditor">${WF_EDIT ? wfEditorHTML() : ''}</div>
  <div class="tablewrap" style="margin-top:16px"><table><thead><tr><th>名稱</th><th>適用模組</th><th>步驟數</th><th>狀態</th><th></th></tr></thead><tbody>
    ${WORKFLOWS.length ? WORKFLOWS.map(w=>`<tr>
      <td><strong>${esc(w.name)}</strong></td>
      <td>${esc((M[w.module]&&M[w.module].name)||w.module||'—')}</td>
      <td>${(w.steps||[]).length}</td>
      <td><span class="tag ${w.active?'g':'d'}">${w.active?'啟用':'已停用'}</span></td>
      <td><button class="rowbtn" onclick="wfEditExisting('${w.id}')">編輯</button>
        <button class="rowbtn" onclick="wfToggleActive('${w.id}',${!w.active})">${w.active?'停用':'啟用'}</button></td>
    </tr>`).join('') : '<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--muted)">還沒有流程範本</td></tr>'}
  </tbody></table></div>
  <div class="toast" id="toast"></div>`;
}
function wfEditNew(){ WF_EDIT = newWorkflowDraft(); render() }
function wfEditExisting(id){
  const w = WORKFLOWS.find(x=>x.id===id);
  if(!w) return;
  WF_EDIT = {id:w.id, name:w.name, module:w.module, active:w.active,
    steps:(w.steps||[]).map(s=>({name:s.name||'', dept_id:s.dept_id||'', user_id:s.user_id||'', action:s.action||'process'}))};
  render();
}
function wfCancelEdit(){ WF_EDIT=null; render() }
function wfEditorHTML(){
  const w = WF_EDIT;
  const deptOpts = DEPTS.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');
  const userOpts = PROFILES.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  return `<div class="panel" style="border:1px solid var(--rule);border-radius:8px;padding:16px;margin-bottom:16px;background:var(--panel)">
    <h2>${w.id?'編輯流程':'新增流程'}</h2>
    <div class="grid">
      <div class="field c6"><label>流程名稱 <span class="req">*</span></label><input type="text" id="wf_name" value="${esc(w.name)}"></div>
      <div class="field c6"><label>適用模組</label><select id="wf_module">${WF_MODULES.map(m=>`<option value="${m}"${w.module===m?' selected':''}>${M[m].name}</option>`).join('')}</select></div>
    </div>
    <h2 style="margin-top:16px">步驟（可拖曳排序）</h2>
    <div class="steplist" id="wfSteps">${w.steps.map((s,i)=>wfStepRowHTML(s,i,deptOpts,userOpts)).join('')}</div>
    <div class="actions"><button type="button" class="btn btn-ghost btn-sm" onclick="wfAddStep()">新增步驟</button></div>
    <div class="actions" style="margin-top:16px">
      <button class="btn btn-primary" onclick="wfSave()">儲存流程</button>
      <button class="btn btn-ghost" onclick="wfCancelEdit()">取消</button>
    </div>
  </div>`;
}
function wfStepRowHTML(s,i,deptOpts,userOpts){
  return `<div class="step" draggable="true" data-i="${i}"
    ondragstart="WF_DRAG_IDX=${i}" ondragover="event.preventDefault()" ondrop="wfDropStep(${i})">
    <span style="cursor:grab">☰ ${i+1}</span>
    <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px">
      <div class="field"><label>步驟名稱</label><input type="text" value="${esc(s.name)}" onchange="wfStepSet(${i},'name',this.value)"></div>
      <div class="field"><label>部門</label><select onchange="wfStepSet(${i},'dept_id',this.value)">
        <option value="">未指定</option>${DEPTS.map(d=>`<option value="${d.id}"${s.dept_id===d.id?' selected':''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>指派給（留空＝整部門）</label><select onchange="wfStepSet(${i},'user_id',this.value)">
        <option value="">整個部門</option>${PROFILES.map(p=>`<option value="${p.id}"${s.user_id===p.id?' selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>動作</label><select onchange="wfStepSet(${i},'action',this.value)">
        ${WF_ACTIONS.map(a=>`<option value="${a.k}"${s.action===a.k?' selected':''}>${a.l}</option>`).join('')}</select></div>
    </div>
    <button type="button" class="rowbtn del" onclick="wfRemoveStep(${i})">移除</button>
  </div>`;
}
function wfRenderSteps(){ const el=$('#wfSteps'); if(el){ const deptOpts='',userOpts=''; el.innerHTML = WF_EDIT.steps.map((s,i)=>wfStepRowHTML(s,i,deptOpts,userOpts)).join('') } }
function wfAddStep(){ WF_EDIT.steps.push({name:'',dept_id:'',user_id:'',action:'process'}); wfRenderSteps() }
function wfRemoveStep(i){ WF_EDIT.steps.splice(i,1); wfRenderSteps() }
function wfStepSet(i,k,v){ WF_EDIT.steps[i][k]=v }
function wfDropStep(i){
  if(WF_DRAG_IDX===null || WF_DRAG_IDX===i) return;
  const [moved] = WF_EDIT.steps.splice(WF_DRAG_IDX,1);
  WF_EDIT.steps.splice(i,0,moved);
  WF_DRAG_IDX = null;
  wfRenderSteps();
}
async function wfSave(){
  const name = $('#wf_name').value.trim();
  if(!name){ toast('請填流程名稱',1); return }
  const module = $('#wf_module').value;
  const steps = WF_EDIT.steps.map((s,i)=>({seq:i+1, name:s.name, dept_id:s.dept_id||null, user_id:s.user_id||null, action:s.action}));
  const body = {name, module, steps, active:true};
  try{
    if(WF_EDIT.id) await api('workflows','PATCH',{body,query:`?id=eq.${WF_EDIT.id}`});
    else await api('workflows','POST',{body});
    WF_EDIT = null;
    await loadWorkflows();
    render();
    toast('已儲存');
  }catch(e){ toast('儲存失敗：'+e.message,1) }
}
async function wfToggleActive(id, active){
  try{ await api('workflows','PATCH',{body:{active},query:`?id=eq.${id}`}); await loadWorkflows(); render() }
  catch(e){ toast('更新失敗：'+e.message,1) }
}

/* ---------- 部門管理 ---------- */
function deptsHTML(){
  return `<div class="head"><h1>🏢 部門管理</h1><span class="sub">${DEPTS.length} 個部門</span></div>
  <div class="grid" style="max-width:420px">
    <div class="field c8"><label>部門名稱</label><input type="text" id="deptName"></div>
    <div class="field c4"><label>排序</label><input type="number" id="deptSort" value="${DEPTS.length+1}"></div>
  </div>
  <div class="actions"><button class="btn btn-primary btn-sm" onclick="deptAdd()">新增部門</button></div>
  <div class="tablewrap" style="margin-top:16px"><table><thead><tr><th>排序</th><th>名稱</th><th></th></tr></thead><tbody>
    ${DEPTS.slice().sort((a,b)=>(a.sort||0)-(b.sort||0)).map(d=>`<tr>
      <td><input type="number" value="${d.sort||0}" style="width:70px" onchange="deptSetSort('${d.id}',this.value)"></td>
      <td><input type="text" value="${esc(d.name)}" onchange="deptRename('${d.id}',this.value)"></td>
      <td></td></tr>`).join('')}
  </tbody></table></div>
  <div class="toast" id="toast"></div>`;
}
async function deptAdd(){
  const name = $('#deptName').value.trim();
  if(!name){ toast('請填部門名稱',1); return }
  const sort = Number($('#deptSort').value)||0;
  try{ await api('departments','POST',{body:{name,sort}}); await loadDepts(); render(); toast('已新增') }
  catch(e){ toast('新增失敗：'+e.message,1) }
}
async function deptRename(id,name){
  try{ await api('departments','PATCH',{body:{name:name.trim()},query:`?id=eq.${id}`}); await loadDepts(); toast('已更新') }
  catch(e){ toast('更新失敗：'+e.message,1) }
}
async function deptSetSort(id,sort){
  try{ await api('departments','PATCH',{body:{sort:Number(sort)||0},query:`?id=eq.${id}`}); await loadDepts(); render() }
  catch(e){ toast('更新失敗：'+e.message,1) }
}
