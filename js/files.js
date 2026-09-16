/* ==================== 階段四：檔案庫 ==================== */
NAV_GROUPS.push({label:'檔案', keys:['files']});
M.files = {name:'檔案庫', icon:'🗂️', render:()=>filesHTML()};

let UPLOADS = [];
let UPLOADS_LOADED = false;
let FILE_F = {};

function uploaderLabel(id){
  if(!id) return '—';
  if(ME && id===ME.id) return ME.name;
  const p = PROFILES.find(x=>x.id===id);
  return p ? p.name : '同事';
}
function isImageMime(mime){ return /^image\//.test(mime||'') }
function fileIconFor(mime){
  if(isImageMime(mime)) return '🖼️';
  if(/pdf/.test(mime||'')) return '📕';
  if(/word|msword|officedocument\.wordprocessingml/.test(mime||'')) return '📄';
  if(/sheet|excel/.test(mime||'')) return '📊';
  return '📦';
}
function humanSize(n){
  if(!n) return '—';
  if(n<1024) return n+' B';
  if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
  return (n/1024/1024).toFixed(1)+' MB';
}

async function loadUploads(){
  try{ UPLOADS = await api('uploads','GET',{query:'?select=*&order=created_at.desc'}) }catch(e){ UPLOADS = [] }
  UPLOADS_LOADED = true;
}

async function uploadLibraryFile(file, moduleKey, refId){
  let blob, mime = file.type || 'application/octet-stream';
  if(isImageMime(mime)){
    const dataUrl = await shrink(file);
    const res = await fetch(dataUrl); blob = await res.blob(); mime = 'image/jpeg';
  }else{
    blob = file;
  }
  const safeName = file.name.replace(/[^\w.\-一-鿿]/g,'_');
  const path = `library/${Date.now()}_${safeName}`;
  await ensureSession();
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/scans/${path}`,{
    method:'POST',
    headers:{apikey:ANON_KEY,Authorization:'Bearer '+AUTH.access,'Content-Type':mime},
    body: blob
  });
  if(!r.ok) throw new Error(`上傳失敗 ${r.status}`);
  const rows = await api('uploads','POST',{body:{path,name:file.name,mime,size:blob.size,module:moduleKey||null,ref_id:refId||null,uploader:ME.id}});
  const row = (rows||[])[0];
  UPLOADS.unshift(row);
  return row;
}

async function filesUploadInput(inputEl){
  const files = Array.from(inputEl.files||[]);
  inputEl.value='';
  if(!files.length) return;
  toast(`上傳中… 0/${files.length}`);
  let ok=0;
  for(const f of files){
    try{ await uploadLibraryFile(f, null, null); ok++ ; toast(`上傳中… ${ok}/${files.length}`) }
    catch(e){ toast('有檔案上傳失敗：'+e.message,1) }
  }
  render();
  toast(`完成，成功 ${ok}/${files.length} 個檔案`);
}
function filesDrop(ev){
  ev.preventDefault();
  ev.currentTarget.classList.remove('over');
  const dt = ev.dataTransfer;
  if(!dt || !dt.files || !dt.files.length) return;
  filesUploadInput({files: dt.files, value:''});
}

function filesFiltered(){
  return UPLOADS.filter(u=>{
    if(FILE_F.module && u.module!==FILE_F.module) return false;
    if(FILE_F.uploader && u.uploader!==FILE_F.uploader) return false;
    if(FILE_F.from && (u.created_at||'')<FILE_F.from) return false;
    if(FILE_F.to && (u.created_at||'')>FILE_F.to+'T23:59:59') return false;
    if(FILE_F.q && !(u.name||'').toLowerCase().includes(FILE_F.q.toLowerCase())) return false;
    return true;
  });
}
function setFileF(k,v){ FILE_F[k]=v; const el=$('#filesGrid'); if(el) renderFilesGrid() }

function filesHTML(){
  if(!UPLOADS_LOADED){
    loadUploads().then(()=>{ if(view==='files') render() });
    return '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="spin"></span>載入中…</div>';
  }
  const uploaderIds = [...new Set(UPLOADS.map(u=>u.uploader).filter(Boolean))];
  const moduleNames = [...new Set(UPLOADS.map(u=>u.module).filter(Boolean))];
  return `<div class="head"><h1>🗂️ 檔案庫</h1><span class="sub">${UPLOADS.length} 個檔案</span><span class="spacer"></span>
    <button class="btn btn-ghost btn-sm" onclick="filesRefresh()">重新整理</button></div>
  <div class="dropzone" id="dropzone" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="filesDrop(event)">
    拖放檔案到這裡，或
    <input type="file" id="filesInput" multiple style="display:none" onchange="filesUploadInput(this)">
    <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('filesInput').click()">選擇檔案</button>
  </div>
  <div class="filters" style="margin-top:16px">
    <div class="field"><label>模組</label><select onchange="setFileF('module',this.value)">
      <option value="">全部</option>${moduleNames.map(m=>`<option value="${m}"${FILE_F.module===m?' selected':''}>${(M[m]&&M[m].name)||m}</option>`).join('')}</select></div>
    <div class="field"><label>上傳者</label><select onchange="setFileF('uploader',this.value)">
      <option value="">全部</option>${uploaderIds.map(id=>`<option value="${id}"${FILE_F.uploader===id?' selected':''}>${esc(uploaderLabel(id))}</option>`).join('')}</select></div>
    <div class="field"><label>起</label><input type="date" onchange="setFileF('from',this.value)"></div>
    <div class="field"><label>迄</label><input type="date" onchange="setFileF('to',this.value)"></div>
    <div class="field"><label>搜尋檔名</label><input type="text" oninput="setFileF('q',this.value)" placeholder="檔名關鍵字"></div>
  </div>
  <div class="filegrid" id="filesGrid">${filesGridHTML()}</div>
  <div class="toast" id="toast"></div>`;
}
function renderFilesGrid(){ const el=$('#filesGrid'); if(el) el.innerHTML = filesGridHTML() }
function filesGridHTML(){
  const rows = filesFiltered();
  if(!rows.length) return `<div class="empty" style="grid-column:1/-1"><strong>沒有符合的檔案</strong></div>`;
  rows.forEach(u=>{ if(isImageMime(u.mime)) setTimeout(()=>fillThumb(u.id,u.path), 0) });
  return rows.map(u=>`<div class="filecard">
    <div class="thumb" id="thumb_${u.id}" onclick="${isImageMime(u.mime)?`openSignedThenZoom('${u.path}')`:`downloadUpload('${u.id}')`}" style="cursor:pointer">${isImageMime(u.mime)?'⏳':fileIconFor(u.mime)}</div>
    <div class="meta"><strong title="${esc(u.name)}">${esc(u.name)}</strong>
      ${humanSize(u.size)} · ${esc(uploaderLabel(u.uploader))}<br>
      ${esc((u.created_at||'').slice(0,10))}${u.module?`<br>${esc((M[u.module]&&M[u.module].name)||u.module)}`:''}
      <div class="actions" style="margin-top:6px">
        <button class="rowbtn" onclick="downloadUpload('${u.id}')">下載</button>
        <button class="rowbtn del" onclick="deleteUpload('${u.id}')">刪除</button>
      </div>
    </div>
  </div>`).join('');
}
async function fillThumb(id, path){
  const el = document.getElementById('thumb_'+id);
  if(!el) return;
  const url = await getSignedUrl(path);
  if(url) el.innerHTML = `<img src="${url}" alt="">`;
}
async function openSignedThenZoom(path){
  const url = await getSignedUrl(path);
  if(url) zoom(url); else toast('無法取得檔案',1);
}
async function downloadUpload(id){
  const u = UPLOADS.find(x=>x.id===id);
  if(!u) return;
  const url = await getSignedUrl(u.path);
  if(!url) return toast('無法取得檔案',1);
  const a = document.createElement('a'); a.href=url; a.download=u.name||''; a.target='_blank'; a.click();
}
async function filesRefresh(){ await loadUploads(); render() }
async function deleteUpload(id){
  const u = UPLOADS.find(x=>x.id===id);
  if(!u) return;
  let refCount = 0;
  TABLES.forEach(t=>{ if(M[t].fields && M[t].fields.some(f=>f.t==='images')){
    CACHE[t].forEach(r=>{ if((r.scans||[]).includes(u.path)) refCount++ });
  }});
  const msg = refCount
    ? `這個檔案被 ${refCount} 筆業務資料引用中，刪除後那些紀錄會看不到這張圖。確定要刪除嗎？`
    : '確定刪除這個檔案？';
  if(!confirm(msg)) return;
  try{
    await deleteScanFile(u.path);
    await api('uploads','DELETE',{query:`?id=eq.${id}`});
    UPLOADS = UPLOADS.filter(x=>x.id!==id);
    render();
    toast('已刪除');
  }catch(e){ toast('刪除失敗：'+e.message,1) }
}

/* ---------- 給業務模組照片欄位用的「從檔案庫選擇」彈窗 ---------- */
async function openFilePicker(onPick){
  if(!UPLOADS_LOADED) await loadUploads();
  let dlg = document.getElementById('filePickerDlg');
  if(!dlg){
    dlg = document.createElement('dialog');
    dlg.id = 'filePickerDlg';
    dlg.style.maxWidth = '640px';
    dlg.style.width = '92vw';
    document.body.appendChild(dlg);
  }
  const imgs = UPLOADS.filter(u=>isImageMime(u.mime));
  dlg.innerHTML = `<div class="dlgbar"><strong style="margin-right:auto">從檔案庫選擇圖片</strong>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('filePickerDlg').close()">關閉</button></div>
    <div class="filegrid" style="padding:0 16px 16px">${imgs.length?imgs.map(u=>`
      <div class="filecard"><div class="thumb" id="pick_${u.id}" style="cursor:pointer">⏳</div>
      <div class="meta"><strong>${esc(u.name)}</strong></div></div>`).join(''):'<div class="empty">檔案庫還沒有圖片</div>'}</div>`;
  imgs.forEach(u=>{
    getSignedUrl(u.path).then(url=>{
      const el = document.getElementById('pick_'+u.id);
      if(el && url){ el.innerHTML = `<img src="${url}" alt="">`; el.onclick = ()=>{ onPick(u.path); dlg.close() } }
    });
  });
  dlg.showModal();
}
