if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function(require) {

    var DirectComponent =  function (options) {
        this.debug = options && options.debug || true;
    };
    DirectComponent.prototype.initialize = function(endpoint, camel){
        this.ep = endpoint;
        this.camel = camel;
    }
    DirectComponent.prototype.consume = function(cb){
        var self = this;
        this.camel.events().on(this.ep.component+':'+this.ep.object, function(exchange){
            if (self.debug) console.log('debug direct:'+self.ep.object+' consume exchange: ',exchange);
            self.camel.events().emit(self.ep.id, exchange);
        })
    }
    DirectComponent.prototype.produce = function(exchange, cb){
        var self = this;
        if (self.debug) console.log('debug direct:'+self.ep.object+' produce exchange: ',exchange);
        this.camel.events().emit(this.ep.component+':'+this.ep.object, exchange);
        cb(null,exchange);
    }


    return DirectComponent
});