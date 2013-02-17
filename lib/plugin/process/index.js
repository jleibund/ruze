if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(function(require) {

    var ProcessComponent = function(){}
    ProcessComponent.prototype.initialize = function(endpoint,camel){
        this.camel = camel;
        var self = this;
        camel.mixin('process', function(callback){
            self.callback = callback;
            this.add({component:'process', container:'local'},self);
            return this;
        });
    }
    ProcessComponent.prototype.consume = function(cb){
        this.callback(this.camel.newExchange(),function(err){
            cb(err,exchange);
        });
    }
    ProcessComponent.prototype.produce = function(exchange,cb){
        this.callback(exchange,function(err){
            cb(err,exchange);
        });
    }

    return ProcessComponent;
});