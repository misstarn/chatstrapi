module.exports = ({ env }) => ({
    // ...
    'cookie-manager': {
      enabled: true,
      config: {
        localization: true
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