var express = require('express')
    , app = express()
    , http = require('http')
    , io = require('socket.io').listen(app.listen(4000),{log:true})
    , server = http.createServer(app);

app.configure(function(){
//    app.use(express.logger());
    app.use(express.static(__dirname + '/public'));
    app.use('/js',express.static(__dirname + '/lib'));
    app.use('/js/extras',express.static(__dirname + '/extras/client'));
    app.use('/conf',express.static(__dirname + '/conf'));
})

var Ruze = require('./index.js');
var ruze = new Ruze({preload:['process','expr'],listen:true, io:io.of('/events')});

ruze.loaders.local.addPath('../extras/server')

ruze.configure(function(from){
//    ruze.from('console:in').expr('in.header.a="3"').to('direct:a');
//    ruze.from('direct:a').expr('in.body= (in.header.a) ? in.header.a + " " + in.body : in.body').to('console:out');
    from('console:in')
        .process(function(e,next){
            console.log(ruze.print());
            next();
        })
//    ruze.from('direct:a')
//        .process(function(exchange,next){
//            console.log('process:  header contains-- ',exchange.in.header);
//            exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
//            next();
//        })
//        .expr('bodyAs("json")').to('console:out');
});
ruze.start(function(){
});

