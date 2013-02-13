if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(function(require) {


    var Route = require('../../camel').Route;

    var HeaderComponent = function(route){
        this.route = route;
    }

    Route.prototype.header = function(){

        // issue is i create these dynamically, so 'this' version is lost at runtime

        var hc = new HeaderComponent(this);

        var epObj = {component:'header', container:'local', object:hc};
        this.ctx.register(epObj)
        this.route.push(epObj);
        return hc;
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
        this.method(exchange.header);
        cb(null,exchange);
    }

    return HeaderComponent;
});
