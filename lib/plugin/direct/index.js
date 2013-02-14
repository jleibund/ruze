if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function(require) {

    var DirectComponent =  function () {
    };
    DirectComponent.prototype.initialize = function(endpoint, camel){
        this.options = endpoint;
        this.camel = camel;
    }
     DirectComponent.prototype.produce = function(exchange, cb){
        cb(null,exchange);
    }

    return DirectComponent
});