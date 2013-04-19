if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(['jquery'], function($) {

    var DomComponent =  function () {
    };
    DomComponent.prototype.initialize = function(endpoint, ruze){
        this.ruze = ruze;
        this.endpoint = endpoint;
    }
    DomComponent.prototype.consume = function(cb){
        var ruze = this.ruze;
        var ep = this.endpoint;

        if (!this.bound){
            $(ep.object).on(ep.args['on'], function(event){
                var exchange = ruze.newExchange();
                exchange.out.body = event;
                cb(null,exchange);
            });
            this.bound = true;
        }
    };

    return DomComponent;
});