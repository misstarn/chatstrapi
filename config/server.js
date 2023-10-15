module.exports = ({ env }) => ({
  url: env("PUBLIC_URL", "http://localhost:1996"),
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1996),
  app: {
    keys: env.array('APP_KEYS'),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});
