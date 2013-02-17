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


    route.fn.to = function (arg) {
        var ep = this.parseEndpoint(arg);
        ep.prior = (!this.route.length)? this.startEvent() : _.last(this.route).id;
        this.route.push(ep);
        return this;
    };

    route.fn.add = function(ep,instance){
        ep.prior = (!this.route.length)? this.startEvent() : _.last(this.route).id;
        if (!ep.id) ep.id = uuid.v4();
        self.impl[ep.id] = instance;
        this.route.push(ep);
        return this;
    }

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
        },this);
        var self = this;
        var success = Q.fcall(function(){
            self.built = true;
            return self.built;
        });
        var fail = Q.fcall(function(){
            self.built = true;
            return self.built;
        });
        return Q.allResolved(builders).then(success,fail);
    }

    route.fn.buildEndpoint = function(ep){
        var self = this;
        return this.camel.load(ep)
            .then(function(component){
                var instance = self.impl[ep.id];
                if (!instance && component){
                    instance = new component();
                    self.impl[ep.id] = instance;
                } else if (!component) {
                    console.log('error, component didn\'t load for ',ep.component);
                    throw new Error('error, component didn\'t load for ',ep.component);
                }

                return instance;
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
        return 'stop-' + this.id;
    }

    // todo:  want to add a plan() method that goes through the endpoints and reassigns chains of remote actions

    route.fn.init = function (endpoint, instance) {
        var camel = this.camel;
        var ep = endpoint;
        if (instance.initialize)
            instance.initialize(ep, camel);

        var start = this.startEvent();
        var onlyOne = (this.route.length == 1);

        camel.events().on(ep.prior, function (exchange) {
            if (ep.prior == start && !onlyOne && !exchange) {
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
                var result = null;
                _.each(arguments, function(arg){
                    if (arg && !result) result = arg;
                },this)
                cb.call(self,null,result)
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

            this.preload = options && options.preload || ['console','direct','header','process'];

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
            return this.loadAll(this.preload).then(function(){
                return Q.fcall(definition)
            });
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

        camel.fn.loadAll = function(name1, name2, others){
            var loads =[];
            _.each(_.flatten(arguments), function(name){
                loads.push(this.load({component:name, container:'local'}));
            },this);
            return Q.allResolved(loads);
        }

        camel.fn.load = function (endpoint) {
//            var name = endpoint.component, container = endpoint.container;

            if (!this.cps) this.cps = {};

            var comp=  this.cps[endpoint.component];
            if (comp) return Q.fcall(function(){return comp});

            var self = this;
            var save = function(c){
                if (c) {
                    self.cps[endpoint.component] = c;
                }
                return c;
            }

            var look = _.bind(function(ep){
//                if (comp) return Q.fcall(function(){return 'cream'});

                if (!ep.container || ep.container == 'local'){
                    return this._load(ep,'local').then(save);
                }
                return this._load(ep,'remote').then(save);

            },this);


            return look(endpoint);
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
            return _.extend({}, exchange,{routeid:routeid, id:uuid.v4()});
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
            var args = arguments;
            _.each(this.routes,function(r){
                if (!r.built)
                    builder.push(r.build());
            },this);

            var start = _.bind(function(){
                _.each(args.length ? args : this.routes, function (v, k) {
                    var r = (typeof v == 'string') ? this.routes[v] : v;
                    if (r && r.built) {
                        this.events().emit(r.startEvent());
                    } else {
                        console.log('route does not exist [' + v + '] or did not build');
                    }
                },this);
            },this);

            return Q.allResolved(builder).then(start);
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

        camel.fn.endpoint = function(end,cb){
            var r = this.from(end);
            return r.build().then(function(){
                cb(r.impl[r.route[0].id]);
            });
        }
        camel.fn.send = function(routeId, body, cb){
            var ex = this.newExchange(routeId);
            ex.out.body = body;
            camel.events().emit(routeId, ex);
        }

        camel.fn.print = function () {
            console.log(this.routes);
        }

        camel.fn.mixin = function(name, f){
            //todo look at underscore to make this better..
            route.fn[name] = f;
        }


    // remove singleton
//        return camel;
//    }).call(this);
//    return singleton;

    return camel;
});