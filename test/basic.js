var express = require('express')
    , app = express()
    , http = require('http')
    ,server = http.createServer(app);

var Context = require('../lib/camel').Context;
var ctx = new Context();
var fs = require('fs')
var watch = require('nodewatch');

//var dir = '/Users/jleibund/dev/cameljs/test';
var dir = './test'

ctx.from('file:/Users/jleibund/dev/cameljs/test/in')
    .unmarshall().json()
    .to('console:log')
    .header().remove('filename')
    .header().add('extension','json')
    .marshall().json()
    .to('file:/Users/jleibund/dev/cameljs/test/out');

ctx.from('console:in')
    .header().add('extension','txt')
    .to('file:/Users/jleibund/dev/cameljs/test/out')

ctx.run();

app.listen(4000);


//watch.add(dir).onChange(function(file,prev,curr,action){
//    var tokens = file.split('/');
//
//    if (tokens[tokens.length-1].charAt(0) != '.')
//        console.log(file, action, curr.mtime.getTime());
////    console.log(prev.mtime.getTime());
////    console.log(curr.mtime.getTime());
////    console.log(action) // new, change, delete
//
// });
