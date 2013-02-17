if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function(require) {

    var DirectComponent =  function () {
    };
    DirectComponent.prototype.initialize = function(endpoint, camel){
        this.options = endpoint;
        this.camel = camel;
        var self = this;
        this.camel.events().on(endpoint.component+':'+endpoint.object, function(exchange){
            camel.events().emit(endpoint.id, exchange);
        })
    }
    DirectComponent.prototype.produce = function(exchange, cb){
        console.log('direct',exchange)
        cb(null,exchange);
    }


    return DirectComponent
});