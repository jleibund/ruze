var isServer = true;
if (typeof define !== 'function') {
    var define = require('amdefine')(module)
} else {
    isServer = false;
}

var cutilsPath = (isServer) ? '../../cutils' : './cutils'

define(['require','exprjs', 'underscore',cutilsPath],function(require) {

    var expr = require('exprjs'),
        _ = require('underscore') || exports._,
        cutils = require(cutilsPath);

    var md5 = cutils.md5;

    var WhenComponent = function(ruze,expression){
        this.ruze = ruze;
        this.expression = expression;
        if (expression)
            this.ast = expr.parse(expression);
    }
    WhenComponent.config = function(ruze,next){

        var sets = WhenComponent.sets = {};
        var prev = WhenComponent.prev = null;
        var cur = WhenComponent.cur = null;

        var func = function(expression){
            var hc = new WhenComponent(ruze,expression);
            var id = 'when:'+md5(expression);
            var end = (expression == null);

            // new set of conditionals
            if (!prev) {
                cur = prev = id;
                sets[id] = [hc];
            } else {
                sets[cur].push(hc);
                prev = id;
            }

            var result =  this.to(id).endpoint(hc);
            hc.ep = _.last(this.route);
            return result;
        }

        var funcEnd = function(){
            var hc = new WhenComponent(ruze);
//            var id = 'when:'+uuid.v4();
            var id = 'when:otherwise';

            if (cur && prev) {
                sets[cur].push(hc);
                cur = prev = null;
            }

            var result =  this.to(id).endpoint(hc);
            hc.ep = _.last(this.route);
            return result;
        }

        ruze.mixin('when', func)
        ruze.mixin('otherwise', funcEnd)
        next();
    }
    WhenComponent.toObject = function(endpoint){
        return (endpoint.object || endpoint.object.length > 0) ? {when:endpoint.object} : {otherwise:''};
    }

    WhenComponent.prototype.toObject = function(){
        return (this.expression) ? {when:this.expression} : {otherwise:''};
    }

    WhenComponent.prototype.produce = function(exchange,cb){
        var out = null, err = null;

        // this is NOT and efficient way to do this..
        var extras = {
            ref : function(endpoint){
                return this.ruze.endpoints[endpoint];
            },

            bodyAs : function(type){
                switch (type){
                    case 'json':
                        exchange.out.body = JSON.parse(exchange.in.body); break;
                    case 'string':
                        exchange.out.body = JSON.stringify(exchange.in.body); break;
                    case 'xml':
                        console.log('I don\'t do xml yet'); break;
                    default:
                        throw new Error('unrecognized type : '+type);
                }
                console.log('xform to ',type);
            }
        }

        try {
            var sets = WhenComponent.sets;

            // this is always the set id first..
            var set = sets[this.ep.id];
            if (set){
                for (var i= 0; i<set.length;i++){
                    var comp = set[i];
                    if (comp.expression && comp.ast){
                        var result = expr.run(comp.ast, exchange, extras);
                        if (result){
                            exchange.out = exchange.in;
                            exchange.out.recipientList = comp.ep.recipientList;
                            return cb(err,exchange);
                        }
                    } else {
                        exchange.out = exchange.in;
                        exchange.out.recipientList = comp.ep.recipientList;
                        return cb(err,exchange);
                    }
                }
            }

        } catch (e) {
            err = e;
        }
    }

    return WhenComponent;
});