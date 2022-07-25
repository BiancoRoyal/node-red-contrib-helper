
'use strict'

const { series, src, dest } = require('gulp')
const htmlmin = require('gulp-htmlmin')
const jsdoc = require('gulp-jsdoc3')
const clean = require('gulp-clean')
const uglify = require('gulp-uglify')
const babel = require('gulp-babel')
const sourcemaps = require('gulp-sourcemaps')
const pump = require('pump')
const replace = require('gulp-replace')
const changelog = require('gulp-conventional-changelog')

function releaseIcons () {
  return src('src/icons/**/*').pipe(dest('helper/icons'))
}

function docIcons () {
  return src('src/icons/**/*').pipe(dest('docs/gen/icons'))
}

function docImages () {
  return src('images/**/*').pipe(dest('docs/gen/images'))
}

function releaseLocal () {
  return src('src/locales/**/*').pipe(dest('helper/locales'))
}

function releasePublicData () {
  return src('src/public/**/*').pipe(dest('helper/public'))
}

function releaseViewData () {
  return src('view/**/*').pipe(dest('helper/lib/view'))
}

function cleanProject () {
  return src(['helper', 'docs/gen', 'jcoverage'], { allowEmpty: true })
    .pipe(clean({ force: true }))
}

function changeLogProject () {
  return src('CHANGELOG.md')
    .pipe(changelog({
      // conventional-changelog options go here
      preset: 'angular',
      releaseCount: 0
    }, {
      // context goes here
    }, {
      // git-raw-commits options go here
    }, {
      // conventional-commits-parser options go here
    }, {
      // conventional-changelog-writer options go here
    }))
    .pipe(dest('./'))
}

function releaseWebContent () {
  return src('src/*.htm*')
    .pipe(htmlmin({
      minifyJS: true,
      minifyCSS: true,
      minifyURLs: true,
      maxLineLength: 120,
      preserveLineBreaks: false,
      collapseWhitespace: true,
      collapseInlineTagWhitespace: true,
      conservativeCollapse: true,
      processScripts: ['text/x-red'],
      quoteCharacter: "'"
    }))
    .pipe(dest('helper'))
}

function releaseJSContent (cb) {
  const anchor = '// SOURCE-MAP-REQUIRED'

  pump([
    src('src/**/*.js')
      .pipe(sourcemaps.init({ loadMaps: true }))
      .pipe(replace(anchor, 'require(\'source-map-support\').install()'))
      .pipe(babel({ presets: ['@babel/env'] }))
      .pipe(uglify())
      .pipe(sourcemaps.write('maps')), dest('helper')],
  cb)
}

function codeJSContent (cb) {
  const anchor = '// SOURCE-MAP-REQUIRED'

  pump([
    src('src/**/*.js')
      .pipe(sourcemaps.init({ loadMaps: true }))
      .pipe(replace(anchor, 'require(\'source-map-support\').install()'))
      .pipe(babel({ presets: ['@babel/env'] }))
      .pipe(sourcemaps.write('maps')), dest('code')],
  cb)
}

function doc (cb) {
  src(['README.md', 'src/**/*.js'], { read: false })
    .pipe(jsdoc(cb))
}

exports.default = series(cleanProject, releaseWebContent, releaseJSContent, codeJSContent, releaseLocal, releasePublicData, releaseViewData, releaseIcons, doc, docIcons, docImages, changeLogProject)
exports.clean = cleanProject
exports.changeLog = changeLogProject
exports.build = series(cleanProject, releaseWebContent, releaseJSContent, releaseLocal, releaseViewData, codeJSContent)
exports.buildDocs = series(doc, docIcons, docImages)
exports.publish = series(cleanProject, releaseWebContent, releaseJSContent, releaseLocal, codeJSContent, releasePublicData, releaseViewData, releaseIcons, doc, docIcons, docImages, changeLogProject)
