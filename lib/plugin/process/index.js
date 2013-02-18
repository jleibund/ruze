if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(function(require) {

    var ProcessComponent = function(route,callback){
        this.route = route;
        this.callback = callback;
    }
    ProcessComponent.config = function(camel,next){
        camel.mixin('process', function(callback){
            var hc = new ProcessComponent(this,callback);
            this.add({component:'process', container:'local'},hc);
            return this;
        })
        next();
    }

    ProcessComponent.prototype.initialize = function(endpoint,camel){
        this.camel = camel;
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