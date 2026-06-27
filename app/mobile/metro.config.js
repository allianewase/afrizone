// Default Expo Metro config. Kept explicit so SVG transforms / aliases can be added later.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
