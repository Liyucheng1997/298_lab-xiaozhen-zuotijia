# 小镇做题家 📖

上传试卷/题目(图片、PDF 或直接粘贴文字),用 LLM 识别题目并给出**四层深度**的解答:

| 深度 | 内容 |
|---|---|
| ① 答案 | 只给最终答案,快速对答案 |
| ② 讲解 | 完整分步解题过程,像老师板书 |
| ③ 知识点 | 知识点、考察点、常见易错点总结 |
| ④ 溯源 | 定位到课本(版本/年级/章节),回去翻书复习 |

LLM 后端走本地 `claude -p`(Claude Code CLI 订阅额度),不需要额外 API Key。

## 使用

```bash
npm install
npm start
```

打开 http://localhost:3299

- 点击/拖拽上传试卷照片或 PDF(最多 6 个文件),也可以直接 **Ctrl+V 粘贴截图**
- 或者把题目文字粘贴进文本框
- 可选填学科、年级提示,提高识别准确度
- 点击「开始解题」,整卷可能需要几分钟
- 右上角「历史记录」可回看以往解题结果

## 工作原理

1. 前端把图片/PDF 上传到 `uploads/`,题目文本一并提交
2. 后端拼装提示词,通过 `claude -p --output-format json --allowedTools Read` 调用 Claude:
   - Claude 用 Read 工具读取图片/PDF,识别全部题目
   - 按固定 JSON 结构一次性返回每道题的四层解答
3. 结果存入 `data/history/`,前端按题目卡片 + 四层手风琴展示

## 目录结构

```
server.js          # Express 后端,调用 claude -p
public/            # 前端(原生 HTML/CSS/JS)
uploads/           # 上传的试卷文件
data/history/      # 解题历史记录(JSON)
```

## 依赖

- Node.js ≥ 18
- Claude Code CLI(`claude` 命令可用且已登录)
