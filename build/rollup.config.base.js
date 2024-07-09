// @ts-nocheck
const pkg = require('../package.json')
const eslint = require('@rollup/plugin-eslint')
const { babel } = require('@rollup/plugin-babel')
const commonjs = require('@rollup/plugin-commonjs')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const typescript = require('rollup-plugin-typescript2')
const peerDepsExternal = require('rollup-plugin-peer-deps-external')
const entry = './src/index.ts'

const babelConfig = {
    babelHelpers: 'bundled',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    exclude: [
        '**/node_modules/**'
    ]
}

const basePlugins = [
    peerDepsExternal({
        includeDependencies: true
    }), //自动将package.json的peerDependencies作为external
    nodeResolve({
        main: true,
        preferBuiltins: true
    }), //解析node_modules中导入的模块
    eslint(),
    typescript(),
    commonjs({
        browser: true
    }),
    babel(babelConfig)
]

const baseOutput = [
    {
        file: pkg.main,
        format: 'esm',
    }, //前端使用时需要cjs转译
]

const baseConfig = {
    input: entry,
    output: [], // 输出
    plugins: [],
    externals: [],
    globals: {}
}

module.exports = {
    basePlugins,
    baseOutput,
    baseConfig,
}