module.exports = {
  cache: true,
  entry: './src/main',
  output: {
    filename: './web/sortle-web.js'
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel',
        query: {
          presets: ['react', 'es2015'],
          plugins: [
            'transform-runtime',
            'transform-object-rest-spread',
            'transform-class-properties',
          ],
        },
      },
      {
        test: /\.css$/,
        loader: 'style-loader!css-loader',
      },
    ],
  },
};
