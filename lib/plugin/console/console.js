if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function(require) {

    var ConsoleComponent =  function () {
    };
    ConsoleComponent.prototype.initialize = function(endpoint, ruze){
        this.ruze = ruze;
    }
    ConsoleComponent.prototype.consume = function(cb){
        var ruze = this.ruze;
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function (chunk) {
            var exchange = ruze.newExchange();
            exchange.out.body = chunk.substring(0,chunk.length-1)
            cb(null,exchange);
        });
    };
    ConsoleComponent.prototype.produce = function(exchange, cb){
        console.log(exchange.in.body);
        exchange.out.body = exchange.in.body;
        cb(null,exchange);
    }

    return ConsoleComponent
});