var isServer = true;
if (typeof define !== 'function') {
    var define = require('amdefine')(module)
} else {
    isServer = false;
}

var cutilsPath = (isServer) ? '../../cutils' : './cutils'

define(['require', 'exprjs', 'underscore', 'node-uuid', cutilsPath], function (require) {

    var Parser = require('exprjs'),
        uuid = require('node-uuid'),
        _ = require('underscore') || exports._,
        cutils = require(cutilsPath),
        expr = new Parser();

    var md5 = cutils.md5;

    var extras = cutils.exprFunctions;

    var SplitterComponent = function SplitterComponent(ruze, expression) {
        this.ruze = ruze;
        this.ast = expr.parse(expression);
        this.expression = expression;
    }
    SplitterComponent.config = function config(ruze, next) {
        ruze.mixin('split', function (expression, split_on, isExpr) {
            var isExpr = isExpr || false;
            var hc = new SplitterComponent(ruze, expression);
            if (split_on){
                if (!isExpr){
                    hc.tokenize(split_on);
                } else {
                    //todo its an expression
                }
            }
            result = this.to('split:' + md5(expression)).endpoint(hc);
            return result;
        })
        next();
    }
    SplitterComponent.toObject = function toObject(endpoint) {
        return {split: endpoint.object};
    }
    SplitterComponent.prototype.toObject = function () {
        return {split: this.expression};
    }
    SplitterComponent.prototype.tokenize = function (value) {
        this.token = value;
    }
    SplitterComponent.prototype.produce = function (exchange, cb) {
        var out = null, err = null, ruze = this.ruze;

        //todo :  check that endpoints will work with ref() in extras, below.. e.g. mock:out is not a valid js identifier.

        // this is NOT and efficient way to do this..
        var result = null;
        try {
            result = expr.run(this.ast, exchange, extras(ruze,exchange));
        } catch (e) {
            err = e;
        }

        // if result is an array of things
        if (typeof result == 'string' && this.token){
            result = result.split(this.token);
        } else if (_.isObject(result) && !_.isArray(result)){
            result = _.values(result);
        } else if (!_.isArray(result)){
            throw Error('cannot tokenize on objects');
        } else if (typeof result == 'string' && !this.token) {
            throw Error('must specify a tokenizer for string-based bodies')
        }

        var aggregateId = uuid.v4();
        _.clone(exchange.out.header, exchange.in.header);
        exchange.in.body = null;
        _.each(result, function(record, idx){
            var ex = cutils.clone(exchange);
            ex.out.header.aggregateId = aggregateId;
            ex.out.header.index = idx;
            ex.out.header.complete= (idx == result.length-1);
            ex.out.body = record;
            ex.id = uuid.v4();
            _.extend(ex.out.header, ex.in.header);

            cb(err, ex);

        },this);

    }

    return SplitterComponent;
});