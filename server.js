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
var camel = new Camel({preload:['header','process','format']});

camel.configure(function(){
    camel.from('console:in').to('direct:a');
    camel.from('direct:a').to('console:out');
    camel.from('direct:a')
        .process(function(exchange,next){
            console.log('process:  header contains-- ',exchange.in.header);
            exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
            next();
        })
        .to('console:out');
});
camel.start();


app.listen(4000);
