// ---------- 元素 ----------
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const textInput = document.getElementById('textInput');
const subjectInput = document.getElementById('subjectInput');
const gradeInput = document.getElementById('gradeInput');
const solveBtn = document.getElementById('solveBtn');
const statusEl = document.getElementById('status');
const emptyState = document.getElementById('emptyState');
const resultsEl = document.getElementById('results');
const historyBtn = document.getElementById('historyBtn');
const historyDrawer = document.getElementById('historyDrawer');
const historyList = document.getElementById('historyList');
const closeHistory = document.getElementById('closeHistory');
const drawerMask = document.getElementById('drawerMask');
const backendBadge = document.getElementById('backendBadge');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMask = document.getElementById('settingsMask');
const settingsBackendInfo = document.getElementById('settingsBackendInfo');
const setApiKey = document.getElementById('setApiKey');
const setBaseUrl = document.getElementById('setBaseUrl');
const setModel = document.getElementById('setModel');
const settingsSave = document.getElementById('settingsSave');
const settingsCancel = document.getElementById('settingsCancel');
const setUseLocal = document.getElementById('setUseLocal');

let pickedFiles = []; // File[]
let timerId = null;

// ---------- 设置(直连 API 模式用,只存本机浏览器) ----------
const SETTINGS_KEY = 'zuotijia-settings-v2';
const DEFAULT_SETTINGS = { apiKey: 'unused', baseUrl: 'http://127.0.0.1:8787', model: 'haiku' };
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
let settings = loadSettings();

settingsBtn.addEventListener('click', () => {
  setApiKey.value = settings.apiKey;
  setBaseUrl.value = settings.baseUrl;
  setModel.value = settings.model;
  setUseLocal.checked = localStorage.getItem(LOCAL_FLAG) === '1';
  settingsBackendInfo.textContent = backend.mode === 'server'
    ? '当前走项目自带的 claude CLI 后端；以下反代配置在该后端不可用时生效。'
    : '识题将由浏览器直接调用下面的本机 claude -p 反代或 Anthropic 兼容接口。';
  settingsMask.classList.remove('hidden');
});
settingsCancel.addEventListener('click', () => settingsMask.classList.add('hidden'));
settingsMask.addEventListener('click', (e) => { if (e.target === settingsMask) settingsMask.classList.add('hidden'); });
settingsSave.addEventListener('click', async () => {
  settings = {
    apiKey: setApiKey.value.trim(),
    baseUrl: setBaseUrl.value.trim() || DEFAULT_SETTINGS.baseUrl,
    model: setModel.value.trim() || DEFAULT_SETTINGS.model,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (setUseLocal.checked) localStorage.setItem(LOCAL_FLAG, '1');
  else localStorage.removeItem(LOCAL_FLAG);
  settingsMask.classList.add('hidden');
  // 重新探测(勾选本机服务时给 15 秒,留时间响应浏览器的本地网络权限询问)
  backendReady = detectBackend(setUseLocal.checked ? 15000 : 5000);
  updateBadge();
  await backendReady;
});

// ---------- 后端探测 ----------
// 优先级:① 同源服务器带 claude CLI(本地 npm start) ② 访问者本机 localhost:3299 的服务(需在设置中开启,
// 因为 Chrome 会为"公网页面访问本机"弹权限询问,不能对每个访客都探测) ③ 浏览器直连 Anthropic API
const LOCAL_PORT = 3299;
const LOCAL_FLAG = 'zuotijia-use-local';
let backend = { mode: 'detecting', base: '' }; // mode: 'server' | 'direct' | 'detecting'
let backendReady = Promise.resolve();

function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function probeHealth(base, ms) {
  try {
    const h = await (await fetchTimeout(base + '/api/health', ms || 2500)).json();
    return h && h.ok && h.llm === 'cli';
  } catch { return false; }
}

const onLocalPage = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

async function detectBackend(localProbeMs) {
  if (await probeHealth('')) { backend = { mode: 'server', base: '' }; }
  else if (!onLocalPage && localStorage.getItem(LOCAL_FLAG) === '1' &&
           await probeHealth(`http://localhost:${LOCAL_PORT}`, localProbeMs || 5000)) {
    backend = { mode: 'server', base: `http://localhost:${LOCAL_PORT}` };
  } else {
    backend = { mode: 'direct', base: '' };
  }
  updateBadge();
}
backendReady = detectBackend();

function updateBadge() {
  if (backend.mode === 'server') {
    backendBadge.textContent = backend.base ? '本机 Claude ✓' : '本地 Claude ✓';
    backendBadge.className = 'backend-badge ok';
  } else if (backend.mode === 'direct') {
    const localProxy = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(settings.baseUrl);
    backendBadge.textContent = settings.apiKey ? (localProxy ? 'Claude 反代 ✓' : 'API 直连 ✓') : '未配置 API Key';
    backendBadge.className = 'backend-badge ' + (settings.apiKey ? 'ok' : 'warn');
  } else {
    backendBadge.textContent = '检测后端中…';
    backendBadge.className = 'backend-badge';
  }
}
updateBadge();

// ---------- 文件选择 ----------
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

// 支持直接 Ctrl+V 粘贴截图
document.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])];
  const imgs = items.filter((i) => i.type.startsWith('image/'));
  if (imgs.length) {
    addFiles(imgs.map((i) => i.getAsFile()).filter(Boolean));
  }
});

