if (typeof define !== 'function') { var define = require('amdefine')(module) }
// this is wak..

//requirejs.config({
//    paths:{
//        types:'./types'
//    }
//})


define(['underscore','./lib/plugin/format/types/json'],function(_,json) {


    // todo:  not cool that format types need to be specified in the define above - want to do per commented section below in config
    // todo:  do we handle obj->json and json->obj.. e.g. but not json->xml..  that is do we need to unmarshall from json to marshall into xml?
    // todo:  add an xpath thing like this one for json:  https://github.com/matthandlersux/jsonX

    var DFComponent = function(route){
        this.route = route;
    };

    // todo:  arrrrrg
    DFComponent.converters = {'json':json};

    DFComponent.prototype.json = function(){
        this.format = 'json';
        return this.route;
    }
    // todo:  arrrrrg

    DFComponent.config = function(camel,next){
        camel.mixin('marshall', function(){
            var df = new DFComponent(this);
            this.to('format:in',df);
            return df.marshall();
        })
        camel.mixin('unmarshall', function(){
            var df = new DFComponent(this);
            this.to('format:in',df);
            return df.unmarshall();
        })

    // todo:  arrrrrg
        // need to load up all of the formats here
//        var types = ['json'];
//        var paths = [];
//        types.forEach(function(t){
//            paths.push('./lib/plugin/format/types/'+t+'.js');
//        });
//        var converters = DFComponent.converters = {};
//
//            requirejs(paths, function(){
//                if (arguments){
//
//                    _.each(arguments,function(arg,i){
//
//                        if (types[i] && arg){
//                            // call config
//                            arg.config();
//
//                            // now add it to this prototype
//                            DFComponent.prototype[types[i]] = function(){
//                                this.format =  types[i];
//                                return this.route;
//                            }
//
//                            converters[types[i]] = arg;
//                        }
//
//                    });
//                }
//            })
    // todo:  arrrrrg

        next();

    };

    DFComponent.prototype.initialize = function initialize(endpoint, camel) {
    }

    DFComponent.prototype.marshall = function () {
        this.method = 'to';
        return this;
    }

    DFComponent.prototype.unmarshall = function () {
        this.method = 'from';
        return this;
    }

    DFComponent.prototype.produce = function(exchange, cb){
        var method = this.method, format = this.format;
        if (method && format && DFComponent.converters[format]){

            var func = DFComponent.converters[format][method];

            if (func){
                exchange.in.body = func(exchange.in.body);
                cb(null,exchange);
            } else {
                cb(new Error('no function for '+method+' on converter '+ format),exchange);
            }
        } else {
            cb(new Error('no converter loaded for '+format),exchange);
        }
    }

    return DFComponent;


});
