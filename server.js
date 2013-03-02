var express = require('express')
    , app = express()
    , http = require('http')
    ,server = http.createServer(app);

app.configure(function(){
    app.use(express.logger());
    app.use(express.static(__dirname + '/public'));
    app.use('/js/ruze',express.static(__dirname + '/lib'));
})

var Ruze = require('./index.js');
var ruze = new Ruze({preload:['process','expr']});

// expr('out.body= in.header.a')

ruze.configure(function(){
    ruze.from('console:in').expr('in.header.a="3"').to('direct:a');
    ruze.from('direct:a').expr('in.body= (in.header.a) ? in.header.a + " " + in.body : in.body').to('console:out');
    ruze.from('direct:a').to('console:out');
    ruze.from('direct:a')
        .process(function(exchange,next){
            console.log('process:  header contains-- ',exchange.in.header);
            exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
            next();
        })
        .expr('bodyAs("json")').to('console:out');
});
ruze.start(function(){
//    ruze.print();
    ruze.send('direct:a','hello')
});


app.listen(4000);