function addFiles(list) {
  for (const f of list) {
    if (pickedFiles.length >= 6) break;
    if (!/\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(f.name) && !f.type.startsWith('image/')) continue;
    pickedFiles.push(f);
  }
  renderFileList();
}

function renderFileList() {
  fileListEl.innerHTML = '';
  pickedFiles.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    const isImg = f.type.startsWith('image/');
    const thumb = isImg ? `<img class="thumb" src="${URL.createObjectURL(f)}" />` : '<span style="font-size:22px">📄</span>';
    item.innerHTML = `${thumb}<span class="name">${escapeHtml(f.name || '截图.png')}</span>
      <button class="remove" title="移除">✕</button>`;
    item.querySelector('.remove').onclick = () => {
      pickedFiles.splice(idx, 1);
      renderFileList();
    };
    fileListEl.appendChild(item);
  });
}

// ---------- 解题 ----------
solveBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  if (!text && pickedFiles.length === 0) {
    showStatus('请先上传图片/PDF,或粘贴题目文本', true);
    return;
  }

  await backendReady;
  if (backend.mode === 'direct' && !settings.apiKey) {
    showStatus('请先点右上角「⚙️ 设置」填写反代/API Key，未启用鉴权的本机反代可填 unused', true);
    settingsBtn.click();
    return;
  }

  solveBtn.disabled = true;
  startLoading();

  try {
    let record;
    if (backend.mode === 'server') {
      const fd = new FormData();
      pickedFiles.forEach((f) => fd.append('files', f, f.name || 'paste.png'));
      fd.append('text', text);
      fd.append('subject', subjectInput.value.trim());
      fd.append('grade', gradeInput.value.trim());
      const resp = await fetch(backend.base + '/api/solve', { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `请求失败(${resp.status})`);
      record = data;
    } else {
      record = await solveDirect({
        text,
        subjectHint: subjectInput.value.trim(),
        gradeHint: gradeInput.value.trim(),
      });
      localHistorySave(record);
    }
    hideStatus();
    renderResult(record);
  } catch (err) {
    showStatus('解题失败:' + err.message, true);
  } finally {
    solveBtn.disabled = false;
    stopLoading();
  }
});

// ---------- 直连 Anthropic API 解题(文件在浏览器里转 base64 一并发给模型) ----------

const API_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('读取文件失败:' + file.name));
    reader.readAsDataURL(file);
  });
}

// API 不支持的图片格式(如 bmp)先经 canvas 转成 PNG
function imageToPngBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法解码图片:' + file.name)); };
    img.src = url;
  });
}

