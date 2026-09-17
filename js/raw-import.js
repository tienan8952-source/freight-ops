/* ==================== 原始層：匯入畫面 / 匯入紀錄畫面 ====================
   跟 js/importer.js（欄位對欄位直接寫進業務表）是平行的另一條路線：
   整份 Excel 每一列原封不動存進 raw_records.raw（JSONB），不做任何欄位
   裁切或型態轉換。畫面呈現與欄位對照設定在 js/raw-view.js。 */
NAV_GROUPS.push({label:'原始資料', keys:['rawimport','rawbatches']});
PERM_OF.rawimport = 'imports.create';
PERM_OF.rawbatches = 'imports.view';
MODLIST.push(
  {key:'imports.view', label:'原始匯入-檢視'},
  {key:'imports.create', label:'原始匯入-新增'},
  {key:'imports.revoke', label:'原始匯入-撤銷'}
);
M.rawimport = {name:'原始資料匯入', icon:'📥', render:()=>rawImportHTML()};
M.rawbatches = {name:'匯入紀錄', icon:'🗂️', render:()=>rawBatchesHTML()};

const RAW_REVOKED = '已撤銷';

let RAW_TYPES_LOADED=false, RAW_TYPES=[];
let RAWIMP = {dataType:'', period:'', fileName:'', headers:[], rows:[], hash:'', dup:[], forceGo:false, running:false, done:0, total:0, ok:0, fails:[]};

