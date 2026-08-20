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

let pickedFiles = []; // File[]
let timerId = null;

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

  const fd = new FormData();
  pickedFiles.forEach((f) => fd.append('files', f, f.name || 'paste.png'));
  fd.append('text', text);
  fd.append('subject', subjectInput.value.trim());
  fd.append('grade', gradeInput.value.trim());

  solveBtn.disabled = true;
  startLoading();

  try {
    const resp = await fetch('/api/solve', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `请求失败(${resp.status})`);
    hideStatus();
    renderResult(data);
  } catch (err) {
    showStatus('解题失败:' + err.message, true);
  } finally {
    solveBtn.disabled = false;
    stopLoading();
  }
});

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
  try {
    const items = await (await fetch('/api/history')).json();
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
        const record = await (await fetch('/api/history/' + it.id)).json();
        renderResult(record);
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
