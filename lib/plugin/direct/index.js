if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function(require) {

    var DirectComponent =  function () {
    };
    DirectComponent.prototype.initialize = function(endpoint, camel){
        this.ep = endpoint;
        this.camel = camel;
    }
    DirectComponent.prototype.consume = function(cb){
        var self = this;
        this.camel.events().on(this.ep.component+':'+this.ep.object, function(exchange){
            self.camel.events().emit(self.ep.id, exchange);
        })
    }
    DirectComponent.prototype.produce = function(exchange, cb){
        console.log('direct logging exchange:',exchange)
        this.camel.events().emit(this.ep.component+':'+this.ep.object, exchange);
        cb(null,exchange);
    }


    return DirectComponent
});