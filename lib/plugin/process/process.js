if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(['node-uuid'],function(uuid) {

    var ProcessComponent = function(route,callback){
        this.route = route;
        this.callback = callback;
    }
    ProcessComponent.config = function(ruze,next){
        ruze.mixin('process', function(callback){
            var hc = new ProcessComponent(this,callback);
            return this.to('process:'+uuid.v4()).endpoint(hc);
        })
        next();
    }

    ProcessComponent.prototype.initialize = function(endpoint,ruze){
        this.ruze = ruze;
    }
    ProcessComponent.prototype.consume = function(cb){
        this.callback(this.ruze.newExchange(),function(err){
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