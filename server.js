var express = require('express')
    , app = express()
    , http = require('http')
    ,server = http.createServer(app);

app.configure(function(){
    app.use(express.logger());
    app.use(express.static(__dirname + '/public'));
    app.use('/js/camel',express.static(__dirname + '/lib'));
})

var Camel = require('./index.js');
var camel = new Camel({preload:['header','process']});

camel.define(function(){
    camel.from('console:in').header().add('what','color').to('direct:a');
    camel.from('direct:a')
        .process(function(exchange,next){
            console.log('process:  header contains-- ',exchange.in.header);
            next();
        })
        .to('console:out');
}).then(function(){
    return camel.start();
}).done();
//camel.start();


app.listen(4000);
