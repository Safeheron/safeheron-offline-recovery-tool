module.exports = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-react', { runtime: 'automatic' }],
    ['@babel/preset-env', { corejs: 3, useBuiltIns: 'usage' }],
  ],
  plugins: [],
}
