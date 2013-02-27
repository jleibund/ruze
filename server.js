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
var camel = new Camel({preload:['process','expr']});

// expr('out.body= in.header.a')

camel.configure(function(){
    camel.from('console:in').expr('in.header.a="3"').to('direct:a');
    camel.from('direct:a').expr('in.body= (in.header.a) ? in.header.a + " " + in.body : in.body').to('console:out');
    camel.from('direct:a').to('console:out');
    camel.from('direct:a')
        .process(function(exchange,next){
            console.log('process:  header contains-- ',exchange.in.header);
            exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
            next();
        })
        .expr('bodyAs("json")').to('console:out');
});
camel.start(function(){
//    camel.print();
    camel.send('direct:a','hello')
});


app.listen(4000);
