var express = require('express')
    , app = express()
    , http = require('http')
    ,server = http.createServer(app);

app.configure(function(){
    app.use(express.logger());
    app.use(express.static(__dirname + '/public'));
    app.use('/js/camel',express.static(__dirname + '/lib'));
})

var camel = require('./lib/camel.js');

camel.from('console:in').to('console:out');
camel.start();


app.listen(4000);
