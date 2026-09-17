// 讀 PANSCI_CHANNEL_ID（GitHub Actions Variable）與 NOTION_API_KEY / NOTION_DATABASE_ID
// （GitHub Secrets），讀泛科學院 YouTube RSS，把新影片的逐字稿寫進 Notion 資料庫。
//
// Notion 資料庫欄位要求：除了「標題／類型／日期／內容」，這支腳本另外需要：
//   影片ID（rich_text）：判斷是否已經處理過這支影片，避免重覆寫入
//   網址（url）：方便直接點開影片，非必要但建議加
//
// 抓不到字幕的影片也會寫一筆進 Notion，內容標明「（無字幕）」，不會靜默跳過。
// 不使用 Puppeteer 之類的模擬瀏覽器，只用一般 HTTP 請求讀 RSS／影片頁原始碼／字幕 XML。

const CHANNEL_ID = process.env.PANSCI_CHANNEL_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!CHANNEL_ID) { console.error('缺少 PANSCI_CHANNEL_ID（GitHub Actions Variable）'); process.exit(1); }
if (!NOTION_API_KEY || !NOTION_DATABASE_ID) { console.error('缺少 NOTION_API_KEY 或 NOTION_DATABASE_ID（GitHub Secrets）'); process.exit(1); }

const NOTION_VERSION = '2022-06-28';

function xmlTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

async function fetchFeed() {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  if (!r.ok) throw new Error(`RSS 讀取失敗 ${r.status}`);
  const xml = await r.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries
    .map(e => ({
      videoId: xmlTag(e, 'yt:videoId'),
      title: decodeEntities(xmlTag(e, 'title')),
      published: xmlTag(e, 'published').slice(0, 10)
    }))
    .filter(v => v.videoId);
}

async function fetchTranscript(videoId) {
  const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/"captionTracks":(\[[\s\S]*?\])/);
  if (!m) return null;
  let tracks;
  try { tracks = JSON.parse(m[1]); } catch (_) { return null; }
  if (!tracks.length) return null;
  const pick = tracks.find(t => /^zh/i.test(t.languageCode)) || tracks[0];
  const capUrl = pick.baseUrl.replace(/\\u0026/g, '&');
  const cr = await fetch(capUrl);
  if (!cr.ok) return null;
  const capXml = await cr.text();
  const lines = (capXml.match(/<text[^>]*>([\s\S]*?)<\/text>/g) || [])
    .map(t => decodeEntities(t.replace(/<[^>]+>/g, '')).trim())
    .filter(Boolean);
  return lines.length ? lines.join(' ') : null;
}

function chunkText(text, size = 2000) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

let lastCall = 0;
async function notionFetch(path, opt = {}) {
  const wait = 350 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    ...opt,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  if (r.status === 429) {
    const retryAfter = Number(r.headers.get('retry-after') || '1');
    console.warn(`Notion 429，依 Retry-After 等待 ${retryAfter} 秒後重試`);
    await new Promise(res => setTimeout(res, retryAfter * 1000));
    return notionFetch(path, opt);
  }
  return r;
}

async function loadKnownVideoIds() {
  const known = new Set();
  let cursor;
  do {
    const r = await notionFetch(`/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, start_cursor: cursor })
    });
    if (!r.ok) throw new Error(`查詢 Notion 資料庫失敗 ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    for (const page of j.results || []) {
      const idText = page.properties?.['影片ID']?.rich_text?.[0]?.plain_text;
      if (idText) known.add(idText);
    }
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return known;
}

async function writeNotionPage({ videoId, title, published, content }) {
  const body = {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      '標題': { title: [{ text: { content: title.slice(0, 2000) } }] },
      '類型': { select: { name: '泛科學院逐字稿' } },
      '日期': { date: { start: published || new Date().toISOString().slice(0, 10) } },
      '影片ID': { rich_text: [{ text: { content: videoId } }] },
      '網址': { url: `https://www.youtube.com/watch?v=${videoId}` },
      '內容': { rich_text: chunkText(content).map(c => ({ text: { content: c } })) }
    }
  };
  const r = await notionFetch('/pages', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`寫入 Notion 失敗 ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function main() {
  const feed = await fetchFeed();
  console.log(`RSS 讀到 ${feed.length} 支影片`);
  const known = await loadKnownVideoIds();
  const newOnes = feed.filter(v => !known.has(v.videoId));
  console.log(`其中 ${newOnes.length} 支是新的`);

  let ok = 0, fail = 0;
  for (const v of newOnes) {
    let transcript = null;
    try { transcript = await fetchTranscript(v.videoId); }
    catch (e) { console.warn(`[${v.videoId}] 抓字幕失敗：${e.message}`); }
    try {
      await writeNotionPage({ ...v, content: transcript || '（無字幕）' });
      console.log(`[${v.videoId}] 已寫入 Notion：${v.title}${transcript ? '' : '（無字幕）'}`);
      ok++;
    } catch (e) {
      console.error(`[${v.videoId}] 寫入 Notion 失敗：${e.message}`);
      fail++;
    }
  }
  console.log(`完成：成功 ${ok}、失敗 ${fail}`);
  if (newOnes.length && ok === 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
