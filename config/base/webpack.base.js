'use strict';
const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const querystring = require('querystring');
const extFs = require('yyl-fs');

const util = require('yyl-util');

const BuildAsyncRevWebpackPlugin = require('../../plugins/build-async-rev-webpack-plugin');

const init = (config, iEnv) => {
  const webpackconfig = {
    entry: (function() {
      const iSrcRoot = path.isAbsolute(config.alias.srcRoot) ?
        config.alias.srcRoot :
        path.join(__dirname, config.alias.srcRoot);

      let r = {
        // 'boot': path.join(path.isAbsolute(config.alias.srcRoot)? '': __dirname, config.alias.srcRoot, 'boot/boot.js'),
      };

      // 合并 config 中的 entry 字段
      if (config.entry) {
        r = util.extend(true, r, config.entry);
      }

      // single entry
      var bootPath = path.join(iSrcRoot, 'boot/boot.js');
      if (fs.existsSync(bootPath)) {
        r.boot = bootPath;
      }

      // multi entry
      var entryPath = path.join(iSrcRoot, 'entry');

      if (fs.existsSync(entryPath)) {
        var fileList = extFs.readFilesSync(entryPath, /\.js$/);
        fileList.forEach((str) => {
          var key = path.basename(str).replace(/\.[^.]+$/, '');
          if (key) {
            r[key] = [str];
          }

          const queryObj = {
            name: key
          };

          if (config.localserver && config.localserver.port) {
            queryObj.path = `http://127.0.0.1:${config.localserver.port}/__webpack_hmr`;
          }

          const iQuery = querystring.stringify(queryObj);
          // hotreload
          if (iEnv.hot) {
            r[key].unshift(`webpack-hot-middleware/client?${iQuery}`);
          }
        });
      }

      return r;
    })(),
    output: {
      path: path.resolve(__dirname, config.alias.jsDest),
      filename: '[name].js',
      chunkFilename: `async_component/[name]${config.disableHash? '' : '-[chunkhash:8]'}.js`
    },
    module: {
      rules: [{
        test: /\.js$/,
        exclude: (file) => (
          /node_modules/.test(file) &&
          !/\.vue\.js/.test(file)
        ),
        use: [{
          loader: 'babel-loader',
          query: {
            babelrc: false,
            cacheDirectory: true,
            presets: [
              ['@babel/preset-env', { modules: 'commonjs' }]
            ],
            plugins: [
              // Stage 2
              ['@babel/plugin-proposal-decorators', { 'legacy': true }],
              '@babel/plugin-proposal-function-sent',
              '@babel/plugin-proposal-export-namespace-from',
              '@babel/plugin-proposal-numeric-separator',
              '@babel/plugin-proposal-throw-expressions',
              '@babel/plugin-syntax-dynamic-import'
            ]
          }
        }]
      }, {
        test: /\.html$/,
        use: [{
          loader: 'html-loader'
        }]
      }, {
        test: /\.pug$/,
        oneOf: [{
          resourceQuery: /^\?vue/,
          use: ['pug-plain-loader']
        }, {
          use: ['pug-loader']
        }]
      }, {
        test: /\.jade$/,
        oneOf: [{
          resourceQuery: /^\?vue/,
          use: ['pug-plain-loader']
        }, {
          use: ['pug-loader']
        }]
      }, {
        test: /\.svg$/,
        use: {
          loader: 'svg-inline-loader'
        }
      }, {
        test: /\.webp$/,
        loaders: ['file-loader']
      }, {
        test: /\.ico$/,
        loaders: ['file-loader']
      }, {
        // shiming the module
        test: path.join(config.alias.srcRoot, 'js/lib/'),
        use: {
          loader: 'imports-loader?this=>window'
        }
      }]
    },
    resolveLoader: {
      modules: [
        path.join( __dirname, '../../node_modules'),
        path.join( __dirname, '../../../'),
        path.join(config.alias.dirname, 'node_modules')
      ]
    },
    resolve: {
      modules: [
        path.join( __dirname, '../../node_modules'),
        path.join( __dirname, '../../../'),
        path.join(config.alias.dirname, 'node_modules')
      ],
      alias: util.extend({
        'actions': path.join(config.alias.srcRoot, 'vuex/actions.js'),
        'getters': path.join(config.alias.srcRoot, 'vuex/getters.js'),
        'vue$': 'vue/dist/vue.common.js'
      }, config.alias)
    },
    plugins: [
      new BuildAsyncRevWebpackPlugin(config),
      new webpack.HotModuleReplacementPlugin()
    ]
  };

  // providePlugin
  if (config.providePlugin) {
    webpackconfig.plugins.push(new webpack.ProvidePlugin(config.providePlugin));
  }

  // + html output
  webpackconfig.plugins = webpackconfig.plugins.concat((function() { // html 输出
    const bootPath = util.path.join(config.alias.srcRoot, 'boot');
    const entryPath = util.path.join(config.alias.srcRoot, 'entry');
    let outputPath = [];
    const r = [];

    if (fs.existsSync(bootPath)) {
      outputPath = outputPath.concat(extFs.readFilesSync(bootPath, /(\.jade|\.pug|\.html)$/));
    }

    if (fs.existsSync(entryPath)) {
      outputPath = outputPath.concat(extFs.readFilesSync(entryPath, /(\.jade|\.pug|\.html)$/));
    }

    const outputMap = {};
    const ignoreExtName = function (iPath) {
      return iPath.replace(/(\.jade|.pug|\.html|\.js|\.css)$/, '');
    };

    outputPath.forEach((iPath) => {
      outputMap[ignoreExtName(iPath)] = iPath;
    });

    const commonChunks = [];
    const pageChunkMap = {};
    Object.keys(webpackconfig.entry).forEach((key) => {
      let iPaths = [];
      if (util.type(webpackconfig.entry[key]) === 'array') {
        iPaths = webpackconfig.entry[key];
      } else if (util.type(webpackconfig.entry[key]) === 'string') {
        iPaths.push(webpackconfig.entry[key]);
      }

      let isPageModule = null;
      iPaths.some((iPath) => {
        const baseName = ignoreExtName(iPath);
        if (outputMap[baseName]) {
          isPageModule = baseName;
          return true;
        }
        return false;
      });

      if (!isPageModule) {
        commonChunks.push(key);
      } else {
        pageChunkMap[isPageModule] = key;
      }
    });

    outputPath.forEach((iPath) => {
      const iBaseName = ignoreExtName(iPath);
      const iChunkName = pageChunkMap[iBaseName];
      const fileName = ignoreExtName(path.basename(iPath));
      let iChunks = [];

      iChunks = iChunks.concat(commonChunks);
      if (iChunkName) {
        iChunks.push(iChunkName);
      }


      if (iChunkName) {
        const opts = {
          template: iPath,
          filename: path.relative(config.alias.jsDest, path.join(config.alias.htmlDest, `${fileName}.html`)),
          chunks: iChunks,
          chunksSortMode (a, b) {
            return iChunks.indexOf(a.names[0]) - iChunks.indexOf(b.names[0]);
          },
          inlineSource: '.(js|css)\\?__inline$',
          minify: false
        };

        r.push(new HtmlWebpackPlugin(opts));
      }
    });

    return r;
  })());
  // - html output

  // env defined
  // 环境变量 (全局替换 含有这 变量的 js)
  webpackconfig.plugins.push((() => {
    const r = {};
    Object.keys(iEnv).forEach((key) => {
      if ( typeof iEnv[key] === 'string') {
        r[`process.env.${key}`] = JSON.stringify(iEnv[key]);
      } else {
        r[`process.env.${key}`] = iEnv[key];
      }
    });

    return new webpack.DefinePlugin(r);
  })());

  // config.module 继承
  if (config.moduleRules) {
    webpackconfig.module.rules = webpackconfig.module.rules.concat(config.moduleRules);
  }

  // extend node_modules
  if (config.resolveModule) {
    webpackconfig.resolve.modules.unshift(config.resolveModule);
    webpackconfig.resolveLoader.modules.unshift(config.resolveModule);
  }

  // add seed node_modules 
  if (config.seed) {
    const nodeModulePath = path.join(__dirname, '../', config.seed, 'node_modules');
    if (fs.existsSync(nodeModulePath)) {
      webpackconfig.resolve.modules.unshift(nodeModulePath);
      webpackconfig.resolveLoader.modules.unshift(nodeModulePath);
    }
  }

  return webpackconfig;
};





module.exports = init;


