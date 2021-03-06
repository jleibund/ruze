var express = require('express')
    , app = express()
    , http = require('http')
    , io = require('socket.io-client')
    , ioServer = require('socket.io').listen(app.listen(4000),{log:false}).of('/events')
    , httpServer = http.createServer(app);

app.configure(function(){
//    app.use(express.logger());
    app.use(express.directory(__dirname + '/public'));
    app.use(express.static(__dirname + '/public'));
    app.use('/js',express.static(__dirname + '/../../lib'));
    app.use('/js',express.static(__dirname + '/../../public/js'));
    app.use('/js/extras',express.static(__dirname + '/../../extras'));
    app.use('/conf',express.static(__dirname + '/conf'));
})

var Ruze = require('../../index.js');
var ruze = new Ruze({debug:true,listen:ioServer, io:io, connect:{server2:'http://localhost:3000/events'}});


ruze.configure(function(from){
    from('console:in')
        .process(function(e,next){
            console.log(ruze.print());
            next();
        })

    from('direct:a').to('direct:b');
});

ruze.start();




//    from('local:direct:c').to('server2:direct:e');
//
//    from('direct:e').process(function(e,next){
//        console.log(ruze.print());
//        next();
//    });
//    ruze.from('direct:a')
//        .process(function(exchange,next){
//            console.log('process:  header contains-- ',exchange.in.header);
//            exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
//            next();
//        })
//        .expr('bodyAs("json")').to('console:out');


