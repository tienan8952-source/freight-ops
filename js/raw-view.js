/* ==================== 原始層：顯示畫面 / 欄位對照設定畫面 ====================
   讀 js/raw-import.js 存進去的 raw_records，依 field_mappings 呈現成表格。
   本檔案只呈現、只設定，不做任何計算，也不會修改 raw_records 內容。 */
(NAV_GROUPS.find(g=>g.label==='原始資料') || (NAV_GROUPS.push({label:'原始資料',keys:[]}), NAV_GROUPS[NAV_GROUPS.length-1])).keys.push('rawview','rawmap');
PERM_OF.rawview = 'imports.view';
PERM_OF.rawmap = 'mappings.edit';
MODLIST.push(
  {key:'mappings.view', label:'欄位對照-檢視'},
  {key:'mappings.edit', label:'欄位對照-編輯'}
);
M.rawview = {name:'資料顯示', icon:'📄', render:()=>rawViewHTML()};
M.rawmap = {name:'欄位對照設定', icon:'🧩', render:()=>rawMapHTML()};

function cssId(s){ return String(s).replace(/[^\w-]/g,'_') }
async function apiUpsert(table, rows, conflictCols){
  if(!rows.length) return;
  await ensureSession();
  const h={apikey:ANON_KEY,Authorization:'Bearer '+(AUTH.access||ANON_KEY),'Content-Type':'application/json',
    Prefer:'resolution=merge-duplicates,return=representation'};
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictCols)}`,{method:'POST',headers:h,body:JSON.stringify(rows)});
  if(!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0,200)}`);
  return r.json();
}

/* ---------- 顯示畫面 ---------- */
let RV = {dataType:'', period:'', periods:[], rows:[], mapping:[], loaded:false};

