const jwt = require('jsonwebtoken');
const axios = require('axios');

module.exports = function (app, hexo, use, db) {
    // AI 聊天代理接口 - 解决前端直接调用 AI API 的 CORS 问题
    use('ai/chat', async function (req, res) {
        console.log('[Hexo Pro AI Proxy]: 收到请求');

        const { url, apiKey, model, messages, max_tokens, temperature, top_p, stream } = req.body;

        if (!url || !apiKey || !model) {
            console.error('[Hexo Pro AI Proxy]: 缺少必要参数', { url: !!url, apiKey: !!apiKey, model: !!model });
            return res.done({
                code: 400,
                msg: '缺少必要的 AI 配置参数'
            });
        }

        // 确保 stream 是布尔值
        const isStream = stream === true || stream === 'true';
        console.log('[Hexo Pro AI Proxy]: stream:', isStream, 'url:', url);

        // 构建请求体
        const requestData = {
            model,
            messages,
            max_tokens: max_tokens || 4000,
            temperature: temperature || 0.7,
            top_p: top_p || 0.9,
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
                        topP: 0.9
                    }
                });
            }

            // 返回设置，但隐藏 apiKey
            const safeSettings = { ...settings };
            if (safeSettings.apiKey) {
                safeSettings.apiKey = '****' + safeSettings.apiKey.slice(-4);
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
        const { url, apiKey, model, enableThinking, maxTokens, temperature, topP } = req.body;

        const settingsData = {
            type: 'ai',
            url,
            apiKey,
            model,
            enableThinking: enableThinking || false,
            maxTokens: maxTokens || 4000,
            temperature: temperature || 0.7,
            topP: topP || 0.9,
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
