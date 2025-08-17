const path = require('path')

const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const isDev = process.env.NODE_ENV !== 'production'

module.exports = {
  mode: isDev ? 'development' : 'production',
  entry: ['./src/main.tsx'],
  output: {
    clean: true,
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    pathinfo: true,
  },
  devtool: isDev ? 'eval-source-map' : false,
  target: 'web',
  devServer: {
    port: 5000,
    hot: true,
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'javascript/auto',
        use: [
          {
            loader: 'webassembly-loader',
            options: {
              export: 'buffer',
            },
          },
        ],
      },
      {
        test: /\.(js|ts|tsx)$/,
        exclude: /node_modules\/(?!(@tauri-apps\/))/,
        use: 'babel-loader',
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        type: 'asset',
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json', '.jsx'],
    alias: {
      '@': path.resolve('src'),
      '@img': path.resolve('src/assets/images'),
      buffer: require.resolve('buffer'),
    },
    fallback: {
      // process: require.resolve('process/browser'),
      buffer: require.resolve('buffer/'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      events: require.resolve('events/'),
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      inject: true,
      template: 'index.html',
    }),
    new MiniCssExtractPlugin({
      filename: 'style.css',
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
}
