/* ==================== 階段一：照片改存 Supabase Storage ====================
   scans 欄位可能同時有舊資料（base64 data URL）與新資料（storage 內的路徑字串）。
   一律用字串開頭判斷：data: 開頭 = 舊 base64；否則視為 storage 路徑。 */
const SIGNED_URL_TTL = 3600;
const _signedCache = {}; // path -> {url, exp}

function isBase64Scan(s){return typeof s==='string' && s.startsWith('data:')}

async function uploadScanFile(dataUrl, moduleKey, refId){
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${moduleKey}/${refId||'new'}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  await ensureSession();
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/scans/${path}`,{
    method:'POST',
    headers:{apikey:ANON_KEY,Authorization:'Bearer '+AUTH.access,'Content-Type':'image/jpeg'},
    body: blob
  });
  if(!r.ok) throw new Error(`上傳失敗 ${r.status}`);
  try{
    await api('uploads','POST',{body:{path,name:path.split('/').pop(),mime:'image/jpeg',size:blob.size,module:moduleKey,ref_id:refId||null,uploader:ME.id}});
  }catch(_){ /* uploads metadata 失敗不影響檔案本身已經存進 storage */ }
  return path;
}
async function getSignedUrl(path){
  const c=_signedCache[path];
  if(c && c.exp>Date.now()+30000) return c.url;
  await ensureSession();
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/scans/${path}`,{
    method:'POST',
    headers:{apikey:ANON_KEY,Authorization:'Bearer '+AUTH.access,'Content-Type':'application/json'},
    body: JSON.stringify({expiresIn:SIGNED_URL_TTL})
  });
  if(!r.ok) return '';
  const j=await r.json();
  const url = SUPABASE_URL + j.signedURL;
  _signedCache[path]={url, exp:Date.now()+SIGNED_URL_TTL*1000};
  return url;
}
async function deleteScanFile(path){
  await ensureSession();
  await fetch(`${SUPABASE_URL}/storage/v1/object/scans/${path}`,{
    method:'DELETE',
    headers:{apikey:ANON_KEY,Authorization:'Bearer '+AUTH.access}
  }).catch(()=>{});
  delete _signedCache[path];
}

/* 存檔前：把 pending（base64 或既有路徑混合）統一轉成路徑陣列，新照片才真的上傳 */
async function resolvePendingScans(moduleKey, refId){
  const out=[];
  for(const item of pending){
    if(isBase64Scan(item)){
      out.push(await uploadScanFile(item, moduleKey, refId));
    }else{
      out.push(item); // 已經是路徑，或是即將由檔案庫挑選出來的既有路徑
    }
  }
  return out;
}

/* 覆寫 fieldHTML 對 images 欄位的畫法：維持相同的選照片 UI，額外標示會上傳到雲端 */
function imagesFieldHTML(f){
  return `<div class="filebox"><input type="file" id="fileInput" accept="image/*" multiple onchange="addFiles(this)">
    <button type="button" onclick="document.getElementById('fileInput').click()">選擇照片</button>
    <button type="button" class="btn btn-ghost btn-sm" onclick="openFilePicker(v=>{pending.push(v);drawThumbs()})" style="margin-left:6px">從檔案庫選擇</button>
    <p>照片會壓縮後上傳到雲端儲存空間</p><div class="thumbs" id="thumbs"></div></div>`;
}

/* 顯示縮圖：非同步取得 signed URL，先放 loading 佔位再補上 */
function scansCellHTML(r){
  const scans = r.scans||[];
  if(!scans.length) return '<span style="color:var(--muted)">—</span>';
  const cellId = 'scans_'+r.id;
  setTimeout(()=>renderScanThumbs(cellId, scans), 0);
  return `<span id="${cellId}">${scans.map(()=>'<span class="tag">載入中…</span>').join('')}</span>`;
}
async function renderScanThumbs(cellId, scans){
  const el = document.getElementById(cellId);
  if(!el) return;
  const urls = await Promise.all(scans.map(async s=>{
    if(isBase64Scan(s)) return s;
    const u = await getSignedUrl(s);
    return u || '';
  }));
  el.innerHTML = urls.filter(Boolean).map(u=>`<img src="${u}" onclick="zoom(this.src)" alt="">`).join('') || '<span style="color:var(--muted)">—</span>';
}

