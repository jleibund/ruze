if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function(require) {

    var ConsoleComponent =  function () {
    };
    ConsoleComponent.prototype.initialize = function(endpoint, camel){
        this.camel = camel;
    }
    ConsoleComponent.prototype.consume = function(cb){
        var camel = this.camel;
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function (chunk) {
            var exchange = camel.newExchange();
            exchange.out.body = chunk.substring(0,chunk.length-1)
            cb(null,exchange);
        });
    };
    ConsoleComponent.prototype.produce = function(exchange, cb){
        console.log(exchange.in.body);
        cb(null,exchange);
    }

    return ConsoleComponent
});