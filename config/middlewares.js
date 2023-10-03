module.exports = [
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  {
    name: 'strapi::session',
    config: {
      rolling: true,
      httpOnly: true,
      renew: true
    },
  },
  'strapi::favicon',
  'strapi::public',
];
