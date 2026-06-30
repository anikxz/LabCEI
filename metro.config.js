const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure Metro can resolve ESM/mjs files
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'mjs'];

// Force Metro to use project-local resolution only
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Prevent cross-project module resolution
config.resolver.disableHierarchicalLookup = true;

// Clear Metro transform cache on each build
config.resetCache = true;

// Exclude build output dirs from file watching (prevents watcher crash on Windows)
config.watchFolders = [];
config.resolver.blockList = [
  /dist\/.*/,
  /\.git\/.*/,
];

// Ensure proper module resolution
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
