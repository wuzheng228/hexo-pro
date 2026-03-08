const path = require('path')
const fs = require('hexo-fs')
const axios = require('axios')

/**
 * 按行边界分段，避免在行中间截断导致 YAML 损坏
 */
function segmentConfig(yamlContent, chunkSize = 5000) {
  const segments = []
  const lines = yamlContent.split('\n')
  let currentChunk = []
  let currentLength = 0

  for (const line of lines) {
    const lineWithNewline = line + '\n'
    if (currentLength + lineWithNewline.length > chunkSize && currentChunk.length > 0) {
      segments.push(currentChunk.join('\n'))
      currentChunk = []
      currentLength = 0
    }
    currentChunk.push(line)
    currentLength += lineWithNewline.length
  }
  if (currentChunk.length > 0) {
    segments.push(currentChunk.join('\n'))
  }
  return segments
}

/**
 * 构建 AI 提示词 - 输出独立的 schema JSON，不修改 YAML
 */
function buildPrompt(segment, language = 'zh', current, total) {
  const langConfig = {
    zh: {
      instruction: '分析以下 YAML 配置中的**叶子字段**，输出一个 JSON 对象作为 schema 元数据。',
      format: '{"path.to.key": {"type": "input", "label": "字段中文标签", "placeholder": "提示文本"}}',
      types: 'input(文本框), textarea(多行文本), number(数字), switch(开关), color(颜色), select(下拉)',
      rules: `严格规则:
1. 只为有实际值的叶子字段（如 title: xxx, enable: true）生成 schema
2. 绝对不要为以下内容生成 schema:
   - 对象/字典类型的父级 key（如 menu:, site_info: 后面跟着子项的）
   - 数组/列表类型的 key
   - 空值 key（值为空或只有子项）
3. 每个 schema 必须包含 "type" 和 "label"
4. 可选字段: "placeholder"(提示), "description"(描述), "options"(下拉选项)
5. type 只能是: input, textarea, number, switch, color, select
6. label 使用中文，简洁易懂
7. key 必须用完整点号路径：嵌套字段如 mainTone 下的 enable，key 为 "mainTone.enable"（不是 "enable"）
8. 仅返回 JSON 对象，不要包含任何说明文字或 markdown 代码块`,
      example: `正确输出示例（注意嵌套用完整路径）:
{"title": {"type": "input", "label": "网站标题"}, "mainTone.enable": {"type": "switch", "label": "启用主色调"}, "mainTone.mode": {"type": "select", "label": "主色调模式", "options": [{"value": "api", "label": "API"}, {"value": "cdn", "label": "CDN"}]}}`,
    },
    en: {
      instruction: 'Analyze the **leaf fields** in the following YAML config and output a JSON object as schema metadata.',
      format: '{"path.to.key": {"type": "input", "label": "Field Label", "placeholder": "Hint text"}}',
      types: 'input(text), textarea(multiline), number(numeric), switch(toggle), color(color picker), select(dropdown)',
      rules: `Strict Rules:
1. Only generate schema for leaf fields with actual values
2. NEVER generate schema for: parent keys of objects, array keys, empty keys
3. Each schema must have "type" and "label"
4. Optional: "placeholder", "description", "options"
5. type must be: input, textarea, number, switch, color, select
6. key use dot path like "mainTone.enable"
7. Return ONLY the JSON object, no explanations or markdown`,
      example: `Correct output:
{"title": {"type": "input", "label": "Site Title"}, "comments": {"type": "switch", "label": "Enable Comments"}}`,
    },
    fr: {
      instruction: 'Analysez les **champs feuilles** et sortez un objet JSON comme métadonnées de schéma.',
      format: '{"path.to.key": {"type": "input", "label": "Étiquette"}}',
      types: 'input, textarea, number, switch, color, select',
      rules: `Règles: type et label requis. Retournez UNIQUEMENT le JSON.`,
      example: `{"title": {"type": "input", "label": "Titre du site"}}`,
    },
  }

  const config = langConfig[language] || langConfig.zh

  return `You are a YAML schema expert. ${config.instruction}

Segment ${current}/${total}:
\`\`\`yaml
${segment}
\`\`\`

${config.rules}

Format: ${config.format}

Supported types: ${config.types}

${config.example}

CRITICAL: Return ONLY a valid JSON object. No markdown, no code block wrapper, no explanations.`
}

/**
 * 调用 AI 生成 Schema JSON
 */
async function generateSchemaForSegment(segment, aiSettings, language, current, total) {
  if (!aiSettings || !aiSettings.url || !aiSettings.apiKey) {
    throw new Error('AI 配置不完整')
  }

  const prompt = buildPrompt(segment, language, current, total)

  const payload = {
    model: aiSettings.model || 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You output JSON schema for YAML leaf fields. Return ONLY a valid JSON object. Keys are dot paths like "group.key". Each value has type (input/textarea/number/switch/color/select) and label. No markdown.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: aiSettings.temperature || 0.3,
    max_tokens: aiSettings.maxTokens || 4000,
    top_p: aiSettings.topP || 0.9,
  }

  try {
    const response = await axios.post(aiSettings.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiSettings.apiKey}`,
      },
    })

    const data = response.data

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid AI response format')
    }

    return data.choices[0].message.content.trim()
  } catch (error) {
    if (error.response) {
      throw new Error(`AI API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`)
    }
    throw error
  }
}

/**
 * 解析 AI 返回的 JSON
 */
function parseSchemaJson(raw) {
  let cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

/**
 * 合并多个段的 schema JSON
 */
function mergeSegmentResults(results) {
  const merged = {}
  for (const r of results) {
    try {
      const obj = parseSchemaJson(r)
      if (obj && typeof obj === 'object') {
        Object.assign(merged, obj)
      }
    } catch (e) {
      console.warn('[Schema] 解析段结果失败:', e.message)
    }
  }
  return merged
}

/**
 * 统计 Schema 字段数（排除 _meta）
 */
function countSchemaFields(schemaObj) {
  if (typeof schemaObj !== 'object') return 0
  const keys = Object.keys(schemaObj).filter((k) => k !== '_meta')
  return keys.length
}

/**
 * 计算文件哈希
 */
function calculateHash(content) {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

module.exports = {
  segmentConfig,
  generateSchemaForSegment,
  parseSchemaJson,
  mergeSegmentResults,
  countSchemaFields,
  calculateHash,
}
