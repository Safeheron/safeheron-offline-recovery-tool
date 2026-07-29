module.exports = function (api) {
  const isTest = api.env('test')
  return {
    presets: [
      '@babel/preset-typescript',
      ['@babel/preset-react', { runtime: 'automatic' }],
      [
        '@babel/preset-env',
        {
          corejs: 3,
          useBuiltIns: 'usage',
          modules: isTest ? 'commonjs' : false,
        },
      ],
    ],
    plugins: isTest ? ['babel-plugin-transform-import-meta'] : [],
  }
}
