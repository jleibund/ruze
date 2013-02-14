if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(['jquery'], function($) {

    var DomComponent =  function () {
    };
    DomComponent.prototype.initialize = function(endpoint, camel){
        this.camel = camel;
        this.endpoint = endpoint;
    }
    DomComponent.prototype.consume = function(cb){
        var camel = this.camel;
        var ep = this.endpoint;

        $(ep.object).on(ep.args['on'], function(event){
            var exchange = camel.newExchange();
            exchange.out.body = event;
            cb(null,exchange);
        });
    };

    return DomComponent;
});