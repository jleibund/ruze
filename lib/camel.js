if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define([ 'node-uuid', 'events', 'underscore', 'q'], function(uuid, events, _, Q){

    var endpoint = {container:null, component:null, object:null, args:{}};
    var exchange = {in:{}, out:{}, id:null, routeid:null};
    var component = {name:null, loaded:false, container:null};


    var route = function (camel) {
        this.id = uuid.v4();
        this.route = [];
        this.impl = {};
        this.camel = camel;
    };
    route.fn = route.prototype;


    route.fn.to = function (arg, cb) {
        var ep = this.parseEndpoint(arg);
        var self = this;
        this.route.push(ep);
        return this;
    };

    route.fn.parseEndpoint = function parseEndpoint(arg) {
        var camel = this.camel;
        var ep = camel.parseEndpoint(arg);
        ep.id = uuid.v4();
        ep.routeid = this.id;
        return ep;
    };

    route.fn.build = function(cb){
        var builders = [];
        _.each(this.route, function(ep){
            builders.push(this.buildEndpoint(ep));
        },this)
        return Q.all(builders);
    }

    route.fn.buildEndpoint = function(ep){
        var self = this;
        return this.camel.load([ep])
            .then(function(component){
                return new component();
//                return Q.fcall(function(){
//                    return new component();
//                });
            }, function(e){throw new Error(e);})
            .then(function(instance){
//                return Q.fcall(self.init(ep,instance));
                self.init(ep,instance)
            }, function(e){throw new Error(e);})
            .fail(function(err){
                throw new Error(err);
            });
    }

    // todo - we want to make sure all local plugins are preloaded - using promise and camel.define()
    // todo - we may still need this for remote plugins.  we need a route.build() method with a promise and/or join

//    route.fn.factory = function factory(endpoint, cb) {
//        return this.camel.load(endpoint).then(function(comp){
//            return new comp();
//        });
//    };
    route.fn.startEvent = function () {
        return 'start-' + this.id;
    }
    route.fn.stopEvent = function () {
        return 'start-' + this.id;
    }

    // todo:  want to add a plan() method that goes through the endpoints and reassigns chains of remote actions

    route.fn.init = function (endpoint, instance) {
        var camel = this.camel;
        var ep = endpoint;
        if (instance.initialize)
            instance.initialize(ep, camel);
        this.impl[ep.id] = instance;

        var first = this.route.length == 0;
        this.route.push(ep);

        var prior = this.startEvent();
        if (!first) {
            var ids = _.pluck(this.route, 'id');

            // may need to go through later here to see which are remote

            prior = ids[ids.indexOf(ep.id) - 1];
        }

        camel.events().on(prior, function (exchange) {
            if (first) {
                if (instance.consume) {
                    instance.consume(function (err, e) {
                        if (err) throw err;
                        camel.events().emit(ep.id, e);
                    });
                } else {
                    console.log('no consume method!')
                }
            } else {
                if (exchange.out)
                    exchange.in = exchange.out;
                exchange.out = null;

                if (instance.produce) {
                    instance.produce(exchange, function (err, e) {
                        if (err) throw err;
                        camel.events().emit(ep.id, e);
                    });
                } else {
                    console.log('no produce method!')
                }
            }
        })
    }

    var localloader = function () {
        this.paths = ['./plugin'];
        this.addPath = function (path) {
            this.paths.push(path)
        };
        this.load = function (ep, cb) {
            var self =this;
            var name = ep.component;
            var paths = this.paths.map(function(p){ return p+'/'+name+'/index'})
//            requirejs(paths, function(v){
            requirejs(paths, function(v){
                cb.call(self,null,arguments)
//                _.each(arguments, function(comp, i ){
//                    if (comp) cb.call(self, comp, 'local');
//                    else{
//                        console.log('did not receive plugin '+self.paths[i]+'/'+name);
//                    }
//
//                });
            });
        };
    };

    // todo - complete this based on socket io
    // todo - each endpoint descriptor needs to know its own 'prior' event that way remote instances can live
    //  on their own without the need for a full route rebuild in the remote site.

    var remotecomponent = function () {
    };
    remotecomponent.fn = remotecomponent.prototype;
    remotecomponent.fn.initialize = function (endpoint, routeid, next) {
        this.endpoint = endpoint;
        this.routeid = routeid;
        this.next = next;
    };
    remotecomponent.fn.consume = function (cb) {
        // make a remote call to the server to
    }
    remotecomponent.fn.produce = function (cb, exchange) {
        // make a remote call to the server to set it up
    }

    var remoteloader = function () {
        this.paths = {};
        this.addPath = function (container, path) {
            this.paths[container] = path
        };
        this.load = function (ep, cb) {
            var name = ep.component;
            _.each(this.paths, function (p, c) {
                $.getJSON(p + '/load?name=' + name, function (data) {
                    if (data.ready) {
                        cb(null,remotecomponent);
                    }
                })
            }, this)
        };
    };

    // remove singleton

//    var singleton = (function () {
//        var root = this;
//        var previousCamel = root.camel;

        var camel = function (options) {
            this.loaders = {local:new localloader(), remote:new remoteloader()}
            // where we add more from options?

            this.preload = options && options.preload || ['console','direct','mock'];

            this.loaderFn = {};
            _.each(this.loaders,function(loader,key){
                this.loaderFn[key] = Q.nfbind(_.bind(loader.load,loader));
            },this);
        };
        camel.fn = camel.prototype;


        camel.fn._load = function(name, loader){
            return this.loaderFn[loader](name);
        }

        camel.fn.define = function(definition){
            // first init the basics
            return this.loadAll.apply(this,this.preload).then(definition);
        }

        // we are removing singleton behavior
//        var camel = function (obj) {
//            if (obj instanceof camel) return obj;
//            if (!(this instanceof camel)) return new camel(obj);
//        };
//
//        if (typeof exports !== 'undefined') {
//            if (typeof module !== 'undefined' && module.exports) {
//                exports = module.exports = camel;
//            }
//            exports.camel = camel;
//        } else {
//            root.camel = camel;
//        }
//        camel.noConflict = function () {
//            root.camel = previousCamel;
//            return this;
//        };

        camel.fn.events = function () {
            if (!this.ee){
                this.ee = new events.EventEmitter();
                this.ee.setMaxListeners(0);
            }
            return this.ee;
        }

        // todo - need to add the define method that does all init, preload of local plugins

        camel.fn.loadAll = function(){
            var loads =[];
            _.each(arguments, function(name){
                loads.push({component:name, container:'local'})
            },this);
            return this.load(loads);
        }

        camel.fn.load = function (endpoints) {
//            var name = endpoint.component, container = endpoint.container;
            var names = _.pluck(endpoints,'component');

            var cps = this.cps;
            if (!cps) cps = {};

            // get the ones already loaded
            var neededNames = _.difference(names, _.keys(cps));
            var neededEps = _.filter(endpoints,function(ep){ return _.contains(neededNames,ep.component)});
            var loadedNames = _.difference(names,neededNames);

            var result = {};
            _.each(loadedNames, function(name){
                result[name] = cps[name];
            });


            var toExecute = [];

            var success = function(components){
                cps[name] = components[0];
                result[name] = cps[name];
                return result;
            };

            _.each(neededEps, function(ep){
                if (!ep.container){
                    toExecute.push(this._load(ep,'local').then(function(c){
                        if (!c || c.length == 0)
                            return this._load(ep,'remote');
                    }, function(err){
                        return this._load(name,'remote');
                    }).then(success));
                } else if (ep.container == 'local'){
                    toExecute.push(this._load(ep,'local').then(success));
                } else {
                    toExecute.push(this._load(ep,'remote').then(success));
                }
            },this);

            var self = this;

            return Q.all(toExecute);

        };

        camel.fn.parseEndpoint = function (arg) {
            var l1 = arg.split(':'), container = null, object = null, component = null, args = {};
            if (l1.length == 3) container = l1.shift();
            component = l1.shift();
            var objargs = l1.shift();
            var l2 = objargs.split('?');
            object = l2.shift();
            var params = l2.shift()
            if (params) {
                params = params.split('&');
                _.each(params, function (a) {
                    var set = a.split('=');
                    args[set[0]] = set[1];
                })
            }

            return {component:component, container:container, object:object, args:args};
        }

        camel.fn.newExchange = function (routeid) {
            return _.extend({routeid:routeid, id:uuid.v4()}, exchange);
        }

        camel.fn.from = function (arg) {
            var r = new route(this);
            if (!this.routes) this.routes = {};
            this.routes[r.id] = r;
            return r.to(arg);
        };

        // todo - start needs to build the routes (route.build(), it will be new) and return a promise for when its started


        /**
         * Start all routes or pass routes to start as arguments
         * @param route1
         * @param route2
         * @param more
         */
        camel.fn.start = function (route1, route2, more) {
            var builder = [];
            _.each(this.routes,function(r){
                builder.push(r.build());
            });
            Q.all(builder).then(function(){
                _.each(arguments.length ? arguments : this.routes, function (v, k) {
                    var r = typeof v == 'string' ? this.routes[v] : v;
                    if (r) {
                        this.events().emit(r.startEvent());
                    } else {
                        console.log('route does not exist [' + v + ']');
                    }
                }, this)
            })
        }

        /**
         *
         * @param route1
         * @param route2
         * @param more
         */
        camel.fn.stop = function (route1, route2, more) {
            _.each(arguments.length ? arguments : this.routes, function (v, k) {
                var r = typeof v == 'string' ? this.routes[v] : v;
                if (r) {
                    this.events().emit(r.stopEvent());
                } else {
                    console.log('route does not exist [' + v + ']');
                }
            }, this)
        }

        // todo - this may need to be a promise.

        camel.fn.endpoint = function(end, cb){
            var r = new route(this);
            if (!this.routes) this.routes = {};
            this.routes[end] = r;
            return r.to(end, cb);
        }
        camel.fn.send = function(routeId, body, cb){
          return this.from(routeId, function(exchange){
                exchange.out = body;

          });
        }

        camel.fn.print = function () {
            console.log(this.routes);
        }


    // remove singleton
//        return camel;
//    }).call(this);
//    return singleton;

    return camel;
});