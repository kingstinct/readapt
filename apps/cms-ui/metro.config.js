// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')
const os = require('os')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Remove all console logs in production...
config.transformer.minifierConfig.compress.drop_console = true

config.watchFolders = [
  // `${__dirname}/node_modules`,
  `${__dirname}/../..`,
  // `${__dirname}/../../packages`,
  // `${__dirname}/../../plugins`,
]

// #2 - Try resolving with project modules first, then workspace modules
config.resolver.nodeModulesPaths = [path.resolve('..', '..', 'node_modules')]

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs']
config.resolver.resolverMainFields = ['sbmodern', ...config.resolver.resolverMainFields]
config.resolver.assetExts = [...config.resolver.assetExts, 'ttf', 'otf']
config.resolver.unstable_enableSymlinks = true
config.resolver.disableHierarchicalLookup = true;

// eslint-disable-next-line no-underscore-dangle
// if (process.env.NODE_ENV === 'development') {
//   config.cacheStores = ({ FileStore }) => [
//     new FileStore({
//       root: path.join(os.tmpdir(), 'metro-cache', `${process.env.TAMAGUI_TARGET}-ui`),
//     }),
//   ]
// }

module.exports = config
