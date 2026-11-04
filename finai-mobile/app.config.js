module.exports = ({ config }) => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME?.trim();
  const plugins = [...(config.plugins || [])];

  // The no-Firebase plugin needs Google's reversed iOS client ID. Android
  // uses the native package without this iOS-only URL-scheme configuration.
  if (iosUrlScheme) {
    plugins.push([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme },
    ]);
  }

  return { ...config, plugins };
};