/* saveRec 需要先把 pending 轉成路徑再送出；用 monkey-patch 的方式包住原本的存檔流程 */
const _origSaveRec = saveRec;
saveRec = async function(e){
  e.preventDefault();if(busy)return;
  const m=M[view];
  if(m.fields.some(f=>f.t==='images')){
    busy=true;const b=$('#saveBtn');if(b)b.disabled=true;toast('處理照片中…');
    try{
      pending = await resolvePendingScans(view, editId||null);
    }catch(err){
      toast('照片上傳失敗：'+err.message,1);
      busy=false;if(b)b.disabled=false;
      return;
    }
    busy=false;
  }
  return _origSaveRec(e);
};

/* ==================== 系統維護：base64 → Storage 一次性遷移 ==================== */
let migrateState = {running:false, done:0, total:0, log:[]};
async function runMigration(){
  if(migrateState.running) return;
  migrateState = {running:true, done:0, total:0, log:[]};
  render();
  const targets = TABLES.filter(t=>M[t] && M[t].fields && M[t].fields.some(f=>f.t==='images'));
  let jobs = [];
  for(const t of targets){
    for(const r of CACHE[t]){
      const scans = r.scans||[];
      if(scans.some(isBase64Scan)) jobs.push({table:t, rec:r});
    }
  }
  migrateState.total = jobs.length;
  for(const job of jobs){
    if(!migrateState.running) break; // 允許中斷
    try{
      const newScans = [];
      for(const s of (job.rec.scans||[])){
        newScans.push(isBase64Scan(s) ? await uploadScanFile(s, job.table, job.rec.id) : s);
      }
      await api(job.table,'PATCH',{body:{scans:newScans},query:`?id=eq.${job.rec.id}`});
      job.rec.scans = newScans;
      migrateState.log.push(`✓ ${M[job.table].name} #${job.rec.id.slice(0,8)}`);
    }catch(err){
      migrateState.log.push(`✗ ${M[job.table].name} #${job.rec.id.slice(0,8)}：${err.message}`);
    }
    migrateState.done++;
    if(view==='sysmaint') $('#main').innerHTML = maintHTML();
  }
  migrateState.running = false;
  if(view==='sysmaint') $('#main').innerHTML = maintHTML();
}
function stopMigration(){migrateState.running=false}
function migrationSectionHTML(){
  const p = migrateState.total ? Math.round(migrateState.done/migrateState.total*100) : 0;
  return `<h2>照片搬移到雲端儲存空間</h2>
  <p class="sub" style="margin-bottom:10px">舊資料的照片是直接存在資料庫欄位裡（base64），搬到 Storage 可以避免資料庫額度被撐爆。可以隨時中斷，下次繼續跑會自動略過已完成的。</p>
  ${migrateState.total?`<div class="progress"><b style="width:${p}%"></b></div><div class="sub">${migrateState.done} / ${migrateState.total}（${p}%）</div>`:''}
  <div class="actions">
    ${migrateState.running
      ? `<button class="btn btn-ghost" onclick="stopMigration()">暫停</button>`
      : `<button class="btn btn-primary" onclick="runMigration()">開始 / 繼續搬移</button>`}
  </div>
  ${migrateState.log.length?`<div class="tablewrap" style="margin-top:10px;max-height:200px;overflow:auto"><table><tbody>
    ${migrateState.log.slice(-30).reverse().map(l=>`<tr><td style="font-size:12.5px">${esc(l)}</td></tr>`).join('')}
  </tbody></table></div>`:''}`;
}
