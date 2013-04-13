var express = require('express')
    , app = express()
    , http = require('http')
    , io = require('socket.io-client')
    , ioServer = require('socket.io').listen(app.listen(3000),{log:false}).of('/events')
    , httpServer = http.createServer(app);

app.configure(function(){
//    app.use(express.logger());
    app.use(express.static(__dirname + '/public'));
    app.use('/js',express.static(__dirname + '/lib'));
    app.use('/js/extras',express.static(__dirname + '/extras/client'));
    app.use('/conf',express.static(__dirname + '/conf'));
})

var Ruze = require('./index.js');
var ruze = new Ruze({preload:['process','expr'],listen:ioServer});

ruze.loaders.local.addPath('../extras/server')

ruze.configure(function(from){
    from('console:in')
        .process(function(e,next){
            console.log(ruze.print());
            next();
        })

    from('direct:e').process(function(e,next){
        e.in.body='myserver2';
        console.log('blah');
        next(null,e);
    }).to('direct:f');
});
ruze.start(function(){
});

