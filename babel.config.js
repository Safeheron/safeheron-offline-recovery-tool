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
          // 'auto' lets babel-jest keep dynamic import() intact when Jest
          // runs with --experimental-vm-modules (needed for ESM-only deps
          // such as @mysten/sui v2); it still emits CommonJS otherwise.
          modules: isTest ? 'auto' : false,
        },
      ],
    ],
    plugins: isTest ? ['babel-plugin-transform-import-meta'] : [],
  }
}
