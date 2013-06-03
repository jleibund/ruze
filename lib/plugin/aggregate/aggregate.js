var isServer = true;
if (typeof define !== 'function') {
    var define = require('amdefine')(module)
} else {
    isServer = false;
}

var cutilsPath = (isServer) ? '../../cutils' : './cutils'

//todo add persistent store capabilities?

define(['require', 'exprjs', 'underscore', 'node-uuid', cutilsPath], function (require) {

    var Parser = require('exprjs'),
        uuid = require('node-uuid'),
        _ = require('underscore') || exports._,
        cutils = require(cutilsPath),
        expr = new Parser();

    var md5 = cutils.md5;
    var extras = cutils.exprFunctions;

    var preBuiltStrategies = {
        arrayStrategy:function(ruze, oldEx, newEx){
            if (!oldEx) return newEx;
            oldEx.in.body = _.union(oldEx.in.body, newEx.in.body);
            return oldEx;
        },
        stringStrategy:function(ruze, oldEx, newEx){
            if (!oldEx) return newEx;
            oldEx.in.body = oldEx.in.body + newEx.in.body;
            return oldEx;
        }
    }


    var AggregatorComponent = function AggregatorComponent(ruze, options) {
        this.ruze = ruze;
        this.options = options;
        this.aggregateId = options && options.aggregateId || 'in.header.aggregateId';
        this.aggregateAst = expr.parse(this.aggregateId);

        this.strategy = options && options.strategy || 'arrayStrategy';

        if (options && options.completionPredicate){
            this.exprAst = expr.parse(options.completionPredicate);
        }

        if (options && options.completionFromBatchConsumer){
            this.batchAst = expr.parse('in.header.complete');
            this.indexAst = expr.parse('in.header.index');
        }

        this.store = {};
    }

    AggregatorComponent.config = function config(ruze, next) {

        //todo:  should we load all aggregation strategies (preset list) or allow extension (limit to the immediate server)

        ruze.mixin('aggregate', function (options) {
            var hc = new AggregatorComponent(ruze, options);
//            var ep = {component:'aggregate', object:'producer', args:options};
//            ruze.rewriteEndpointId(ep);
//            var id = (options && options.strategy && typeof options.strategy == 'function')? 'aggregate:'+uuid.v4() : ep.id;
            var id = 'aggregate:'+uuid.v4() ;
            return this.to(id).endpoint(hc);
        })
        next();
    }
    AggregatorComponent.toObject = function toObject(endpoint) {
        return {aggregate: endpoint.id};
    }
    AggregatorComponent.prototype.toObject = function () {
        return {aggregate: this.options};
    }
    AggregatorComponent.prototype.fire = function (agId, cb) {
        var ruze = this.ruze;
        var store = this.store;
        var err = null;
        if (store[agId] && !_.isEmpty(store[agId])){
            // get the strategy
            var strategy = preBuiltStrategies[this.strategy];
            if (!strategy && typeof this.strategy == 'function'){
                strategy = this.strategy;
            } else if (!strategy) {
                throw Error('strategy="'+this.strategy+'" specified is not a function and not a prebuilt strategy');
            }

            // we need to sort the keys
            var result = null;
            var keys = _.keys(store[agId].exchanges).sort();
            _.each(keys, function(k){
                result = strategy(ruze, result,store[agId].exchanges[k]);
            })
            delete store[agId];

            result.out.body = result.in.body;
            result.in.body = null;
            _.clone(result.out.header, result.in.header);
            cb(err, result);
        }
    }
    AggregatorComponent.prototype.fireAll = function (cb) {
        var store = this.store;
        _.each(_.keys(store),function(agId){
            this.fire(agId,cb);
        },this);
    }
    AggregatorComponent.prototype.produce = function (exchange, cb) {

        var options = this.options, self = this;
        var batch = options && options.completionFromBatchConsumer;
        var pred = options && options.completionPredicate;
        var store = this.store;

        var agId = null, agIdx = null, batchComplete = null, predComplete = null, storeSize, completeSize;
        try {
            agId = expr.run(this.aggregateAst, exchange, extras);
            if (!store[agId]){
                store[agId] = {exchanges:{}};
            }

            storeSize = _.keys(store[agId].exchanges).length;
            completeSize = store[agId].completeSize;

            if (completeSize && storeSize > completeSize)
                throw Error('something went wrong with batch complete, should only be max '+completeSize+' parts sent');

            if (batch){
                agIdx = expr.run(this.indexAst, exchange, extras);
                batchComplete = expr.run(this.batchAst, exchange, extras);

                if (batchComplete){
                    // store its size
                    store[agId].completeSize = agIdx;
                }

            } else {
                agIdx = _.keys(store[agId].exchanges).length+1;
            }
            if (pred){
                predComplete = expr.run(this.exprAst, exchange, extras);
            }
        } catch (e) {
            err = e;
        }
        if (!agId) throw Error('aggregator received an exchange without an aggregateId that matches '+this.aggregateId);

        store[agId].exchanges[agIdx] = exchange;

        // setup intervals to fire, if specified
        if (options && options.completionInterval && !this.intervalStarted){
            this.intervalStarted = true;
            _.delay(_.bind(self.fireAll,self),options.completionInterval, cb);
        }

        // set timeout to fire, if specified
        if (options && options.completionTimeout){
            _.delay(_.bind(self.fire,self),options.completionTimeout, agId, cb);
        }

        // setup for size-based
        if (options && options.completionSize){
            if (_.keys(store[agId]).length >= options.completionSize){
                this.fire(agId,cb);
            }
        }

        // todo change out for other strategies
        if (batchComplete || predComplete || completeSize){
            this.fire(agId, cb);
        }
    }

    return AggregatorComponent;
});