function buildDirectPrompt({ text, fileCount, subjectHint, gradeHint }) {
  const sources = [];
  if (fileCount) sources.push(`请仔细识别本消息附带的 ${fileCount} 个试卷/题目文件(图片或 PDF)中的全部题目。`);
  if (text) sources.push(`用户直接粘贴的题目文本如下:\n<题目文本>\n${text}\n</题目文本>`);
  const hints = [];
  if (subjectHint) hints.push(`学科:${subjectHint}`);
  if (gradeHint) hints.push(`学段/年级:${gradeHint}`);

  return `你是一位经验丰富的中小学全科名师,精通中国大陆各学科教材(人教版、北师大版、苏教版、部编版等)。

${sources.join('\n\n')}
${hints.length ? '\n用户提供的提示:' + hints.join(';') + '\n' : ''}
任务:识别出材料中的每一道题目(如果是整张试卷,按题号逐题处理;小问较多时可将同一大题的小问合并为一道处理,但答案要覆盖每个小问),然后为每道题生成四层深度的解答:

- layer1_answer:只给最终答案,尽量简短(选择题给选项,填空题给结果,解答题给最终结论/数值)。
- layer2_explanation:完整的解题过程和讲解,像老师板书一样分步骤,讲清每一步为什么这么做。
- layer3_knowledge:总结本题的知识点和考察点。包括:涉及的知识点列表、考察的能力/题型套路、常见易错点。
- layer4_textbook:溯源到课本。指出该知识点通常出自哪个教材版本、哪个年级、哪一册、哪一章节(如不确定版本,按最常用的人教版/部编版给出,并注明"以人教版为例"),概述课本中对应的定义/定理/例题内容,方便学生回去翻书复习。

严格只输出一个 JSON 对象,不要输出任何其他文字,格式如下:
{
  "subject": "识别出的学科,如:数学",
  "grade_guess": "推测的学段年级,如:初中二年级(不确定就写空字符串)",
  "summary": "一句话概括这份材料,如:一张初二数学期中试卷,共 5 道题",
  "questions": [
    {
      "number": "题号,如 1 或 三(2)",
      "question_text": "识别出的题目原文(含选项;图形题用文字描述图形)",
      "layer1_answer": "...",
      "layer2_explanation": "...",
      "layer3_knowledge": {
        "knowledge_points": ["知识点1", "知识点2"],
        "exam_focus": "考察点/能力说明",
        "common_mistakes": "常见易错点"
      },
      "layer4_textbook": "教材溯源说明"
    }
  ]
}

注意:
- 所有数学公式、符号、表达式(包括 question_text、各层解答中的)一律使用 LaTeX 写法,行内公式用 $...$ 包裹,单独成行的公式用 $$...$$ 包裹。例如:$x^2 + 3x - 4 = 0$、$\\frac{x^2}{2} - y^2 = 1$、$\\sqrt{3}$、$50^\\circ$。不要用 Unicode 上标/下标/根号字符(如 x²、y₀、√3),统一转写成 LaTeX。
- question_text 要忠实于原题,不要自己改编(仅把数学记号规范为 LaTeX)。
- 如果图片模糊或某题无法识别,也要在 questions 中保留该题,question_text 写明"无法清晰识别",其余字段说明原因。
- JSON 字符串里的换行用 \\n,内部双引号用反斜杠转义,保证整体是合法 JSON。`;
}

