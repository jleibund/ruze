if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function(require) {

    var DirectComponent =  function (options) {
        this.debug = options && options.debug || true;
    };
    DirectComponent.prototype.initialize = function(endpoint, camel){
        var ep = this.ep = endpoint;
        this.camel = camel;
        if (!ep.recipientList){}
    }
    DirectComponent.prototype.produce = function(exchange, cb){
        var self = this;
        if (self.debug) console.log('debug direct:'+self.ep.object+' produce exchange: ',exchange);
        exchange.out = exchange.in;
        cb(null,exchange);
    }

    return DirectComponent
});