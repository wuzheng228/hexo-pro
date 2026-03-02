const jwt = require('jsonwebtoken');
const axios = require('axios');

const DEFAULT_SYSTEM_PROMPT = `你是一位专业的 Hexo 博客创作助手。你的任务是帮助用户撰写、润色和优化博客文章。

请遵循以下原则：
1. 使用清晰、专业的写作风格
2. 根据用户需求提供结构化的内容建议
3. 支持 Markdown 格式输出
4. 若用户提供上下文（如标题、大纲），请围绕其展开
5. 回复简洁实用，避免冗长开场白`;

module.exports = function (app, hexo, use, db) {
    // AI 聊天代理接口 - 从后端读取配置，解决 CORS 问题
    use('ai/chat', async function (req, res) {
        console.log('[Hexo Pro AI Proxy]: 收到请求');

        const { messages, max_tokens, temperature, top_p, stream } = req.body;
        const { settingsDb } = db;

        if (!messages || !Array.isArray(messages)) {
            return res.done({ code: 400, msg: '缺少 messages 参数' });
        }

        const settings = await new Promise((resolve, reject) => {
            settingsDb.findOne({ type: 'ai' }, (err, doc) => {
                if (err) reject(err);
                else resolve(doc);
            });
        });

        if (!settings || !settings.url || !settings.apiKey || !settings.model) {
            return res.done({
                code: 400,
                msg: '请先在设置中配置 AI（API URL、API Key、模型）'
            });
        }

        const { url, apiKey, model } = settings;
        const systemPrompt = (settings.systemPrompt || '').trim();
        const finalMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;

        const isStream = stream === true || stream === 'true';
        console.log('[Hexo Pro AI Proxy]: stream:', isStream, 'url:', url);

        const requestData = {
            model,
            messages: finalMessages,
            max_tokens: max_tokens || settings.maxTokens || 4000,
            temperature: temperature ?? settings.temperature ?? 0.7,
            top_p: top_p ?? settings.topP ?? 0.9,
            stream: isStream
        };

        try {
            if (isStream) {
                // 流式响应处理
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
                res.flushHeaders(); // 立即刷新 headers

                const response = await axios({
                    method: 'post',
                    url: url,
                    data: requestData,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    responseType: 'stream',
                    maxRedirects: 5,
                    validateStatus: (status) => status < 500
                });

                console.log('[Hexo Pro AI Proxy]: 上游响应状态:', response.status);

                // 使用纯事件驱动，不再 await 整个 Promise
                let streamEnded = false;

                // 直接透明转发上游数据，不做行解析
                // 这样可以正确处理 JSON 中包含 \n 转义字符的情况
                response.data.on('data', (chunk) => {
                    const chunkStr = chunk.toString();
                    console.log('[Hexo Pro AI Proxy]: 转发 chunk, 大小:', chunk.length, '内容:', chunkStr.substring(0, 100));

                    // 直接写入，不做任何解析
                    if (!res.write(chunkStr)) {
                        response.data.pause();
                        res.once('drain', () => {
                            response.data.resume();
                        });
                    }
                });

                response.data.on('end', () => {
                    console.log('[Hexo Pro AI Proxy]: 流式响应结束');
                    // 如果还没有发送结束信号，发送它
                    if (!streamEnded) {
                        // 检查上游是否已经发送了 [DONE]，避免重复发送
                    }
                    res.end();
                });

                response.data.on('error', (err) => {
                    console.error('[Hexo Pro AI Proxy]: 流式响应错误:', err.message);
                    res.end();
                });

                // 处理客户端断开连接
                req.on('close', () => {
                    console.log('[Hexo Pro AI Proxy]: 客户端断开连接');
                    response.data.destroy();
                });

                return;

            } else {
                // 非流式响应
                const response = await axios({
                    method: 'post',
                    url: url,
                    data: requestData,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    maxRedirects: 5,
                    validateStatus: (status) => status < 500
                });

                console.log('[Hexo Pro AI Proxy]: 上游响应状态:', response.status);
                res.done(response.data);
            }

        } catch (error) {
            console.error('[Hexo Pro AI Proxy]: 请求错误:', error.message);
            if (error.response) {
                console.error('[Hexo Pro AI Proxy]: 错误响应:', error.response.status, error.response.data);
            }
            res.done({
                code: error.response?.status || 500,
                msg: 'AI 请求失败: ' + error.message,
                detail: error.response?.data
            });
        }
    });

    // 获取 AI 设置接口
    use('ai/settings', function (req, res) {
        const { settingsDb } = db;

        settingsDb.findOne({ type: 'ai' }, (err, settings) => {
            if (err) {
                return res.done({
                    code: 500,
                    msg: '获取 AI 设置失败'
                });
            }

            if (!settings) {
                return res.done({
                    code: 0,
                    data: {
                        url: '',
                        apiKey: '',
                        model: '',
                        enableThinking: false,
                        maxTokens: 4000,
                        temperature: 0.7,
                        topP: 0.9,
                        systemPrompt: DEFAULT_SYSTEM_PROMPT
                    }
                });
            }

            const safeSettings = { ...settings };
            if (safeSettings.apiKey) {
                safeSettings.apiKey = '****' + safeSettings.apiKey.slice(-4);
            }
            if (safeSettings.systemPrompt == null || safeSettings.systemPrompt === '') {
                safeSettings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
            }

            res.done({
                code: 0,
                data: safeSettings
            });
        });
    });

    // 保存 AI 设置接口
    use('ai/settings/save', function (req, res) {
        const { settingsDb } = db;
        const { url, apiKey, model, enableThinking, maxTokens, temperature, topP, systemPrompt } = req.body;

        const settingsData = {
            type: 'ai',
            url,
            apiKey,
            model,
            enableThinking: enableThinking || false,
            maxTokens: maxTokens || 4000,
            temperature: temperature || 0.7,
            topP: topP || 0.9,
            systemPrompt: systemPrompt != null ? String(systemPrompt) : '',
            updatedAt: new Date()
        };

        settingsDb.findOne({ type: 'ai' }, (err, existing) => {
            if (err) {
                return res.done({
                    code: 500,
                    msg: '保存 AI 设置失败'
                });
            }

            if (existing) {
                // 如果 apiKey 为空或只是掩码，保留原来的
                if (!apiKey || apiKey.startsWith('****')) {
                    settingsData.apiKey = existing.apiKey;
                }

                settingsDb.update({ type: 'ai' }, { $set: settingsData }, {}, (err) => {
                    if (err) {
                        return res.done({
                            code: 500,
                            msg: '更新 AI 设置失败'
                        });
                    }
                    res.done({
                        code: 0,
                        msg: 'AI 设置已保存'
                    });
                });
            } else {
                settingsData.createdAt = new Date();
                settingsDb.insert(settingsData, (err) => {
                    if (err) {
                        return res.done({
                            code: 500,
                            msg: '保存 AI 设置失败'
                        });
                    }
                    res.done({
                        code: 0,
                        msg: 'AI 设置已保存'
                    });
                });
            }
        });
    });
};