function extractJsonClient(text) {
  if (!text) throw new Error('模型没有返回内容');
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('模型输出中找不到 JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

async function solveDirect({ text, subjectHint, gradeHint }) {
  const content = [];
  for (const f of pickedFiles) {
    const isPdf = /\.pdf$/i.test(f.name || '') || f.type === 'application/pdf';
    if (isPdf) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fileToBase64(f) } });
    } else if (API_MEDIA_TYPES.includes(f.type)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: await fileToBase64(f) } });
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: await imageToPngBase64(f) } });
    }
  }
  content.push({ type: 'text', text: buildDirectPrompt({ text, fileCount: pickedFiles.length, subjectHint, gradeHint }) });

  const resp = await fetch(settings.baseUrl.replace(/\/+$/, '') + '/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model || 'claude-sonnet-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`API 请求失败(${resp.status}):${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const result = extractJsonClient(raw);

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    input: {
      text: text || null,
      subject: subjectHint || null,
      grade: gradeHint || null,
      files: pickedFiles.map((f) => ({ originalName: f.name || '截图.png' })),
    },
    result,
  };
}

// ---------- 本地历史(直连模式存 localStorage,只在本浏览器可见) ----------
const HISTORY_KEY = 'zuotijia-history';

function localHistoryAll() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function localHistorySave(record) {
  const all = localHistoryAll();
  all.unshift(record);
  while (all.length > 30) all.pop(); // 记录可能很大,只保留最近 30 条
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(all)); }
  catch { /* 超出 localStorage 配额就放弃保存,不影响本次展示 */ }
}

function startLoading() {
  let sec = 0;
  showStatus('<span class="spinner"></span>Claude 正在识题解答……已用时 0 秒(整卷可能需要几分钟)');
  timerId = setInterval(() => {
    sec += 1;
    showStatus(`<span class="spinner"></span>Claude 正在识题解答……已用时 ${sec} 秒(整卷可能需要几分钟)`);
  }, 1000);
}
function stopLoading() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}
function showStatus(html, isError = false) {
  statusEl.classList.remove('hidden');
  statusEl.classList.toggle('error', isError);
  statusEl.innerHTML = html;
}
function hideStatus() {
  statusEl.classList.add('hidden');
}

// ---------- 渲染结果 ----------
function renderResult(record) {
  const r = record.result || {};
  emptyState.classList.add('hidden');
  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'result-head';
  head.innerHTML = `
    <div>
      ${r.subject ? `<span class="badge">${escapeHtml(r.subject)}</span>` : ''}
      ${r.grade_guess ? `<span class="badge">${escapeHtml(r.grade_guess)}</span>` : ''}
      <span class="badge">${(r.questions || []).length} 道题</span>
    </div>
    <div class="meta">${escapeHtml(r.summary || '')} · ${new Date(record.createdAt).toLocaleString('zh-CN')}</div>
  `;
  resultsEl.appendChild(head);

  (r.questions || []).forEach((q, i) => {
    resultsEl.appendChild(renderQuestion(q, i));
  });

  renderMath(resultsEl);
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQuestion(q, index) {
  const card = document.createElement('div');
  card.className = 'q-card';

  const head = document.createElement('div');
  head.className = 'q-head';
  head.innerHTML = `
    <span class="q-num">第 ${escapeHtml(String(q.number || index + 1))} 题</span>
    <div class="q-text">${escapeHtml(q.question_text || '')}</div>
  `;
  card.appendChild(head);

  const kp = q.layer3_knowledge || {};
  const kpHtml = `
    ${(kp.knowledge_points || []).length ? `<span class="kp-label">📌 知识点</span>
      <div class="kp-tags">${(kp.knowledge_points || []).map((k) => `<span class="kp-tag">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
    ${kp.exam_focus ? `<span class="kp-label">🎯 考察点</span>${escapeHtml(kp.exam_focus)}` : ''}
    ${kp.common_mistakes ? `<span class="kp-label">⚠️ 易错点</span>${escapeHtml(kp.common_mistakes)}` : ''}
  `;

  const layers = [
    { cls: 'd1', chip: '深度①', title: '答案', body: `<div class="answer-highlight">${richText(q.layer1_answer || '')}</div>`, open: true },
    { cls: 'd2', chip: '深度②', title: '讲解', body: richText(q.layer2_explanation || ''), open: false },
    { cls: 'd3', chip: '深度③', title: '知识点与考察点', body: kpHtml, open: false },
    { cls: 'd4', chip: '深度④', title: '课本溯源', body: richText(q.layer4_textbook || ''), open: false },
  ];

  layers.forEach((l) => {
    const layer = document.createElement('div');
    layer.className = 'layer' + (l.open ? ' open' : '');
    layer.innerHTML = `
      <button class="layer-head">
        <span class="chip ${l.cls}">${l.chip}</span>
        <span>${l.title}</span>
        <span class="arrow">▶</span>
      </button>
      <div class="layer-body">${l.body}</div>
    `;
    layer.querySelector('.layer-head').onclick = () => layer.classList.toggle('open');
    card.appendChild(layer);
  });

  return card;
}

// ---------- 历史记录 ----------
historyBtn.addEventListener('click', async () => {
  historyDrawer.classList.remove('hidden');
  drawerMask.classList.remove('hidden');
  historyList.innerHTML = '<div class="history-empty">加载中……</div>';
  await backendReady;
  try {
    let items, getRecord;
    if (backend.mode === 'server') {
      items = await (await fetch(backend.base + '/api/history')).json();
      getRecord = async (id) => (await fetch(backend.base + '/api/history/' + id)).json();
    } else {
      const all = localHistoryAll();
      items = all.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        summary: r.result?.summary || '',
        subject: r.result?.subject || '',
        questionCount: r.result?.questions?.length || 0,
      }));
      getRecord = async (id) => all.find((r) => r.id === id);
    }
    if (!items.length) {
      historyList.innerHTML = '<div class="history-empty">还没有历史记录</div>';
      return;
    }
    historyList.innerHTML = '';
    items.forEach((it) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="h-summary">${escapeHtml(it.summary || '(无摘要)')}</div>
        <div class="h-meta">${escapeHtml(it.subject || '')} · ${it.questionCount} 题 · ${new Date(it.createdAt).toLocaleString('zh-CN')}</div>
      `;
      div.onclick = async () => {
        const record = await getRecord(it.id);
        if (record) renderResult(record);
        closeDrawer();
      };
      historyList.appendChild(div);
    });
  } catch (err) {
    historyList.innerHTML = `<div class="history-empty">加载失败:${escapeHtml(err.message)}</div>`;
  }
});

function closeDrawer() {
  historyDrawer.classList.add('hidden');
  drawerMask.classList.add('hidden');
}
closeHistory.addEventListener('click', closeDrawer);
drawerMask.addEventListener('click', closeDrawer);

// ---------- 工具 ----------
// 用 KaTeX 渲染 $...$ / $$...$$ 公式(escapeHtml 之后文本节点里的分隔符仍可被识别)
function renderMath(el) {
  if (typeof renderMathInElement !== 'function') return;
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  } catch (e) {
    console.warn('KaTeX 渲染失败:', e);
  }
}

// 转义 HTML 后,把模型偶尔输出的 **加粗** 转成真正的粗体
function richText(s) {
  return escapeHtml(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
