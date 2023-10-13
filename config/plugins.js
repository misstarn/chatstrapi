module.exports = ({ env }) => ({
    // ...
    'cookie-manager': {
      enabled: true,
      config: {
        localization: true
      }
    },
    seo: {
      enabled: true,
    },
    meilisearch: {
      config: {
        // Your meili host
        host: "http://localhost:7700",
        // Your master key or private key
        apiKey: "masterKey",
      }
    },
    // 发布定时
    publisher: {
      enabled: true,
      config: {
        hooks: {
          beforePublish: async ({ strapi, uid, entity }) => {
            console.log('beforePublish');
          },
          afterPublish: async ({ strapi, uid, entity }) => {
            console.log('afterPublish');
          },
          beforeUnpublish: async ({ strapi, uid, entity }) => {
            console.log('beforeUnpublish');
          },
          afterUnpublish: async ({ strapi, uid, entity }) => {
            console.log('afterUnpublish');
          },
        },
      },
    },
    // 评论管理
    comments: {
      enabled: true,
      config: {
        badWords: false,
        moderatorRoles: ["Authenticated"],
        approvalFlow: ["api::page.page"],
        entryLabel: {
          "*": ["Title", "title", "Name", "name", "Subject", "subject"],
          "api::page.page": ["MyField"],
        },
        blockedAuthorProps: ["name", "email"],
        reportReasons: {
          MY_CUSTOM_REASON: "MY_CUSTOM_REASON",
        },
        gql: {
          // ...
        },
      },
    },
    // 导航
    navigation: {
      enabled: true,
      config: {
          additionalFields: ['audience', { name: 'my_custom_field', type: 'boolean', label: 'My custom field' }],
          contentTypes: ['api::page.page'],
          contentTypesNameFields: {
              'api::page.page': ['title']
          },
          pathDefaultFields: {
              'api::page.page': ['slug']
          },
          allowedLevels: 2,
          gql: {},
      }
  },
  // 哨兵
  sentry: {
    enabled: true,
    config: {
      dsn: env('SENTRY_DSN'),
      sendMetadata: true,
    },
  },
    // ...
  });