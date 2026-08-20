const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const HISTORY_DIR = path.join(ROOT, 'data', 'history');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(HISTORY_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/vendor/katex', express.static(path.join(ROOT, 'node_modules', 'katex', 'dist')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error('只支持图片(png/jpg/webp/gif/bmp)或 PDF 文件'), ok);
  },
});

// ---------- 调用 claude -p ----------

const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000; // 一张整卷可能要跑几分钟

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--allowedTools', 'Read'];
    const child = spawn('claude', args, {
      cwd: ROOT,
      shell: true, // Windows 下解析 claude.cmd
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('调用 Claude 超时(10 分钟),请重试或减少一次上传的题量'));
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 claude CLI: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`claude 退出码 ${code}: ${stderr.slice(0, 2000)}`));
      }
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) {
          return reject(new Error(`Claude 返回错误: ${String(envelope.result).slice(0, 2000)}`));
        }
        resolve(envelope.result || '');
      } catch (e) {
        // 拿不到 JSON 包裹时退回原始文本
        resolve(stdout);
      }
    });

    child.stdin.write(prompt, 'utf8');
    child.stdin.end();
  });
}

// 从模型输出中提取 JSON(容忍 ```json 围栏或前后多余文字)
function extractJson(text) {
  if (!text) throw new Error('模型没有返回内容');
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型输出中找不到 JSON:\n' + text.slice(0, 1000));
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildPrompt({ text, filePaths, subjectHint, gradeHint }) {
  const sources = [];
  if (filePaths.length) {
    sources.push(
      `请先用 Read 工具逐个读取以下试卷/题目文件(图片或 PDF),识别其中的全部题目:\n` +
        filePaths.map((p) => `- ${p}`).join('\n')
    );
  }
  if (text) {
    sources.push(`用户直接粘贴的题目文本如下:\n<题目文本>\n${text}\n</题目文本>`);
  }
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
- 所有数学公式、符号、表达式(包括 question_text、各层解答中的)一律使用 LaTeX 写法,行内公式用 $...$ 包裹,单独成行的公式用 $$...$$ 包裹。例如:$x^2 + 3x - 4 = 0$、$\\overrightarrow{MF_1} \\cdot \\overrightarrow{MF_2}$、$\\frac{x^2}{2} - y^2 = 1$、$\\sqrt{3}$、$\\pm$、$50^\\circ$。不要用 Unicode 上标/下标/根号字符(如 x²、y₀、√3),统一转写成 LaTeX。
- question_text 要忠实于原题,不要自己改编(仅把数学记号规范为 LaTeX)。
- 如果图片模糊或某题无法识别,也要在 questions 中保留该题,question_text 写明"无法清晰识别",其余字段说明原因。
- JSON 字符串里的换行用 \\n,保证整体是合法 JSON。`;
}

// ---------- 路由 ----------

app.post('/api/solve', upload.array('files', 6), async (req, res) => {
  const text = (req.body.text || '').trim();
  const subjectHint = (req.body.subject || '').trim();
  const gradeHint = (req.body.grade || '').trim();
  const files = req.files || [];

  if (!text && files.length === 0) {
    return res.status(400).json({ error: '请上传试卷/题目图片,或粘贴题目文本' });
  }

  const filePaths = files.map((f) => f.path);
  const prompt = buildPrompt({ text, filePaths, subjectHint, gradeHint });

  try {
    const raw = await runClaude(prompt);
    const result = extractJson(raw);

    const record = {
      id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      createdAt: new Date().toISOString(),
      input: {
        text: text || null,
        subject: subjectHint || null,
        grade: gradeHint || null,
        files: files.map((f) => ({
          originalName: f.originalname,
          url: `/uploads/${path.basename(f.path)}`,
        })),
      },
      result,
    };
    fs.writeFileSync(
      path.join(HISTORY_DIR, `${record.id}.json`),
      JSON.stringify(record, null, 2),
      'utf8'
    );

    res.json(record);
  } catch (err) {
    console.error('[solve] 失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', (req, res) => {
  const items = fs
    .readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
        return {
          id: r.id,
          createdAt: r.createdAt,
          summary: r.result?.summary || '',
          subject: r.result?.subject || '',
          questionCount: r.result?.questions?.length || 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(items);
});

app.get('/api/history/:id', (req, res) => {
  const file = path.join(HISTORY_DIR, `${path.basename(req.params.id)}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: '记录不存在' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

const PORT = process.env.PORT || 3299;
app.listen(PORT, () => {
  console.log(`小镇做题家已启动: http://localhost:${PORT}`);
});
