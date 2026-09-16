/* ==================== 階段三：Excel / CSV 匯入 ====================
   任何模組都能匯：上傳檔案 -> 預覽 -> 欄位對應（存 localStorage）-> 檢查 -> 分批寫入 */
ADMIN_ONLY_KEYS.push('importer');
SYSTEM_GROUP.keys.push('importer');
M.importer = {name:'匯入資料', icon:'📥', render:()=>importerHTML()};

const IMPORTABLE = ['trips','maint','petty','billing','insurance','docs','vehicles','drivers','customers'];
let IMP = {module:'trips', rows:[], headers:[], mapping:{}, problems:[], skipRows:new Set(), running:false, done:0, ok:0, skip:0, log:[]};

function impMapKey(mod){return `fops.import.map.${mod}`}
function loadMapping(mod, headers){
  try{
    const saved = JSON.parse(localStorage.getItem(impMapKey(mod))||'{}');
    const out={};
    M[mod].fields.forEach(f=>{ if(saved[f.k] && headers.includes(saved[f.k])) out[f.k]=saved[f.k] });
    return out;
  }catch(_){ return {} }
}
function saveMapping(mod, mapping){
  try{ localStorage.setItem(impMapKey(mod), JSON.stringify(mapping)) }catch(_){}
}

/* ---------- 讀檔 ---------- */
function impReadFile(file){
  return new Promise((resolve,reject)=>{
    const isCsv = /\.csv$/i.test(file.name);
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      try{
        if(isCsv){
          const text = fr.result;
          const rows = parseCSV(text);
          resolve(rows);
        }else{
          const wb = XLSX.read(fr.result, {type:'array', cellDates:false});
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:''});
          resolve(rows);
        }
      }catch(e){ reject(e) }
    };
    if(isCsv) fr.readAsText(file, 'utf-8'); else fr.readAsArrayBuffer(file);
  });
}
function parseCSV(text){
  const rows=[]; let row=[]; let cell=''; let inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQ){
      if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++} else inQ=false }
      else cell+=c;
    }else{
      if(c==='"') inQ=true;
      else if(c===','){ row.push(cell); cell='' }
      else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell='' }
      else if(c==='\r'){ /* skip */ }
      else cell+=c;
    }
  }
  if(cell!==''||row.length){ row.push(cell); rows.push(row) }
  return rows;
}

/* ---------- 值轉換 ---------- */
function toHalfWidth(s){
  return String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0));
}
function parseImportDate(v){
  if(v==null || v==='') return null;
  if(typeof v==='number'){ // Excel 序號
    const d = new Date(Math.round((v-25569)*86400*1000));
    if(!isNaN(d)) return d.toISOString().slice(0,10);
    return null;
  }
  let s = toHalfWidth(String(v)).trim();
  let m;
  if((m = s.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/))){
    let y = Number(m[1]);
    if(y < 1911) y += 1911; // 民國年
    return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }
  if((m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/))){
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }
  const d = new Date(s);
  if(!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}
