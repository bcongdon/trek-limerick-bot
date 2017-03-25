'use strict';
//This is a sample gulp file that can be used.
//npm install --save gulp gulp-zip gulp-awslambda
const gulp   = require('gulp');
const zip    = require('gulp-zip');
const path   = require('path');
var del = require('del');
const aws_lambda_node_canvas = require('aws-lambda-node-canvas');

let runtime = 'nodejs' // nodejs or nodejs4.3

gulp.task('package', () => {
    return gulp.src('build/**/*') //Your src files to bundle into aws lambda
        .pipe(aws_lambda_node_canvas({runtime : runtime})) //Adds all the required files needed to run node-canvas in aws lambda
        .pipe(zip('archive.zip'))
        .pipe(gulp.dest('dist')); //Also place the uploaded file
});

gulp.task('build', () => {
    return gulp.src(['trek-limerick-bot.js', 'custom_phrases.json', '!node_modules/**/*','!dist/**/*','!node_modules/aws-lambda-node-canvas/**/*']) //Your src files to bundle into aws lambda
        .pipe(aws_lambda_node_canvas({runtime : runtime})) //Adds all the required files needed to run node-canvas in aws lambda
        .pipe(gulp.dest('build')); //Also place the uploaded file
});

gulp.task('copy', () => {
    return gulp.src(['processed/**/*'], {base: 'processed'})
        .pipe(gulp.dest('build/processed'));
});

gulp.task('clean', (cb) => {
    del.sync('build/');
    del.sync('dist/');
    cb();
});

gulp.task('default', gulp.series('clean', 'copy', 'build', 'package'));