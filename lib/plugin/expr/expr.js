var isServer = true;
if (typeof define !== 'function') {
    var define = require('amdefine')(module)
} else {
    isServer = false;
}

var cutilsPath = (isServer) ? '../../cutils' : './cutils'

define(['require', 'exprjs', 'underscore', cutilsPath], function (require) {

    var Parser = require('exprjs'),
        _ = require('underscore') || exports._,
        cutils = require(cutilsPath),
        expr = new Parser();

    var md5 = cutils.md5;
    var extras = cutils.exprFunctions;

    var ExprComponent = function ExprComponent(ruze, expression) {
        this.ruze = ruze;
        this.ast = expr.parse(expression);
        this.expression = expression;
    }
    ExprComponent.config = function config(ruze, next) {
        ruze.mixin('expr', function (expression) {
            var hc = new ExprComponent(ruze, expression);
            var result = this.to('expr:' + md5(expression)).endpoint(hc);
            return result;
        })
        next();
    }
    ExprComponent.toObject = function toObject(endpoint) {
        return {expr: endpoint.object};
    }
    ExprComponent.prototype.toObject = function () {
        return {expr: this.expression};
    }
    ExprComponent.prototype.produce = function (exchange, cb) {
        var out = null, err = null, ruze = this.ruze;

        //todo :  check that endpoints will work with ref() in extras, below.. e.g. mock:out is not a valid js identifier.

        try {
            expr.run(this.ast, exchange, extras(ruze,exchange));
        } catch (e) {
            err = e;
        }
        if (!exchange.out.body)
            exchange.out.body = exchange.in.body;
        _.extend(exchange.out.header, exchange.in.header);

        cb(err, exchange);
    }

    return ExprComponent;
});