const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const registerPostApi = require('../post_api')

function createResponse() {
    return {
        payload: undefined,
        done(payload) {
            this.payload = payload
        }
    }
}

function createHexo(posts, baseDir) {
    for (const post of posts) {
        const file = path.join(baseDir, 'source', post.source)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, post.raw)
    }
    return {
        base_dir: baseDir,
        source_dir: path.join(baseDir, 'source'),
        model(name) {
            assert.ok(['Post', 'Page'].includes(name))
            return {
                toArray() {
                    return name === 'Post' ? posts : []
                }
            }
        }
    }
}

function registerHandlers(hexo) {
    const handlers = {}
    registerPostApi(null, hexo, (route, handler) => {
        handlers[route] = handler
    })
    return handlers
}

function listPosts(handlers, query) {
    const res = createResponse()
    handlers['posts/list']({ url: `/hexopro/api/posts/list?${query}` }, res)
    return res.payload
}

function searchBlog(handlers, body) {
    const res = createResponse()
    handlers['blog/search']({ body }, res)
    return res.payload.data
}

function makePost(title, source, date) {
    return {
        title,
        raw: `---\ntitle: ${title}\n---\n${title}\n`,
        source,
        date,
        updated: date,
        permalink: `/${title}/`,
        isDiscarded: false
    }
}

test('posts/list published=all returns published and draft posts without discarded posts', t => {
    const posts = [
        makePost('published', '_posts/published.md', '2024-01-01T00:00:00.000Z'),
        makePost('draft', '_drafts/draft.md', '2024-01-02T00:00:00.000Z'),
        makePost('discarded', '_discarded/123/discarded.md', '2024-01-03T00:00:00.000Z')
    ]
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-pro-visibility-'))
    t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }))
    const handlers = registerHandlers(createHexo(posts, baseDir))

    const result = listPosts(handlers, 'published=all')

    assert.deepEqual(result.data.map(post => post.title), ['draft', 'published'])
    assert.equal(result.total, 2)
})

test('posts/list published=false returns drafts without discarded posts', t => {
    const posts = [
        makePost('draft', '_drafts/draft.md', '2024-01-02T00:00:00.000Z'),
        makePost('discarded', '_discarded/123/discarded.md', '2024-01-03T00:00:00.000Z')
    ]
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-pro-visibility-'))
    t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }))
    const handlers = registerHandlers(createHexo(posts, baseDir))

    const result = listPosts(handlers, 'published=false')

    assert.deepEqual(result.data.map(post => post.title), ['draft'])
    assert.equal(result.total, 1)
})

test('blog/search includeDraft=false excludes drafts while default keeps them', t => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-pro-search-'))
    t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }))
    const posts = [
        { ...makePost('Published match', '_posts/published.md', '2024-01-01'), content: 'visible keyword' },
        { ...makePost('Draft match', '_drafts/draft.md', '2024-01-02'), content: 'draft keyword' }
    ]
    const handlers = registerHandlers(createHexo(posts, baseDir))

    const defaultResults = searchBlog(handlers, { searchPattern: 'keyword' })
    const publishedOnlyResults = searchBlog(handlers, { searchPattern: 'keyword', includeDraft: 'false' })

    assert.deepEqual(defaultResults.map(item => item.title).sort(), ['Draft match', 'Published match'])
    assert.deepEqual(publishedOnlyResults.map(item => item.title), ['Published match'])
})
