// 实现这个项目的构建任务
const { src, dest, series, parallel, watch } = require('gulp')
const loadPlugins = require('gulp-load-plugins')
const browserSync = require('browser-sync')
const minimist = require('minimist')
const del = require('del')
const Comb = require('csscomb')
const standard = require('standard')
const path = require('path')

const plugins = loadPlugins()
const bs = browserSync.create()

const argv = minimist(process.argv.slice(2))

const cwd = process.cwd()

let config = {
    // default config
    build: {
        src: 'src',
        dist: 'dist',
        temp: 'temp',
        public: 'public',
        paths: {
            styles: 'assets/styles/*.scss',
            scripts: 'assets/scripts/*.js',
            pages: '*.html',
            images: 'assets/images/**',
            fonts: 'assets/fonts/**'
        }
    }
}

try {
    const loadConfig = require(path.join(cwd, 'pages.config.js'))
    config = Object.assign({}, config, loadConfig)
} catch (e) {}

// 清除文件命令
const clean = () => {
    return del([config.build.temp, config.build.dist])
}

// css 和 js 代码检查
const lint = done => {
    const comb = new Comb(require('./.csscomb.json'))
    comb.processPath(config.build.src)
    standard.lintFiles(config.build.paths.scripts, { cwd: config.build.src, fix: true }, done)
}

// 代码编译
const style = () => {
    return src(config.build.paths.styles, { cwd: config.build.src, base: config.build.src })
        .pipe(plugins.sass())
        .pipe(dest(config.build.temp))
        .pipe(bs.reload({ stream: true }))
}
const script = () => {
    return src(config.build.paths.scripts, { cwd: config.build.src, base: config.build.src })
        .pipe(plugins.babel({ presets: [require('@babel/preset-env')] }))
        .pipe(dest(config.build.temp))
        .pipe(bs.reload({ stream: true }))
}
const page = () => {
    return src(config.build.paths.pages, { cwd: config.build.src, base: config.build.src })
        .pipe(plugins.swig({data: config.data, defaults: { cache: false }}))
        .pipe(dest(config.build.temp))
        .pipe(bs.reload({ stream: true }))
}

// 图片和文字压缩
const image = () => {
    return src(config.build.paths.images, { cwd: config.build.src, base: config.build.src })
        .pipe(plugins.imagemin())
        .pipe(dest(config.build.dist))
}
const font = () => {
    return src(config.build.paths.fonts, { cwd: config.build.src, base: config.build.src })
        .pipe(plugins.imagemin())
        .pipe(dest(config.build.dist))
}

// 其他文件拷贝
const extra = () => {
    return src('**', { cwd: config.build.public, base: config.build.public })
        .pipe(dest(config.build.dist))
}

// 将html的引用文件合并压缩
const useref = () => {
    return src(config.build.paths.pages, { cwd: config.build.temp, base: config.build.temp })
        .pipe(plugins.useref({ searchPath: [config.build.temp, '.'] }))
        .pipe(plugins.if(/\.js$/, plugins.uglify()))
        .pipe(plugins.if(/\.css$/, plugins.cleanCss()))
        .pipe(plugins.if(/\.html$/, plugins.htmlmin({
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true
        })))
        .pipe(dest(config.build.dist))
}

// 打开服务器跑开发环境代码
const devServer = () => {

    watch(config.build.paths.styles, { cwd: config.build.src }, style)
    watch(config.build.paths.scripts, { cwd: config.build.src }, script)
    watch(config.build.paths.pages, { cwd: config.build.src }, page)

    watch([
        config.build.paths.images,
        config.build.paths.fonts,
    ], { cwd: config.build.src }, bs.reload)

    watch('**', { cwd: config.build.public }, bs.reload)

    bs.init({
        notify: false,
        port: 3002,
        server: {
            baseDir: [config.build.temp, config.build.src, config.build.public],
            routes: {
                '/node_modules': 'node_modules'
            }
        }
    })
}

// 打开服务器跑生产环境代码
const distServer = () => {
    bs.init({
        notify: false,
        port: 3003,
        server: config.build.dist
    })
}

// 将编译后的静态项目部署到 github 的 gh-pages 分支预览
const upload = () => {
    return src('**', { cwd: config.build.dist })
        .pipe(plugins.ghPages({
            cacheDir: path.join(config.build.temp, 'publish'),
            branch: 'gh-pages'
        }))
}

// 添加修改的文件
const gitAdd = () => {
    return src('.')
        .pipe(plugins.git.add())
}

// 更新本地仓库
const gitCommit = () => {
    const message = argv.message || 'update'

    return src('.')
        .pipe(
            plugins.git.commit(undefined, {
                args: `-m "${message}"`,
                disableMessageRequirement: true
            })
        )
}

// 推送到远程仓库
const gitPush = done => {
    plugins.git.push('origin', 'master', (err) => {
        if (err) throw err
    })

    done()
}

// 编译组合任务
const compile = parallel(style, script, page)

// 打包生成线上项目
const build = series(clean, parallel(series(compile, useref), image, font, extra))

// 测试生产环境代码是否正常运行
const start = series(build, distServer)

// 打开服务器监听开发代码，实时编译
const serve = series(compile, devServer)

// 将编译后的静态项目部署到 github 的 gh-pages 分支下
const deploy = series(build, upload)

const update = series(gitAdd, gitCommit, gitPush)

module.exports = {
    lint,
    serve,
    build,
    start,
    clean,
    deploy,
    update
}