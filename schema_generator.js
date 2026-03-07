const path = require('path')
const fs = require('hexo-fs')
const axios = require('axios')

/**
 * 分段处理配置文件
 */
function segmentConfig(yamlContent, chunkSize = 5000) {
  const segments = []
  for (let i = 0; i < yamlContent.length; i += chunkSize) {
    segments.push(yamlContent.substring(i, i + chunkSize))
  }
  return segments
}

/**
 * 构建 AI 提示词
 */
function buildPrompt(segment, language = 'zh', current, total) {
  const langConfig = {
    zh: {
      instruction: '为以下YAML配置字段添加JSON schema注释元数据。',
      format: '# schema: {type: "input", label: "字段中文标签", placeholder: "提示文本"}',
      types: 'input(文本框), textarea(多行文本), number(数字), switch(开关), color(颜色), select(下拉), email(邮箱), url(URL)',
      rules: `规则:
1. 为每个非注释行添加一个schema注释行，格式: # schema: {...}
2. 在 schema 注释中必须包含: type, label 两个字段
3. 可选字段: placeholder(提示), description(描述), group(分组), options(下拉选项数组)
4. 根据值的类型推断合适的字段类型
5. label 使用中文，简洁易懂，不超过20字
6. 仅返回修改后的YAML，不要包含其他说明
7. 保留所有原始值完全不变
8. 对象类型字段用 group 字段分组`,
      example: `示例输出:
# schema: {type: "input", label: "网站标题", placeholder: "输入网站标题"}
title: My Hexo Blog

# schema: {type: "select", label: "主题语言", options: [{value: "en", label: "English"}, {value: "zh", label: "简体中文"}]}
language: en`
    },
    en: {
      instruction: 'Add JSON schema comment metadata to the following YAML configuration fields.',
      format: '# schema: {type: "input", label: "Field Label", placeholder: "Hint text"}',
      types: 'input(text), textarea(multiline), number(numeric), switch(toggle), color(color picker), select(dropdown), email(email), url(URL)',
      rules: `Rules:
1. Add one schema comment line for each non-comment line: # schema: {...}
2. Each schema must include: type and label fields
3. Optional fields: placeholder(hint), description, group(grouping), options(dropdown options array)
4. Infer appropriate field type from value
5. Label in English, concise and clear, max 20 chars
6. Return only modified YAML, no explanation
7. Keep all original values unchanged
8. Use group field for object type fields`,
      example: `Example output:
# schema: {type: "input", label: "Site Title", placeholder: "Enter site title"}
title: My Hexo Blog

# schema: {type: "select", label: "Theme Language", options: [{value: "en", label: "English"}, {value: "zh", label: "Chinese"}]}
language: en`
    },
    fr: {
      instruction: 'Ajouter des métadonnées de commentaires de schéma JSON à la configuration YAML suivante.',
      format: '# schema: {type: "input", label: "Étiquette du champ", placeholder: "Texte d\'indice"}',
      types: 'input(texte), textarea(multiligne), number(numérique), switch(bouton), color(couleur), select(déroulant), email(email), url(URL)',
      rules: `Règles:
1. Ajouter une ligne de commentaire schema pour chaque ligne non-commentaire: # schema: {...}
2. Chaque schema doit inclure: type et label
3. Champs optionnels: placeholder(indice), description, group(groupage), options(tableau d\'options)
4. Déduire le type de champ approprié de la valeur
5. Étiquette en français, concis et clair, max 20 caractères
6. Retourner uniquement YAML modifié, pas d\'explication
7. Conserver toutes les valeurs d\'origine inchangées
8. Utiliser le champ group pour les champs de type objet`,
      example: `Exemple de sortie:
# schema: {type: "input", label: "Titre du site", placeholder: "Entrez le titre du site"}
title: My Hexo Blog

# schema: {type: "select", label: "Langue du thème", options: [{value: "en", label: "English"}, {value: "zh", label: "Chinois"}]}
language: en`
    }
  }

  const config = langConfig[language] || langConfig.zh

  return `You are an expert at converting YAML configuration to user-friendly forms with schema metadata.

${config.instruction}

Segment ${current}/${total}:
\`\`\`yaml
${segment}
\`\`\`

Task: Add schema comment for each field. The schema comment must be in valid JSON format.

${config.rules}

${config.example}

Supported field types: ${config.types}

${config.format}

Return ONLY the modified YAML with schema comments, preserving original structure exactly.`
}

/**
 * 调用 AI 生成 Schema
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
        content: 'You are a YAML schema expert. Convert YAML fields to user-friendly form configurations with schema metadata. Return ONLY valid YAML with schema comments.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: aiSettings.temperature || 0.7,
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
 * 清理和验证 Schema 结果
 */
function cleanSchemaResult(result) {
  // 移除可能的代码块标记
  let cleaned = result
    .replace(/^```yaml\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
  return cleaned
}

/**
 * 合并多个段的结果
 */
function mergeSegmentResults(results) {
  return results
    .map(r => cleanSchemaResult(r))
    .join('\n')
    .trim()
}

/**
 * 统计 Schema 字段数
 */
function countSchemaFields(yamlContent) {
  const matches = yamlContent.match(/# schema:/g)
  return matches ? matches.length : 0
}

/**
 * 检查缓存
 */
async function getSchemaFromCache(db, themeId, language) {
  if (!db || !db.themeSchemaCache) {
    return null
  }

  return new Promise((resolve, reject) => {
    db.themeSchemaCache.findOne({ themeId, language }, (err, doc) => {
      if (err) {
        resolve(null)
      } else {
        resolve(doc)
      }
    })
  })
}

/**
 * 保存缓存
 */
async function saveSchemaToCache(db, themeId, language, schema, configHash) {
  if (!db || !db.themeSchemaCache) {
    return
  }

  const cacheEntry = {
    themeId,
    language,
    schema,
    configHash,
    generatedAt: new Date(),
  }

  return new Promise((resolve, reject) => {
    db.themeSchemaCache.update(
      { themeId, language },
      cacheEntry,
      { upsert: true },
      (err) => {
        if (err) {
          console.error('[Schema Cache] 保存失败:', err)
        }
        resolve()
      }
    )
  })
}

/**
 * 计算文件哈希 (简单版本)
 */
function calculateHash(content) {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

module.exports = {
  segmentConfig,
  generateSchemaForSegment,
  cleanSchemaResult,
  mergeSegmentResults,
  countSchemaFields,
  getSchemaFromCache,
  saveSchemaToCache,
  calculateHash,
}
