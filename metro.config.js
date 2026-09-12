const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required so Metro can bundle drizzle-kit's generated migrations.js, which
// imports the raw .sql migration files directly (paired with the
// babel-plugin-inline-import plugin in babel.config.js).
config.resolver.sourceExts.push('sql');

module.exports = config;
