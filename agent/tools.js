'use strict';

const toolDefinitions = [
  {
    name: 'hexo_search_posts',
    description: 'Search Hexo Pro posts and pages by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword or phrase.' }
      },
      required: ['query']
    }
  },
  {
    name: 'hexo_list_posts',
    description: 'List Hexo Pro posts or drafts.',
    inputSchema: {
      type: 'object',
      properties: {
        published: { type: 'boolean', description: 'true for published posts, false for drafts.' },
        page: { type: 'number', description: 'Page number, starting from 1.' },
        pageSize: { type: 'number', description: 'Number of posts per page.' }
      }
    }
  },
  {
    name: 'hexo_get_post',
    description: 'Get one post by its stable documentId or permalink.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'The stable documentId returned by list/search. Prefer this over the public URL.' },
        permalink: { type: 'string', description: 'The Hexo post permalink, for compatibility.' }
      },
      anyOf: [{ required: ['documentId'] }, { required: ['permalink'] }]
    }
  },
  {
    name: 'hexo_create_draft',
    description: 'Create a draft post, optionally with Markdown content, tags, and categories.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Draft title.' },
        content: { type: 'string', description: 'Markdown content to save after creating the draft.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Post tags.' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Post categories.' }
      },
      required: ['title']
    }
  },
  {
    name: 'hexo_update_post',
    description: 'Update an existing post by stable documentId or permalink.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'The stable documentId returned by list/search. Prefer this over the public URL.' },
        permalink: { type: 'string', description: 'The Hexo post permalink, for compatibility.' },
        title: { type: 'string', description: 'New title.' },
        content: { type: 'string', description: 'New Markdown content.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Replacement tag list.' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Replacement category list.' },
        frontMatter: { type: 'object', description: 'Replacement custom front matter fields.' },
        rawUpdate: { type: 'object', description: 'Advanced Hexo Pro update object.' }
      },
      anyOf: [{ required: ['documentId'] }, { required: ['permalink'] }]
    }
  },
  {
    name: 'hexo_publish_post',
    description: 'Move a draft post into published posts by stable documentId or permalink.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'The stable documentId returned by list/search. Prefer this over the public URL.' },
        permalink: { type: 'string', description: 'The Hexo post permalink, for compatibility.' }
      },
      anyOf: [{ required: ['documentId'] }, { required: ['permalink'] }]
    }
  },
  {
    name: 'hexo_unpublish_post',
    description: 'Move a published post back to drafts by stable documentId or permalink.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'The stable documentId returned by list/search. Prefer this over the public URL.' },
        permalink: { type: 'string', description: 'The Hexo post permalink, for compatibility.' }
      },
      anyOf: [{ required: ['documentId'] }, { required: ['permalink'] }]
    }
  },
  {
    name: 'hexo_deploy',
    description: 'Start a Hexo Pro deployment. Use hexo_get_deploy_status to track progress.',
    inputSchema: {
      type: 'object',
      properties: {
        deployTargets: {
          type: 'array',
          items: { enum: ['github', 'cloudflare-pages', 'edgeone-pages'] },
          description: 'Deployment targets.'
        },
        deployType: {
          enum: ['github', 'cloudflare-pages', 'edgeone-pages'],
          description: 'Single deployment target, kept for Hexo Pro compatibility.'
        },
        skipGenerate: { type: 'boolean', description: 'Skip Hexo generation when supported by the deployment config.' },
        config: { type: 'object', description: 'Optional deployment config to save before deploying.' }
      }
    }
  },
  {
    name: 'hexo_get_deploy_status',
    description: 'Get the current Hexo Pro deployment status and logs.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function asToolResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function createToolHandlers(client) {
  return {
    hexo_search_posts: async (input) => asToolResult(await client.searchPosts(input)),
    hexo_list_posts: async (input) => asToolResult(await client.listPosts(input)),
    hexo_get_post: async (input) => asToolResult(await client.getPost(input)),
    hexo_create_draft: async (input) => asToolResult(await client.createDraft(input)),
    hexo_update_post: async (input) => asToolResult(await client.updatePost(input)),
    hexo_publish_post: async (input) => asToolResult(await client.publishPost(input)),
    hexo_unpublish_post: async (input) => asToolResult(await client.unpublishPost(input)),
    hexo_deploy: async (input) => asToolResult(await client.deploy(input)),
    hexo_get_deploy_status: async () => asToolResult(await client.getDeployStatus())
  };
}

module.exports = {
  asToolResult,
  createToolHandlers,
  toolDefinitions
};
