if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(['assert'], function defineMockComponent(assert) {

    function runRules(exchange) {
        var last = false;
        this._rules.forEach(function (c) {
            if (!last)
                last = c.call(this, exchange);
        }, this);

        return !last;
    }

    var MockComponent = function MockComponentConstructor() {
        this._exchanges = [];
        this._rules = [];
    };
    MockComponent.prototype.initialize = function initialize(endpoint, camel) {
        this.camel = camel;
        var self = this;
        endpoint.assert = function(){
            return self.assert();
        }
    }
    MockComponent.prototype.produce = function produce(exchange, cb) {
        this._cb = cb;
        this._exchanges.push(exchange);
//        cb(null, exchange);
    }
    MockComponent.prototype.exchanges = function () {
        return this._exchanges;
    }
    MockComponent.prototype.maxWait = function(timeout){
        this._timeout = setTimeout(function(){
               throw Error("timout ["+timeout+"] exceeded");
        },timeout);
    }
    MockComponent.prototype.expectedMessageCount = function (count) {
        this._rules.push(function (exchange) {
            if (this._exchanges.length == count) {
                this._cb.call(this, null, exchange);
            }
        });
    }
    MockComponent.prototype.assert = function(){
        var result = true;
        var self= this;
        this._exchanges.forEach(function(exchange){
            var success = runRules.call(self, exchange);
            if (!success) result = false;
            clearTimeout(self._timeout);
        });
        return result;
    }
    return MockComponent
});