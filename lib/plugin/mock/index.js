if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function defineMockComponent() {

    function runRules(exchange) {
        var last = false;
        this._rules.forEach(function (c) {
            if (!last)
                last = c.call(this, exchange);
        }, this);

        return !last;
    }

    var MockEndpoint =
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
    MockComponent.prototype.expectedMessageCount = function (count) {
        this._rules.push(function (exchange) {
            if (this._exchanges.length == count) {
                this._cb.call(this, null, exchange);
            }
        });
    }
    MockComponent.prototype.assert = function(){
        return runRules.call(this, exchange);
    }
    return MockComponent
});