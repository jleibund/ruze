if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

//requirejs.config({
//    nodeRequire:require,
//    baseUrl:__dirname
//})

define([ 'node-uuid', 'events', 'underscore', 'q', 'cutils', 'colors', 'exprjs','module', 'path'], function(uuid, events, _, Q, cutils, colors, exprjs, module, path){

    var dirname = path.dirname(module.uri);

    if (colors){
        colors.setTheme({
            data: 'grey',
            line: 'grey',
            section: 'black',
            interest: 'black',
            emphasis: 'red'
        });
    }

    // todo - should we spell out exceptions .fail() and .progress() using Q or just have the default handler catch them on done()?

    var endpoint = {id:null, container:null, component:null, object:null, args:{}};
//    var init_endpoint = {id:null, container:'local', component:'route'}
    var exchange = {in:{header:{}}, out:{header:{}}, properties:{}, id:null, error:null, fromEndpoint:null};
    var component = {name:null, loaded:false, container:null};

    var route = function (camel) {
        this.id = uuid.v4();
        this.route = [];
        this.camel = camel;
    };
    route.fn = route.prototype;

    route.fn.to = function (arg) {
        var camel = this.camel;
        var ep = camel.parseEndpoint(Array.prototype.slice.call(arguments,0));
        var last = _.last(this.route);
        if (last){
            if (!last.recipientList) last.recipientList = [];
            var next = _.extend({},ep);
            if (next.recipientList) delete next.recipientList;
            last.recipientList.push(next);
        }
//        ep.prior = (!this.route.length)? _.extend({}, init_endpoint, {id:this.startEvent()}) : _.extend({},_.last(this.route));
//        if (ep.prior.prior) delete ep.prior.prior;
        this.route.push(ep);
        return this;
    };

    route.fn.endpoint = function(instance) {
        var route = this.route, camel = this.camel;
        if (route && route.length > 0){
            var ep = route[route.length-1];
            if (ep.id)
                camel.endpoints[ep.id] = {instance:instance, config:ep};
        }
        return this;
    }

    route.fn.recipientList = function(expression){
        //
    }

    // todo - move all building, impl, etc to camel, shouldn't be in route anymore

    route.fn.build = function(cb){
        var builders = [];
        _.each(this.route, function(ep){
            builders.push(this.buildEndpoint(ep));
        },this);
        var self = this;
        var success = Q.fcall(function(){
            self.built = true;
            return self;
        });
//        var fail = Q.fcall(function(){
//            self.built = false;
//            return self;
//        });
        return Q.allResolved(builders).then(success);
    }

    route.fn.buildEndpoint = function(ep){
        var self = this;
        var camel = this.camel;
        return this.camel.load(ep)
            .then(function(component){
                var endpoint = camel.endpoints[ep.id];
                var instance = endpoint && endpoint.instance;
                if (!instance && component){
                    instance = new component();
                    endpoint = camel.endpoints[ep.id] = {instance:instance, config:ep};
                    if (instance.initialize)
                        instance.initialize(ep, camel, this);
                } else if (!component) {
                    throw new Error('error, component didn\'t load for ',ep.component);
                }
                if (ep.recipientList) {
                    // add up all recipients
                    if (!endpoint.config.recipientList) endpoint.config.recipientList = [];
//                    endpoint.config.recipientList = _.uniq(_.union(endpoint.config.recipientList,ep.recipientList),function(a,b){return a.id == b.id});
                    endpoint.config.recipientList = _.union(endpoint.config.recipientList,ep.recipientList);
                }
                return instance;
            }, function(e){throw new Error(e);})
            .then(function(instance){
                self.init(ep,instance)
            });
    }

    // todo - we may still need this for remote plugins.  we need a route.build() method with a promise and/or join

    route.fn.startEvent = function () {
        return (this.route.length)? this.route[0].id : null;
    }
//    route.fn.stopEvent = function () {
//        return 'stop-' + this.id;
//    }

    route.fn._emitRecipients = function(endpoint, exchange){
        var camel = this.camel;
        var rl = endpoint.recipientList;
        // todo:  check for an expression in simple format
        if (rl){
            _.each(rl, function(recip){

                //todo:  if we extend exchange, should it get a new uuid - is it part of the original or a new thing?
                var e = _.extend({},exchange);
                camel.events().emit(recip.id,e);
            },this)
        }
    }

    route.fn.init = function (endpoint, instance) {
        var camel = this.camel;
        var self = this;
        var ep = endpoint;

        var listeners = camel.events().listeners(ep.id);
        if (!listeners || !listeners.length){
        camel.events().on(ep.id, function (exchange) {
            if (!exchange) {
                if (instance.consume){
                    instance.consume(function (err, e) {
                        if (err) throw err;
                        e.fromEndpoint = ep;
                        self._emitRecipients(ep,e);
                    });
                }
            } else {
                if (exchange.out || !_.isEmpty(exchange.out))
                    exchange.in = exchange.out;
                exchange.out = {header:{}};

                if (instance.produce) {
                    instance.produce(exchange, function (err, e) {
                        if (err) throw err;
                        e.fromEndpoint = ep;
                        self._emitRecipients(ep,e);
                    });
                } else {
                    throw new Error('produce called, but no produce method on endpoint',ep);
                }
            }
        })
//            endpoint.initialized = true;
    }

//
//        }
    }

    var localloader = function () {
        this.paths = [dirname+'/plugin'];
        this.addPath = function (path) {
            this.paths.push(path)
        };
        this.load = function (ep, cb) {
            var self =this;
            var name = ep.component;
            var paths = this.paths.map(function(p){ return p+'/'+name+'/'+name})
            requirejs(paths, function(v){
                var result = null;
                _.each(arguments, function(arg){
                    if (arg && !result) result = arg;
                },this)
                cb.call(self,null,result)
            });
        };
    };

    // todo - complete this based on socket io
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

        var camel = function (options) {
            this.loaders = {local:new localloader(), remote:new remoteloader()}
            // where we add more from options?
            this.endpoints = {};

            this.preload = options && options.preload || ['expr','process'];
            Q.longStackJumpLimit = options && options.longStackJumpLimit || 0;

            this.loaderFn = {};
            _.each(this.loaders,function(loader,key){
                this.loaderFn[key] = Q.nfbind(_.bind(loader.load,loader));
            },this);
        };
        camel.fn = camel.prototype;


        camel.fn._load = function(name, loader){
            return this.loaderFn[loader](name);
        }

        camel.fn.configure = function(definition){
            // first init the basics
            var promise = this.configuration;
            var loadall = this.loadall;

            if (!loadall || !promise){
                promise = this.loadAll(this.preload);
                this.loadall = true;
            }
            var self = this;
            if (definition){
                promise.then(_.bind(definition, this));

            }
            this.configuration = promise;
            return this;
        }

        camel.fn.events = function () {
            if (!this.ee){
                this.ee = new events.EventEmitter();
                this.ee.setMaxListeners(0);
            }
            return this.ee;
        }

        camel.fn.loadAll = function(name1, name2, others){
            var loads =[];
            _.each(_.flatten(arguments), function(name){
                loads.push(this.load({component:name, container:'local'}));
            },this);
            return Q.allResolved(loads);
        }

        camel.fn.load = function (endpoint) {
//            var name = endpoint.component, container = endpoint.container;

            var self = this;
            if (!this.cps) this.cps = {};

            var comp=  this.cps[endpoint.component];
            if (comp) return Q.fcall(function(){return comp});

            var config = function(c,cb){
                if (c && c.config)
                    c.config(self,function(){
                        cb(null,c);
                    });
                cb(null,c);
            }
            var qconfig = Q.nfbind(config);

            var save = function(c){
                if (c) {
                    self.cps[endpoint.component] = c;
                }
                return c;
            }

            var look = _.bind(function(ep){
//                if (comp) return Q.fcall(function(){return 'cream'});

                if (!ep.container || ep.container == 'local'){
                    return this._load(ep,'local').then(qconfig).then(save);
                }
                return this._load(ep,'remote').then(qconfig).then(save);

            },this);

            return look(endpoint);
        };

    /**
     * an array of objects
     * @param arg
     * @return {Object}
     */
        camel.fn.parseEndpoint = function (arg) {
            var s = arg.shift().split(':', 3);
            var container = (s.length == 3) ? s.shift() : null, component = s.shift(), object = s.shift();
            var idx = object.indexOf('?');
            if (~idx){
                arg.unshift(q.parse(object.substring(idx+1)))
                object = object.substring(0, idx);
            }
            var obj = _.extend.apply(_, [{}].concat(arg));
            var tail = (arg.length)? '?'+cutils.normalize(arg) : '';
            var id = component+':'+object+ tail;

            return {id:id, component:component, container:container, object:object, args:obj};
        }

        camel.fn.newExchange = function () {
            return _.extend({}, exchange,{id:uuid.v4()});
        }

        camel.fn.from = function (arg) {
            var r = new route(this);
            if (!this.routes) this.routes = {};
            this.routes[r.id] = r;
            return r.to(arg);
        };


        /**
         * Start all routes or pass routes to start as arguments
         * @param route1
         * @param route2
         * @param more
         */
        camel.fn.start = function (route1, route2, more) {
            if (!this.configuration){
                this.configure();
            }
            var args = _.toArray(arguments);
            var callback = function(){};
            if (typeof args[args.length-1] == 'function'){
                callback = args.pop();
            }

            var routeArray = _.bind(function(){
                var builder = [];
                _.each(this.routes,function(r){
                    if (!r.built)
                        builder.push(r.build());
                },this);
                return builder;
            },this);

            var start = _.bind(function(){
                _.each(args.length ? args : this.routes, function (v, k) {
                    var r = (typeof v == 'string') ? this.routes[v] : v;
                    if (r && r.built) {
                        this.events().emit(r.startEvent());
                    } else {
                        throw new Error('route does not exist [' + v + '] or did not build');
                    }
                },this);
            },this);

            return this.configuration.then(routeArray).then(function(b){
                return Q.allResolved(b)
            }).then(start).done(callback);
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

        camel.fn.endpoint = function(end,cb){
            var parsed = this.parseEndpoint([end]);
            var self = this;
            if (self.endpoints[parsed.id]){
                return Q.fcall(function(){
                    cb(self.endpoints[parsed.id].instance)
                });
            } else {
                var r = this.from(end);
                return r.build().then(function(){
                    var ep = self.endpoints[r.route[0].id];
                    cb(ep && ep.instance);
                });
            }
        }
        camel.fn.send = function(routeId, body, cb){
            var ex = this.newExchange(routeId);
            ex.out.body = body;
            this.events().emit(routeId, ex);
        }

        camel.fn.print = function () {
            console.log('\nConfiguration'.title);
            console.log('=============================================================================================='.line);
            console.log('Plugins'.section);
            console.log('+  loaded:'.data,_.keys(this.cps).join(', ').interest);
            console.log('Active Endpoints:'.section);
            _.each(this.endpoints, function(ep,key){
                console.log('+  endpoint'.data,('('+key+')').emphasis);
                if (ep.config.recipientList){
                    _.each(_.pluck(ep.config.recipientList,'id'), function(e){
                        console.log('       |- fires'.data,e.interest);
                    })
                } else {
                    console.log('       |- fires'.data, 'nothing'.interest)
                }
//                var count = 0;
//                var listeners = this.ee.listeners(key);
//                if (listeners)
//                    count = listeners.length;
//                console.log('\t\tlistener count : ',count)

            },this)
            console.log('Active Routes:'.section);
            _.each(this.routes, function(r){
                console.log('+  route'.data, ('('+r.id+')').interest);
                console.log('       |- sequence'.data,('('+_.pluck(r.route,'id').join(') -> (')+')').emphasis)
            },this)
            console.log('Active Loaders:'.section);
            _.each(this.loaders, function(l,key){
                if (l && l.paths)
                    console.log('+'.data,key,' loads from '.data,_.values(l.paths).join(',').emphasis);
            })

            console.log('Other:'.section);
            console.log('+ preload:'.data,(this.preload.join(', ')).interest)
            console.log('+ setting'.data,'longStackJumpLimit='.interest,(Q.longStackJumpLimit+'').interest)
            console.log('=============================================================================================='.line);

        }

        camel.fn.mixin = function(name, f){
            //todo look at underscore to make this better..
            if (this.route_type[name])
                throw new Error('mixin collision! ',name);
            this.route_type[name] = f;
        }
        camel.fn.route_type = route.fn;


    // remove singleton
//        return camel;
//    }).call(this);
//    return singleton;

    return camel;
});