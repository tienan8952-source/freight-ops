/* ==================== 階段一/二：系統維護（admin 專用） ====================
   照片搬移（migrationSectionHTML 來自 storage.js）＋ 備份／匯出／還原 */
ADMIN_ONLY_KEYS.push('sysmaint');
SYSTEM_GROUP.keys.push('sysmaint');
M.sysmaint = {name:'系統維護', icon:'🛠️', render:()=>maintHTML()};

const BACKUP_TABLES = TABLES.concat(['departments','workflows','tasks','task_events','uploads']);
const LAST_BACKUP_KEY = 'fops.lastBackupAt';

function backupReminderHTML(){
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  const days = last ? Math.floor((Date.now()-Number(last))/86400000) : null;
  if(days===null || days < 7) return '';
  return `<div class="hint bad" style="margin-top:16px">已經 ${days} 天沒有備份了，建議到「系統維護」按一次「立即備份」。</div>`;
}

async function fetchAllForBackup(){
  const out = {};
  for(const t of BACKUP_TABLES){
    try{ out[t] = await api(t,'GET',{query:'?select=*'}) }catch(e){ out[t] = [] }
  }
  return out;
}
async function doBackupJSON(){
  toast('匯出中…');
  try{
    const data = await fetchAllForBackup();
    const blob = new Blob([JSON.stringify({exported_at:new Date().toISOString(), tables:data}, null, 0)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `貨運行營運系統_備份_${today()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    render();
    toast('備份完成');
  }catch(e){ toast('備份失敗：'+e.message,1) }
}
async function doExportExcelZip(){
  if(typeof JSZip==='undefined'){toast('缺少 JSZip 套件，無法匯出',1);return}
  toast('打包中…');
  try{
    const data = await fetchAllForBackup();
    const zip = new JSZip();
    const q = v => `"${String(v==null?'':v).replace(/"/g,'""')}"`;
    for(const t of Object.keys(data)){
      const rows = data[t];
      if(!rows.length){ zip.file(`${t}.csv`, '﻿'); continue }
      const cols = Object.keys(rows[0]).filter(c=>c!=='scans'&&c!=='perms'&&c!=='files'&&c!=='steps');
      const csv = [cols.map(q).join(',')].concat(rows.map(r=>cols.map(c=>q(r[c])).join(','))).join('\r\n');
      zip.file(`${t}.csv`, '﻿'+csv);
    }
    const blob = await zip.generateAsync({type:'blob'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `貨運行營運系統_Excel_${today()}.zip`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('已打包下載');
  }catch(e){ toast('匯出失敗：'+e.message,1) }
}
async function doRestoreJSON(file){
  toast('還原中…');
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    const tables = parsed.tables || {};
    let added=0, skipped=0;
    for(const t of Object.keys(tables)){
      if(!BACKUP_TABLES.includes(t)) continue;
      let existing;
      try{ existing = await api(t,'GET',{query:'?select=id'}) }catch(_){ existing=[] }
      const existingIds = new Set(existing.map(r=>r.id));
      for(const row of tables[t]){
        if(existingIds.has(row.id)){ skipped++; continue }
        try{ await api(t,'POST',{body:row}); added++ }
        catch(_){ skipped++ }
      }
    }
    await loadAll(); await loadDepts();
    render();
    toast(`還原完成：補上 ${added} 筆，略過 ${skipped} 筆已存在的`);
  }catch(e){ toast('還原失敗：'+e.message,1) }
}

function maintHTML(){
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  return `<div class="head"><h1>🛠️ 系統維護</h1><span class="sub">僅管理員可見</span></div>
  ${migrationSectionHTML()}
  <h2 style="margin-top:24px">備份與匯出</h2>
  <p class="sub" style="margin-bottom:10px">${last?`上次備份：${new Date(Number(last)).toLocaleString('zh-TW')}`:'尚未備份過'}</p>
  <div class="actions">
    <button class="btn btn-primary" onclick="doBackupJSON()">立即備份（JSON）</button>
    <button class="btn btn-ghost" onclick="doExportExcelZip()">匯出全部 Excel（zip）</button>
  </div>
  <h2 style="margin-top:24px">還原</h2>
  <p class="sub" style="margin-bottom:10px">上傳備份 JSON，只會補上目前資料庫沒有的 id，不會覆蓋或刪除已存在的資料。</p>
  <input type="file" id="restoreFile" accept="application/json" onchange="if(this.files[0])doRestoreJSON(this.files[0])">
  <div class="toast" id="toast"></div>`;
}
