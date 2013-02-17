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
var camel = new Camel();

camel.define(function(){
    camel.from('console:in').to('console:out');
}).then(function(){
    return camel.start();
});
//camel.start();


app.listen(4000);