function rawViewHTML(){
  if(!RAW_TYPES_LOADED){
    loadRawTypes().then(()=>{ if(view==='rawview') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  return `<div class="head"><h1>📄 資料顯示</h1><span class="sub">依「欄位對照設定」呈現匯入的原始資料</span></div>
  <div class="grid">
    <div class="field c6"><label>資料類型</label><select onchange="rvSetType(this.value)">
      <option value="">請選擇</option>${RAW_TYPES.map(t=>`<option value="${esc(t)}"${RV.dataType===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="field c6"><label>期間</label><select onchange="rvSetPeriod(this.value)" ${RV.dataType?'':'disabled'}>
      <option value="">全部期間</option>${RV.periods.map(p=>`<option value="${esc(p)}"${RV.period===p?' selected':''}>${esc(p)}</option>`).join('')}</select></div>
  </div>
  <div id="rawViewBody">${RV.dataType?rawViewBodyHTML():'<div class="hint">先選資料類型</div>'}</div>
  <div class="toast" id="toast"></div>`;
}
async function rvSetType(dt){
  RV.dataType=dt; RV.period=''; RV.rows=[]; RV.mapping=[]; RV.loaded=false;
  if(!dt){ render(); return }
  try{
    const batches = await api('import_batches','GET',{query:`?select=period&data_type=eq.${encodeURIComponent(dt)}&status=neq.${encodeURIComponent(RAW_REVOKED)}`});
    RV.periods = [...new Set((batches||[]).map(b=>b.period).filter(Boolean))].sort();
  }catch(e){ RV.periods=[] }
  await rvLoad();
  render();
}
async function rvSetPeriod(p){ RV.period=p; await rvLoad(); render() }
async function rvLoad(){
  if(!RV.dataType){ RV.rows=[]; RV.mapping=[]; RV.loaded=true; return }
  RV.loaded=false;
  try{
    let q=`?select=id&data_type=eq.${encodeURIComponent(RV.dataType)}&status=neq.${encodeURIComponent(RAW_REVOKED)}`;
    if(RV.period) q+=`&period=eq.${encodeURIComponent(RV.period)}`;
    const batches = await api('import_batches','GET',{query:q});
    const ids=(batches||[]).map(b=>b.id);
    RV.rows = ids.length ? ((await api('raw_records','GET',{query:`?select=*&batch_id=in.(${ids.join(',')})&order=row_no.asc&limit=2000`}))||[]) : [];
    RV.mapping = (await api('field_mappings','GET',{query:`?select=*&data_type=eq.${encodeURIComponent(RV.dataType)}&order=sort_order.asc`}))||[];
  }catch(e){ RV.rows=[]; RV.mapping=[]; toast('讀取失敗：'+e.message,1) }
  RV.loaded=true;
}
function rvCheckHint(v, hint){
  if(v==null || v==='') return false;
  if(hint==='數字') return isNaN(Number(String(v).replace(/[,，\s]/g,'')));
  if(hint==='日期') return isNaN(Date.parse(String(v)));
  return false;
}
function rawViewBodyHTML(){
  if(!RV.loaded) return '<div style="padding:40px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  const cols = RV.mapping.filter(m=>m.visible);
  if(!cols.length) return '<div class="hint">這個資料類型還沒有設定欄位對照，先到「欄位對照設定」設定要顯示哪些欄位。</div>';
  return `<div class="hint">以下為匯入檔案的原始內容，來源：匯入檔案，本頁不做任何計算。</div>
  <div class="actions"><button class="btn btn-ghost btn-sm" onclick="rawViewExportCSV()">匯出 Excel</button></div>
  <div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c.display_name||c.source_field)}</th>`).join('')}</tr></thead>
  <tbody>${RV.rows.length?RV.rows.map(r=>`<tr>${cols.map(c=>{
    const v=(r.raw||{})[c.source_field];
    if(v===undefined) return `<td style="color:var(--muted)">查無此欄</td>`;
    const bad = rvCheckHint(v,c.type_hint);
    return `<td${bad?` style="color:var(--danger)" title="型態疑似不符（${esc(c.type_hint)}）"`:''}>${esc(v)}</td>`;
  }).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length}" style="padding:30px;text-align:center;color:var(--muted)">沒有符合的資料</td></tr>`}</tbody></table></div>
  <div class="sub">共 ${RV.rows.length} 列${RV.rows.length>=2000?'（僅顯示前 2000 列）':''}</div>`;
}
function rawViewExportCSV(){
  const cols = RV.mapping.filter(m=>m.visible);
  if(!cols.length||!RV.rows.length) return toast('沒有可以匯出的資料',1);
  const q=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const csv=[cols.map(c=>q(c.display_name||c.source_field)).join(',')]
    .concat(RV.rows.map(r=>cols.map(c=>q((r.raw||{})[c.source_field])).join(','))).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`${RV.dataType}_${RV.period||'全部'}_${today()}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast(`已匯出 ${RV.rows.length} 筆`);
}

/* ---------- 欄位對照設定畫面 ---------- */
let FM = {dataType:'', keys:[], existing:[], loading:false};

function rawMapHTML(){
  if(!RAW_TYPES_LOADED){
    loadRawTypes().then(()=>{ if(view==='rawmap') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  return `<div class="head"><h1>🧩 欄位對照設定</h1><span class="sub">設定原始欄位要不要顯示、顯示名稱、順序、型態</span></div>
  <div class="field c6"><label>資料類型</label><select onchange="fmSetType(this.value)">
    <option value="">請選擇</option>${RAW_TYPES.map(t=>`<option value="${esc(t)}"${FM.dataType===t?' selected':''}>${esc(t)}</option>`).join('')}</select></div>
  <div id="rawMapBody">${FM.dataType?fmBodyHTML():'<div class="hint">先選資料類型</div>'}</div>
  <div class="toast" id="toast"></div>`;
}
async function fmSetType(dt){
  FM.dataType=dt; FM.keys=[]; FM.existing=[];
  if(!dt){ render(); return }
  FM.loading=true; render();
  try{
    const batches = await api('import_batches','GET',{query:`?select=id&data_type=eq.${encodeURIComponent(dt)}&status=neq.${encodeURIComponent(RAW_REVOKED)}`});
    const ids=(batches||[]).map(b=>b.id);
    const rows = ids.length ? ((await api('raw_records','GET',{query:`?select=raw&batch_id=in.(${ids.join(',')})&limit=3000`}))||[]) : [];
    const keySet=new Set();
    rows.forEach(r=>Object.keys(r.raw||{}).forEach(k=>keySet.add(k)));
    FM.existing = (await api('field_mappings','GET',{query:`?select=*&data_type=eq.${encodeURIComponent(dt)}&order=sort_order.asc`}))||[];
    FM.existing.forEach(m=>keySet.add(m.source_field));
    FM.keys=[...keySet];
  }catch(e){ toast('讀取失敗：'+e.message,1) }
  FM.loading=false; render();
}
function fmRowFor(key){
  return FM.existing.find(m=>m.source_field===key) || {source_field:key, display_name:key, visible:true, sort_order:FM.keys.indexOf(key), type_hint:'文字'};
}
function fmBodyHTML(){
  if(FM.loading) return '<div style="padding:40px;text-align:center;color:var(--muted)"><span class="spin"></span>掃描已匯入資料中…</div>';
  if(!FM.keys.length) return '<div class="hint">這個資料類型還沒有任何匯入資料，先到「原始資料匯入」匯入一份檔案。</div>';
  const rows = FM.keys.map(fmRowFor).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0));
  return `<div class="tablewrap"><table><thead><tr><th>原始欄位</th><th>顯示</th><th>顯示名稱</th><th>順序</th><th>型態</th></tr></thead>
  <tbody>${rows.map(m=>{const cid=cssId(m.source_field);return `<tr>
    <td>${esc(m.source_field)}</td>
    <td><input type="checkbox" id="fm_v_${cid}" ${m.visible?'checked':''}></td>
    <td><input type="text" id="fm_d_${cid}" value="${esc(m.display_name||'')}"></td>
    <td><input type="number" id="fm_o_${cid}" value="${m.sort_order||0}" style="width:70px"></td>
    <td><select id="fm_t_${cid}">
      ${['文字','數字','日期'].map(o=>`<option${m.type_hint===o?' selected':''}>${o}</option>`).join('')}</select></td>
  </tr>`}).join('')}</tbody></table></div>
  <div class="actions"><button class="btn btn-primary" onclick="fmSaveAll()">儲存設定</button></div>`;
}
async function fmSaveAll(){
  const writes = FM.keys.map(key=>{
    const cid=cssId(key);
    return {
      data_type: FM.dataType, source_field: key,
      visible: !!$('#fm_v_'+cid).checked,
      display_name: ($('#fm_d_'+cid).value||'').trim()||key,
      sort_order: Number($('#fm_o_'+cid).value)||0,
      type_hint: $('#fm_t_'+cid).value
    };
  });
  try{
    await apiUpsert('field_mappings', writes, 'data_type,source_field');
    FM.existing = writes.map(w=>({...w}));
    toast('已儲存設定');
  }catch(e){ toast('儲存失敗：'+e.message,1) }
}