async function loadRawTypes(){
  try{
    const rows = await api('import_batches','GET',{query:'?select=data_type&order=data_type.asc'});
    RAW_TYPES = [...new Set((rows||[]).map(r=>r.data_type).filter(Boolean))];
  }catch(e){ RAW_TYPES = [] }
  RAW_TYPES_LOADED = true;
}
async function fileSha256(file){
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ---------- 匯入畫面 ---------- */
function rawImportHTML(){
  if(!RAW_TYPES_LOADED){
    loadRawTypes().then(()=>{ if(view==='rawimport') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  return `<div class="head"><h1>📥 原始資料匯入</h1><span class="sub">整份 Excel 原封不動存起來，怎麼顯示另外在「欄位對照設定」設定</span></div>
  <div class="grid">
    <div class="field c6"><label>資料類型標籤 <span class="req">*</span></label>
      <input type="text" id="rawDataType" list="rawTypeList" value="${esc(RAWIMP.dataType)}" oninput="RAWIMP.dataType=this.value" placeholder="例如：司機薪資表">
      <datalist id="rawTypeList">${RAW_TYPES.map(t=>`<option value="${esc(t)}">`).join('')}</datalist></div>
    <div class="field c6"><label>所屬期間（可留白）</label>
      <input type="month" id="rawPeriod" value="${esc(RAWIMP.period)}" onchange="RAWIMP.period=this.value"></div>
    <div class="field c12"><label>選擇檔案（.csv 或 .xlsx）</label>
      <input type="file" accept=".csv,.xlsx,.xls" onchange="if(this.files[0])rawLoadFile(this.files[0])"></div>
  </div>
  <div id="rawImpBody">${rawImpBodyHTML()}</div>
  <div class="toast" id="toast"></div>`;
}
function renderRawImpBody(){ const el=$('#rawImpBody'); if(el) el.innerHTML = rawImpBodyHTML() }
function rawImpBodyHTML(){
  if(!RAWIMP.rows.length) return '';
  const preview = RAWIMP.rows.slice(0,10);
  const dupHTML = RAWIMP.dup.length
    ? `<div class="hint bad">這個檔案${RAWIMP.dup.map(b=>`在 ${esc((b.imported_at||'').slice(0,10))} 匯過（${esc(b.data_type)}${b.period?'／'+esc(b.period):''}，匯入者 ${esc(uploaderLabel(b.imported_by))}）`).join('；')}。確定的話可以仍要匯入。</div>`
    : '';
  const canGo = RAWIMP.dataType.trim() && (!RAWIMP.dup.length || RAWIMP.forceGo);
  return `<h2 style="margin-top:20px">預覽（共 ${RAWIMP.rows.length} 列，僅顯示前 10 列）</h2>
  <div class="tablewrap"><table><thead><tr>${RAWIMP.headers.map(h=>`<th>${esc(h)||'（未命名欄位）'}</th>`).join('')}</tr></thead>
  <tbody>${preview.map(r=>`<tr>${RAWIMP.headers.map((h,i)=>`<td>${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  ${dupHTML}
  <div class="actions">
    ${RAWIMP.dup.length&&!RAWIMP.forceGo?`<button class="btn btn-ghost" onclick="RAWIMP.forceGo=true;renderRawImpBody()">仍要匯入</button>`:''}
    <button class="btn btn-primary" ${canGo?'':'disabled'} onclick="rawImportRun()">開始匯入</button>
  </div>
  <div id="rawImpProgress"></div>`;
}
async function rawLoadFile(file){
  try{
    RAWIMP.fileName = file.name;
    const [raw, hash] = await Promise.all([impReadFile(file), fileSha256(file)]);
    if(!raw.length){ toast('這個檔案是空的',1); return }
    RAWIMP.headers = raw[0].map(h=>String(h||'').trim());
    RAWIMP.rows = raw.slice(1).filter(r=>r.some(c=>String(c||'').trim()!==''));
    RAWIMP.hash = hash;
    RAWIMP.forceGo = false;
    const dupRows = await api('import_batches','GET',{query:`?select=*&file_hash=eq.${hash}&status=neq.${encodeURIComponent(RAW_REVOKED)}&order=imported_at.desc`});
    RAWIMP.dup = dupRows || [];
    renderRawImpBody();
  }catch(e){ toast('讀取失敗：'+e.message,1) }
}
async function rawImportRun(){
  if(RAWIMP.running) return;
  if(!RAWIMP.dataType.trim()){ toast('請先填「資料類型標籤」',1); return }
  RAWIMP.running=true; RAWIMP.done=0; RAWIMP.ok=0; RAWIMP.fails=[];
  const total = RAWIMP.rows.length;
  RAWIMP.total = total;
  const headers = RAWIMP.headers;
  const prog = ()=>$('#rawImpProgress');
  let batchId;
  try{
    const created = await api('import_batches','POST',{body:{
      file_name: RAWIMP.fileName, file_hash: RAWIMP.hash, data_type: RAWIMP.dataType.trim(),
      period: RAWIMP.period||null, imported_by: ME.id, total_rows: total, status:'進行中'
    }});
    batchId = created[0].id;
  }catch(e){ toast('建立匯入批次失敗：'+e.message,1); RAWIMP.running=false; return }

  const CHUNK=200;
  for(let i=0;i<total;i+=CHUNK){
    const slice = RAWIMP.rows.slice(i,i+CHUNK).map((row,idx)=>({
      batch_id: batchId, row_no: i+idx+1,
      raw: Object.fromEntries(headers.map((h,c)=>[h||`欄位${c+1}`, row[c]===undefined?null:row[c]]))
    }));
    try{
      await api('raw_records','POST',{body:slice});
      RAWIMP.ok += slice.length;
    }catch(e){
      for(const item of slice){
        try{ await api('raw_records','POST',{body:[item]}); RAWIMP.ok++ }
        catch(e2){ RAWIMP.fails.push({rowNo:item.row_no, reason:e2.message}) }
      }
    }
    RAWIMP.done = Math.min(total, i+CHUNK);
    if(prog()) prog().innerHTML = `<div class="hint">匯入中… ${RAWIMP.done} / ${total}</div><div class="progress"><b style="width:${Math.round(RAWIMP.done/total*100)}%"></b></div>`;
    await new Promise(r=>setTimeout(r,0));
  }
  try{ await api('import_batches','PATCH',{body:{status:'完成'},query:`?id=eq.${batchId}`}) }catch(e){}
  RAWIMP.running=false;
  RAW_BATCHES_LOADED=false;
  if(prog()) prog().innerHTML = `<div class="hint">匯入完成：成功 ${RAWIMP.ok} 列、失敗 ${RAWIMP.fails.length} 列。</div>
    ${RAWIMP.fails.length?`<div class="tablewrap" style="max-height:220px;overflow:auto"><table><tbody>
      ${RAWIMP.fails.map(f=>`<tr><td>第 ${f.rowNo} 列</td><td>${esc(f.reason)}</td></tr>`).join('')}
    </tbody></table></div>`:''}
    <div class="actions"><button class="btn btn-ghost btn-sm" onclick="go('rawbatches')">查看匯入紀錄</button></div>`;
}

/* ---------- 匯入紀錄畫面 ---------- */
let RAW_BATCHES_LOADED=false, RAW_BATCHES=[], RAW_EXPANDED={};
async function loadRawBatches(){
  try{ RAW_BATCHES = await api('import_batches','GET',{query:'?select=*&order=imported_at.desc'}) }
  catch(e){ RAW_BATCHES=[] }
  RAW_BATCHES_LOADED=true;
}
function rawBatchGroup(b){
  return RAW_BATCHES.filter(x=>x.data_type===b.data_type && (x.period||'')===(b.period||''))
    .slice().sort((a,c)=>(a.imported_at||'').localeCompare(c.imported_at||''));
}
function rawBatchesHTML(){
  if(!RAW_BATCHES_LOADED){
    loadRawBatches().then(()=>{ if(view==='rawbatches') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  return `<div class="head"><h1>🗂️ 匯入紀錄</h1><span class="sub">${RAW_BATCHES.length} 批</span><span class="spacer"></span>
    <button class="btn btn-ghost btn-sm" onclick="rawBatchesRefresh()">重新整理</button>
    <button class="btn btn-ghost btn-sm" onclick="rawBatchesExportCSV()">匯出 Excel</button></div>
  ${RAW_BATCHES.length?`<div class="tablewrap"><table><thead><tr>
    <th>檔案名</th><th>類型</th><th>期間</th><th>匯入者</th><th>時間</th><th>列數</th><th>狀態</th><th></th></tr></thead>
    <tbody>${RAW_BATCHES.map(rawBatchRowHTML).join('')}</tbody></table></div>`
    :`<div class="empty"><strong>還沒有匯入紀錄</strong>到「原始資料匯入」上傳第一份檔案。</div>`}
  <div class="toast" id="toast"></div>`;
}
function rawBatchRowHTML(b){
  const group = rawBatchGroup(b);
  const ord = group.findIndex(x=>x.id===b.id)+1;
  const statusTag = b.status===RAW_REVOKED?'<span class="tag d">已撤銷</span>':b.status==='進行中'?'<span class="tag w">進行中</span>':'<span class="tag g">完成</span>';
  let row = `<tr><td>${esc(b.file_name)}</td><td><span class="tag">${esc(b.data_type)}</span></td>
    <td>${esc(b.period||'—')}${group.length>1?`<div class="meta">本期間第 ${ord} 批</div>`:''}</td>
    <td>${esc(uploaderLabel(b.imported_by))}</td>
    <td>${esc((b.imported_at||'').slice(0,16).replace('T',' '))}</td>
    <td>${b.total_rows==null?'—':b.total_rows}</td>
    <td>${statusTag}</td>
    <td style="white-space:nowrap">
      <button class="rowbtn" onclick="toggleRawExpand('${b.id}')">${RAW_EXPANDED[b.id]?'收合':'展開'}</button>
      ${b.status!==RAW_REVOKED?`<button class="rowbtn del" onclick="revokeRawBatch('${b.id}')">整批撤銷</button>`:''}
    </td></tr>`;
  if(RAW_EXPANDED[b.id]) row += `<tr><td colspan="8">${rawExpandBodyHTML(b.id)}</td></tr>`;
  return row;
}
async function toggleRawExpand(id){
  if(RAW_EXPANDED[id]){ delete RAW_EXPANDED[id]; render(); return }
  RAW_EXPANDED[id] = {loading:true, rows:[]};
  render();
  try{
    const rows = await api('raw_records','GET',{query:`?batch_id=eq.${id}&select=*&order=row_no.asc&limit=500`});
    RAW_EXPANDED[id] = {loading:false, rows: rows||[]};
  }catch(e){ RAW_EXPANDED[id] = {loading:false, rows:[], error:e.message} }
  render();
}
function rawExpandBodyHTML(id){
  const st = RAW_EXPANDED[id];
  if(!st || st.loading) return '<div style="padding:12px"><span class="spin"></span> 載入原始列中…</div>';
  if(st.error) return `<div class="hint bad">讀取失敗：${esc(st.error)}</div>`;
  if(!st.rows.length) return '<div class="empty">沒有原始列（可能已撤銷）</div>';
  const keys = [...new Set(st.rows.flatMap(r=>Object.keys(r.raw||{})))];
  return `<div class="tablewrap" style="max-height:320px;overflow:auto"><table><thead><tr><th>列號</th>${keys.map(k=>`<th>${esc(k)}</th>`).join('')}</tr></thead>
    <tbody>${st.rows.map(r=>`<tr><td>${r.row_no}</td>${keys.map(k=>`<td>${esc((r.raw||{})[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="sub">共 ${st.rows.length} 列${st.rows.length>=500?'（僅顯示前 500 列）':''}</div>`;
}
async function revokeRawBatch(id){
  const b = RAW_BATCHES.find(x=>x.id===id); if(!b) return;
  if(!confirm(`確定整批撤銷「${b.file_name}」？這批底下的原始資料會被刪除，批次紀錄會保留但標記為已撤銷。`)) return;
  try{
    await api('raw_records','DELETE',{query:`?batch_id=eq.${id}`});
    await api('import_batches','PATCH',{body:{status:RAW_REVOKED},query:`?id=eq.${id}`});
    delete RAW_EXPANDED[id];
    await loadRawBatches();
    render(); toast('已撤銷');
  }catch(e){ toast('撤銷失敗：'+e.message,1) }
}
async function rawBatchesRefresh(){ await loadRawBatches(); render() }
function rawBatchesExportCSV(){
  if(!RAW_BATCHES.length) return toast('沒有可以匯出的紀錄',1);
  const q=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const heads=['檔案名','類型','期間','匯入者','時間','列數','狀態'];
  const csv=[heads.map(q).join(',')].concat(RAW_BATCHES.map(b=>[
    b.file_name,b.data_type,b.period||'',uploaderLabel(b.imported_by),(b.imported_at||'').slice(0,16).replace('T',' '),b.total_rows,b.status
  ].map(q).join(','))).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`匯入紀錄_${today()}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast(`已匯出 ${RAW_BATCHES.length} 筆`);
}
