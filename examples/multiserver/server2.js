var express = require('express')
    , app = express()
    , http = require('http')
    , io = require('socket.io-client')
    , ioServer = require('socket.io').listen(app.listen(3000),{log:false}).of('/events')
    , httpServer = http.createServer(app);

var Ruze = require('../../index.js');
var ruze = new Ruze({debug:true,listen:ioServer});


ruze.configure(function(from){
    from('console:in')
        .process(function(e,next){
            console.log(ruze.print());
            next();
        })

    from('direct:e').process(function(e,next){
        e.out.body='myserver2';
        console.log('blah');
        next(null,e);
    })
    .to('file:/Users/jpleibundguth/dev/ruze/examples/multiserver/out')
    .to('direct:f');
});
ruze.start(function(){
});

