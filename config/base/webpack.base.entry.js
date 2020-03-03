const path = require('path')
const fs = require('fs')
const extFs = require('yyl-fs')
const util = require('yyl-util')
const querystring = require('querystring')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const init = (config, iEnv) => {
  const wConfig = {
    entry: (function () {
      const iSrcRoot = path.isAbsolute(config.alias.srcRoot) ?
        config.alias.srcRoot :
        path.join(__dirname, config.alias.srcRoot)

      let r = {}

      // 合并 config 中的 entry 字段
      if (config.entry) {
        r = util.extend(true, r, config.entry)
      }

      // multi entry
      var entryPath = path.join(iSrcRoot, 'entry')

      if (fs.existsSync(entryPath)) {
        var fileList = extFs.readFilesSync(entryPath, /\.(js|tsx?)$/)
        fileList.forEach((str) => {
          var key = path.basename(str).replace(/\.[^.]+$/, '')
          if (key) {
            r[key] = [str]
          }

          const queryObj = {
            name: key
          }

          if (config.localserver && config.localserver.port) {
            queryObj.path = `http://127.0.0.1:${config.localserver.port}/__webpack_hmr`
          }
          
          const iQuery = querystring.stringify(queryObj)
          // hotreload
          if (iEnv.hot && !config.ie8) {
            r[key].unshift(`webpack-hot-middleware/client?${iQuery}`)
          }
        })
      }

      return r
    })(),
    plugins: []
  }
  // + html output
  wConfig.plugins = wConfig.plugins.concat((function () { // html 输出
    const bootPath = util.path.join(config.alias.srcRoot, 'boot')
    const entryPath = util.path.join(config.alias.srcRoot, 'entry')
    let outputPath = []
    const r = []

    if (fs.existsSync(bootPath)) {
      outputPath = outputPath.concat(extFs.readFilesSync(bootPath, /(\.jade|\.pug|\.html)$/))
    }

    if (fs.existsSync(entryPath)) {
      outputPath = outputPath.concat(extFs.readFilesSync(entryPath, /(\.jade|\.pug|\.html)$/))
    }

    const outputMap = {}
    const ignoreExtName = function (iPath) {
      return iPath.replace(/(\.jade|.pug|\.html|\.js|\.css|\.ts|\.tsx|\.jsx)$/, '')
    }

    outputPath.forEach((iPath) => {
      outputMap[ignoreExtName(iPath)] = iPath
    })

    const commonChunks = []
    const pageChunkMap = {}
    Object.keys(wConfig.entry).forEach((key) => {
      let iPaths = []
      if (util.type(wConfig.entry[key]) === 'array') {
        iPaths = wConfig.entry[key]
      } else if (util.type(wConfig.entry[key]) === 'string') {
        iPaths.push(wConfig.entry[key])
      }

      let isPageModule = null
      iPaths.some((iPath) => {
        const baseName = ignoreExtName(iPath)
        if (outputMap[baseName]) {
          isPageModule = baseName
          return true
        }
        return false
      })

      if (!isPageModule) {
        commonChunks.push(key)
      } else {
        pageChunkMap[isPageModule] = key
      }
    })

    outputPath.forEach((iPath) => {
      const iBaseName = ignoreExtName(iPath)
      const iChunkName = pageChunkMap[iBaseName]
      const fileName = ignoreExtName(path.basename(iPath))
      let iChunks = []

      iChunks = iChunks.concat(commonChunks)
      if (iChunkName) {
        iChunks.push(iChunkName)
      }


      if (iChunkName) {
        const opts = {
          mode: iEnv.mode || 'master',
          template: iPath,
          filename: path.relative(
            config.alias.jsDest,
            path.join(config.alias.htmlDest, `${fileName}.html`)
          ),
          chunks: iChunks,
          chunksSortMode(a, b) {
            return iChunks.indexOf(a.names[0]) - iChunks.indexOf(b.names[0])
          },
          inlineSource: '.(js|css|ts|tsx|jsx)\\?__inline$',
          minify: false
        }

        r.push(new HtmlWebpackPlugin(opts))
      }
    })

    return r
  })())
  // - html output
  return wConfig
}

module.exports = init