function parseImportMoney(v){
  if(v==null || v==='') return null;
  if(typeof v==='number') return v;
  let s = toHalfWidth(String(v)).replace(/[$＄,，\s元]/g,'').trim();
  if(s==='') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/* ---------- UI ---------- */
function importerHTML(){
  return `<div class="head"><h1>📥 匯入資料</h1><span class="sub">從 Excel／CSV 把舊資料搬進來</span></div>
  <div class="field c6" style="max-width:300px"><label>要匯入哪個模組</label>
    <select onchange="impSetModule(this.value)">
      ${IMPORTABLE.map(k=>`<option value="${k}"${IMP.module===k?' selected':''}>${M[k].name}</option>`).join('')}
    </select>
  </div>
  <div class="field" style="max-width:400px"><label>選擇檔案（.csv 或 .xlsx）</label>
    <input type="file" accept=".csv,.xlsx,.xls" onchange="if(this.files[0])impLoadFile(this.files[0])"></div>
  <div id="impBody"></div>
  <div class="toast" id="toast"></div>`;
}
function impSetModule(mod){ IMP.module = mod; IMP.rows=[]; IMP.headers=[]; IMP.mapping={}; IMP.problems=[]; render() }
async function impLoadFile(file){
  try{
    const raw = await impReadFile(file);
    if(!raw.length){ toast('這個檔案是空的',1); return }
    IMP.headers = raw[0].map(h=>String(h||'').trim());
    IMP.rows = raw.slice(1).filter(r=>r.some(c=>String(c||'').trim()!==''));
    IMP.mapping = loadMapping(IMP.module, IMP.headers);
    IMP.problems = [];
    IMP.skipRows = new Set();
    renderImpBody();
  }catch(e){ toast('讀取失敗：'+e.message,1) }
}
function renderImpBody(){ const el=$('#impBody'); if(el) el.innerHTML = impBodyHTML() }
function impBodyHTML(){
  if(!IMP.rows.length) return '';
  const fields = M[IMP.module].fields;
  const mapRow = `<div class="tablewrap"><table><thead><tr><th>Excel 欄位</th><th>對應到</th></tr></thead><tbody>
    ${IMP.headers.map((h,i)=>`<tr><td>${esc(h)||`（第 ${i+1} 欄）`}</td><td>
      <select onchange="impSetMap('${h}',this.value)">
        <option value="">不匯入</option>
        ${fields.map(f=>`<option value="${f.k}"${IMP.mapping[f.k]===h?' selected':''}>${f.l}${f.req?' *':''}</option>`).join('')}
      </select></td></tr>`).join('')}
  </tbody></table></div>`;

  const preview = IMP.rows.slice(0,10);
  const previewTable = `<div class="tablewrap" style="margin-top:12px"><table><thead><tr>
    ${IMP.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
    ${preview.map(r=>`<tr>${IMP.headers.map((h,i)=>`<td>${esc(r[i])}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div><div class="sub">共 ${IMP.rows.length} 列，這裡只顯示前 10 列預覽</div>`;

  return `<h2 style="margin-top:20px">欄位對應</h2>${mapRow}
  <div class="actions"><button class="btn btn-ghost btn-sm" onclick="impCheck()">檢查資料</button></div>
  <h2 style="margin-top:20px">預覽</h2>${previewTable}
  <div id="impCheckResult"></div>`;
}
function impSetMap(header, fieldKey){
  Object.keys(IMP.mapping).forEach(k=>{ if(IMP.mapping[k]===header) delete IMP.mapping[k] });
  if(fieldKey) IMP.mapping[fieldKey] = header;
  saveMapping(IMP.module, IMP.mapping);
}
function impRowToRecord(row){
  const fields = M[IMP.module].fields;
  const rec = {};
  const problems = [];
  fields.forEach(f=>{
    const h = IMP.mapping[f.k];
    if(!h){ if(f.req) problems.push(`缺少「${f.l}」的欄位對應`); return }
    const idx = IMP.headers.indexOf(h);
    let raw = idx>=0 ? row[idx] : '';
    let v;
    if(f.t==='date') v = parseImportDate(raw);
    else if(f.t==='number') v = parseImportMoney(raw);
    else v = raw==null? '' : String(raw).trim();
    if(f.req && (v===''||v==null)) problems.push(`「${f.l}」是必填但是空白`);
    if(f.t==='date' && raw && v===null) problems.push(`「${f.l}」日期格式看不懂：${raw}`);
    if(f.t==='number' && raw!=='' && raw!=null && v===null) problems.push(`「${f.l}」金額格式看不懂：${raw}`);
    if(f.plate && v) v = String(v).toUpperCase();
    rec[f.k] = (v===''||v===undefined)?null:v;
  });
  rec.note = (rec.note?rec.note+'　':'') + '（匯入自 Excel）';
  return {rec, problems};
}
function impCheck(){
  const hasMapping = Object.keys(IMP.mapping).length>0;
  if(!hasMapping){ toast('請先設定至少一個欄位對應',1); return }
  IMP.problems = IMP.rows.map((row,i)=>{
    const {problems} = impRowToRecord(row);
    return {i, problems};
  });
  const bad = IMP.problems.filter(p=>p.problems.length);
  const el = $('#impCheckResult');
  if(!el) return;
  if(!bad.length){
    el.innerHTML = `<div class="hint">檢查完成：${IMP.rows.length} 列都沒問題，可以開始匯入。</div>
      <div class="actions"><button class="btn btn-primary" onclick="impRun(false)">開始匯入全部</button></div>`;
    return;
  }
  el.innerHTML = `<div class="hint bad">共 ${IMP.rows.length} 列，其中 ${bad.length} 列有問題（標紅的列會被跳過）：</div>
    <div class="tablewrap" style="max-height:220px;overflow:auto"><table><tbody>
    ${bad.slice(0,50).map(p=>`<tr><td style="color:var(--danger)">第 ${p.i+2} 列</td><td>${esc(p.problems.join('；'))}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="actions">
      <button class="btn btn-primary" onclick="impRun(true)">跳過問題列，匯入其餘 ${IMP.rows.length-bad.length} 列</button>
      <button class="btn btn-ghost" onclick="renderImpBody()">取消</button>
    </div>`;
}
async function impRun(skipBad){
  if(IMP.running) return;
  IMP.running = true; IMP.done=0; IMP.ok=0; IMP.skip=0; IMP.log=[];
  const badSet = new Set((IMP.problems||[]).filter(p=>p.problems.length).map(p=>p.i));
  const el = $('#impCheckResult');
  const batchSize = 50;
  const toImport = IMP.rows.map((row,i)=>({row,i})).filter(x=> !(skipBad && badSet.has(x.i)));
  for(let i=0;i<toImport.length;i+=batchSize){
    const batch = toImport.slice(i,i+batchSize);
    const recs = [];
    for(const item of batch){
      const {rec, problems} = impRowToRecord(item.row);
      if(problems.length){ IMP.skip++; continue }
      recs.push(rec);
    }
    if(recs.length){
      try{
        const out = await api(IMP.module,'POST',{body:recs});
        IMP.ok += (out||recs).length;
        CACHE[IMP.module] = (out||recs).concat(CACHE[IMP.module]);
      }catch(e){
        IMP.skip += recs.length;
        IMP.log.push('批次寫入失敗：'+e.message);
      }
    }
    IMP.done += batch.length;
    if(el) el.innerHTML = `<div class="hint">匯入中… ${IMP.done} / ${toImport.length}</div><div class="progress"><b style="width:${Math.round(IMP.done/toImport.length*100)}%"></b></div>`;
    await new Promise(r=>setTimeout(r,0));
  }
  IMP.running = false;
  if(el) el.innerHTML = `<div class="hint">匯入完成：成功 ${IMP.ok} 筆、略過 ${IMP.skip} 筆。</div>
    ${IMP.log.length?`<div class="sub">${IMP.log.map(esc).join('<br>')}</div>`:''}
    <div class="actions"><button class="btn btn-ghost btn-sm" onclick="go('${IMP.module}')">前往查看資料</button></div>`;
}
