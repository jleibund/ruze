if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(['underscore'],function(_) {


    var HeaderComponent = function(route){
        this.route = route;
    }

    HeaderComponent.config = function(camel,next){
        camel.mixin('header', function(){
            var hc = new HeaderComponent(this);
            this.to('header:in',hc);
            return hc;
        })
        next();
    }

    HeaderComponent.prototype.initialize = function initialize(endpoint, camel) {
    }


    HeaderComponent.prototype.add = function(key, val){
        this.method = function(arg){ arg[key] = val};
        return this.route;
    }

    HeaderComponent.prototype.remove = function(key){
        this.method = function(arg){ delete arg[key]; };
        return this.route;
    }

    HeaderComponent.prototype.produce = function(exchange, cb){
        this.method(exchange.in.header);
        cb(null,exchange);
    }

    return HeaderComponent;
});
