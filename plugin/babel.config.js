const { getConfig } = require('@airbnb/config-babel');

const config = getConfig({
  library: true,
  react: true,
  next: true,
  esm: process.env.BABEL_OUTPUT === 'esm',
  typescript: true,
  env: {
    targets: { esmodules: true },
  },
});

config.plugins = [
  ['babel-plugin-typescript-to-proptypes', { loose: true }],
  ['@babel/plugin-proposal-class-properties', { loose: true }],
];

module.exports = config;
