if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(['exprjs', 'node-uuid', 'underscore'],function(expr, uuid, _) {


    var ExprComponent = function(ruze,expression){
        this.ruze = ruze;
        this.ast = expr.parse(expression);
    }
    ExprComponent.config = function(ruze,next){
        ruze.mixin('expr', function(expression){
            var hc = new ExprComponent(ruze,expression);
            return this.to('expr:'+uuid.v4()).endpoint(hc);
        })
        next();
    }

    ExprComponent.prototype.produce = function(exchange,cb){
        var out = null, err = null, endpoints = this.ruze.endpoints;

        // this is NOT and efficient way to do this..
        var extras = {
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
            expr.run(this.ast, exchange, endpoints, extras);
        } catch (e) {
            err = e;
        }
        if (!exchange.out.body)
            exchange.out.body = exchange.in.body;
        _.extend(exchange.out.header, exchange.in.header);

        cb(err,exchange);
    }

    return ExprComponent;
});