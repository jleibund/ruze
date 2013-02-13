if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(function(require) {

    var Route = require('../../camel').Route;

    Route.prototype.process = function(callback){
        var epObj = {component:'process', container:'local', object:callback};
        this.ctx.register(epObj)
        this.route.push(epObj);
        return this;
    }

    var ProcessComponent = function(){}
    ProcessComponent.prototype.initialize = function(options,ctx){
        this.callback = options.object;
        this.ctx = ctx;
    }
    ProcessComponent.prototype.consume = function(cb){
        this.callback(this.ctx.newExchange,function(err){
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