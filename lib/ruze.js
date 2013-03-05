if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define([ 'require', 'node-uuid', 'events', 'underscore', 'q', 'cutils', 'colors', 'exprjs', 'module', 'path'],
//    function (uuid, events, _, Q, cutils, colors, exprjs, module, path) {
    function (require) {

    var uuid = require('node-uuid'), events = require('events'), _ = require('underscore'), Q = require('q'),
        cutils = require('cutils'), colors = require('colors'), exprjs = require('exprjs'), module = require('module'),
        path = require('path');

    var dirname = path.dirname(module.uri);


    // todo - should we spell out exceptions .fail() and .progress() using Q or just have the default handler catch them on done()?

    var endpoint = {id:null, container:null, component:null, object:null, args:{}};
//    var init_endpoint = {id:null, container:'local', component:'route'}
    var exchange = {in:{header:{},recipientList:null}, out:{header:{},recipientList:null}, properties:{}, id:null, error:null, fromEndpoint:null};
    var component = {name:null, loaded:false, container:null};

    var route = function (ruze,name) {
        this.id = uuid.v4();
        this.route = [];
        this.ruze = ruze;

        //optional
        this.name = name;
    };
    route.fn = route.prototype;

    route.fn.to = function (arg) {
        var ruze = this.ruze;
        var ep = ruze.parseEndpoint(Array.prototype.slice.call(arguments, 0));
        var last = _.last(this.route);
        if (last) {
            if (!last.recipientList) last.recipientList = [];
            var next = _.extend({}, ep);
            if (next.recipientList) delete next.recipientList;
            last.recipientList.push(next.id);
        }
//        ep.prior = (!this.route.length)? _.extend({}, init_endpoint, {id:this.startEvent()}) : _.extend({},_.last(this.route));
//        if (ep.prior.prior) delete ep.prior.prior;
        this.route.push(ep);
        return this;
    };

    route.fn.endpoint = function (instance) {
        var route = this.route, ruze = this.ruze;
        if (route && route.length > 0) {
            var ep = route[route.length - 1];
            if (ep.id)
                ruze.endpoints[ep.id] = {instance:instance, config:ep};
        }
        return this;
    }

    route.fn.build = function (cb) {
        var builders = [];
        _.each(this.route, function (ep) {
            builders.push(this.buildEndpoint(ep));
        }, this);
        var self = this;
        var success = Q.fcall(function () {
            self.built = true;
            return self;
        });
//        var fail = Q.fcall(function(){
//            self.built = false;
//            return self;
//        });
        return Q.allResolved(builders).then(success);
    }

    route.fn.buildEndpoint = function (ep) {
        var self = this;
        var ruze = this.ruze;
        return ruze.load(ep)
            .then(function (component) {
                var endpoint = ruze.endpoints[ep.id];
                var instance = endpoint && endpoint.instance;
                if (!instance && component) {
                    var options = ruze.options && ruze.options.plugins && ruze.options.plugins[ep.component];
                    instance = new component(options);
                    endpoint = ruze.endpoints[ep.id] = {instance:instance, config:ep};
                    if (instance.initialize)
                        instance.initialize(ep, ruze, this);
                } else if (!component) {
                    throw new Error('error, component didn\'t load for ', ep.component);
                }
                if (ep.recipientList) {
                    // add up all recipients
                    if (!endpoint.config.recipientList) endpoint.config.recipientList = [];
                    endpoint.config.recipientList = _.extend([],_.union(endpoint.config.recipientList, ep.recipientList));
                }
                return instance;
            }, function (e) {
                throw new Error(e);
            })
            .then(function (instance) {
                self.init(ep, instance)
            });
    }

    route.fn.startEvent = function () {
        return (this.route.length) ? this.route[0].id : null;
    }
//    route.fn.stopEvent = function () {
//        return 'stop-' + this.id;
//    }


    route.fn.init = function (endpoint, instance) {
        var ruze = this.ruze;
        var self = this;
        var ep = endpoint;

        var listeners = ruze.events().listeners(ep.id);
        if (!listeners || !listeners.length) {
            ruze.events().on(ep.id, function (exchange) {
                if (!exchange) {
                    if (instance.consume) {
                        instance.consume(function (err, e) {
                            if (err) throw err;
                            e.fromEndpoint = _.clone({},ep);
                            ruze.emitRecipients(ep, e);
                        });
                    }
                } else {
                    if (exchange.out || !_.isEmpty(exchange.out))
                        exchange.in = exchange.out;
                    exchange.out = {header:{}, recipientList:null};

                    if (instance.produce) {
                        instance.produce(exchange, function (err, e) {
                            if (err) throw err;
                            e.fromEndpoint = _.clone({},ep);
                            ruze.emitRecipients(ep, e);
                        });
                    } else {
                        throw new Error('produce called, but no produce method on endpoint', ep);
                    }
                }
            })
//            endpoint.initialized = true;
        }

//
//        }
    }

    var localloader = function () {

        this.paths = [dirname + '/plugin'];
        this.addPath = function (path) {
            this.paths.push(path)
        };
        this.load = function (ep, cb) {
            var self = this;
            var name = ep.component;
            var paths = this.paths.map(function (p) {
                return p + '/' + name + '/' + name + '.js'
            })
            requirejs(paths, function (v) {
                var result = null;
                _.each(arguments, function (arg) {
                    if (arg && !result) result = arg;
                }, this)
                cb.call(self, null, result)
            });
        };
    };

    //  on their own without the need for a full route rebuild in the remote site.

    var remotecomponent = function (socket, ruze, endpoint) {

        this.socket = socket;
//        this.endpoints = {};
        this.ruze = ruze;
        this.endpoint = endpoint;
        this.id = uuid.v4();

        var self = this;

        // this needs to be loaded remotely
            // this accepts incoming requests
        socket.on(PROCESS_CHANNEL,function(data){
//            console.log('rc client',PROCESS_CHANNEL,data)
            if (data.endpoint.id == self.endpoint.id)
                data.exchange.out = data.exchange.in;
                ruze.emitRecipients(self.endpoint, data.exchange);
        })

    };

    remotecomponent.fn = remotecomponent.prototype;

    remotecomponent.fn.produce = function (exchange, cb) {
//        console.log('rc client',PROCESS_CHANNEL,exchange)
        // make a remote call to the server to set it up

        var clone = _.extend({},exchange);
        delete clone.fromEndpoint.recipientList;

        this.socket.emit(PROCESS_CHANNEL,{id:this.ruze.id, endpoint:this.endpoint,exchange:clone}, function(data){
            var e = data.exchange;
            e.in = e.out;
            cb(null,e);
        })
    }


    var RUZE = 'ruze';
    var ID_CHANNEL = RUZE + '.id';
    var SEARCH_CHANNEL = RUZE + '.search';
    var LOAD_CHANNEL = RUZE + '.load';
    var PROCESS_CHANNEL = RUZE + '.process';


    var remoteloader = function (ruze) {

        var io = ruze.options && ruze.options.io;
        var listen = ruze.options && ruze.options.listen;
        var connect = ruze.options && ruze.options.connect;

        if (io){
            // check in options, is there anything to bind to?
            //var listen = ruze.options && ruze.options.containers;

            if (listen){


                //var server = this.listenSocket = io.listen(listen);
                io.on('connection', function(socket){

                    socket.on(ID_CHANNEL, function(name, fn){
                        console.log('server',ID_CHANNEL)
                        fn({id:ruze.id})
                    })

                    // searching for components on other servers...
                    socket.on(SEARCH_CHANNEL,function(data){
                        console.log('server',SEARCH_CHANNEL)
                        // looking for a component..
                        if (data.request && data.component && _.contains(_.keys(ruze.cps), data.component)){
                            socket.emit(SEARCH_CHANNEL,{id:ruze.id, component:data.component})
                        }
                    });

                    // tell another server to build one
                    socket.on(LOAD_CHANNEL,function(data, fn){
                        console.log('server',LOAD_CHANNEL)

                        // looking for a component..
                        if (data.id && data.endpoint && data.endpoint.component){

                            // clone to mak3 it local - rewrite
                            var local = _.extend({},data.endpoint);
                            local.container = 'local';
                            ruze.rewriteEndpointId(local);

                            var entry = _.extend({},data.endpoint);
                            entry.recipientList = [local.id];

                            // is it already loaded?
                            var entryEp = ruze.endpoints[entry.id];


                            if (!entryEp){
                                // setup a way to comm back to the client
                                var entryRC = new remotecomponent(socket,ruze,entry);
                                var promise = ruze.endpoint(local.id, function(instance, ep){

                                    if (!ep.recipientList){
                                        ep.recipientList = [entry.id];
                                    } else {
                                        ep.recipientList.push(entry.id);
                                    }
                                });
//                                ruze.from(entry.id).endpoint(entryRC).build()
                                promise.then(function(){
                                    return ruze.endpoint(entry.id,function(){
                                        fn(data);
                                    },entryRC,[local.id])
                                }).done();
//                                ruze.from(entry.id).build()
//                                    .then(promise).then().done();
                            } else {
                                fn(data)
                            }
                        } else {
                            fn({})
                        }
                    });
                })
            }
            this.connections = {};

            this._ready = _.bind(function(channel, cb){
                var client = this.connections[channel.name]
                if (!client || !client.ready || !client.id){
                    client = {};
                    client.socket = io.connect(channel.url);
                    var self = this;
                    client.socket.on('connect', function () {
                        client.socket.emit(ID_CHANNEL,ruze.id, function(data){
                            client.id = data.id;
                            client.url = channel.url;
                            client.ready = true;
                            self.connections[channel.name] = client;
                            cb(null,client);
                        });
                    });
                } else {
                    cb(null,client);
                }

            },this);
        }
        this.load = function (ep, cb) {

            if (!this.ready)
                this.ready = Q.nfbind(this._ready);


            var name = ep.component;
            var container = ep.container;
            var channel = connect[container];
            var self = this;

            if (container && !channel)
                throw new Error('you specified a container that is not configured '+container);

            if (this.ready){
                // one place to go
                if (channel){
                    this.ready({name:container,url:channel})
                        .then(function(client){
                            // emit an event to load stuff up


                            client.socket.emit(LOAD_CHANNEL,{id:ruze.id, endpoint:ep},function(data){
                                // its ready to go.
                                var rc = new remotecomponent(client.socket, ruze, ep);

                                ruze.endpoints[data.endpoint.id] = {config:data.endpoint, instance:rc}

                                cb(null,remotecomponent);

                            })

                        }).done();
                } else {
                    // gotta go find it and pick one..

                    console.log('NOT READY TO DO SEARCHING QUITE YET')

                }

            } else {
                throw new Error('remoting is not connected to anything, nothing provided on setup');
            }
        };
    };

    var ruze = function (options) {
        this.options = options;

        this.id = options && options.id || uuid.v4();

        this.loaders = {local:new localloader(), remote:new remoteloader(this)}
        // where we add more from options?
        this.endpoints = {};


        this.preload = options && options.preload || ['expr', 'when', 'process'];
        //Q.longStackJumpLimit = options && options.longStackJumpLimit || 0;

        this.loaderFn = {};
        _.each(this.loaders, function (loader, key) {
            this.loaderFn[key] = Q.nfbind(_.bind(loader.load, loader));
        }, this);
    };
    ruze.fn = ruze.prototype;

    ruze.fn.ids = function(){
        var ids = [this.id];
        if (this.loaders && this.loaders.remote && this.loaders.remote.connections){
            ids = _.union(ids, _.keys(this.loaders.remote.connections));
        }
        return ids;
    }

    ruze.fn._load = function (name, loader) {
        return this.loaderFn[loader](name);
    }

    ruze.fn.configure = function (definition) {
        // first init the basics
        var loadDefinition = _.bind(function(){
            if (typeof definition == 'string'){
                // load from text
                var obj = JSON.parse(config);
                this.configFromObject(obj)
            } else if (typeof definition == 'function'){
                definition();
            } else {
                throw new Error('ruze cannot parse configuration with value of '+(typeof definition));
            }
        },this);

        var promise = this.configuration;
        var loadall = this.loadall;

        if (!loadall || !promise) {
            promise = this.loadAll(this.preload);
            this.loadall = true;
        }
        var self = this;
        if (definition) {
            promise.then(loadDefinition);
        }
        this.configuration = promise;
        return this;
    }

    ruze.fn.events = function () {
        if (!this.ee) {
            this.ee = new events.EventEmitter();
            this.ee.setMaxListeners(0);
        }
        return this.ee;
    }

    ruze.fn.emitRecipients = function (endpoint, exchange) {
        var ruze = this;
        // exchange overrides
        var rl = (exchange.out && exchange.out.recipientList)? exchange.out.recipientList : endpoint.recipientList;
        if (rl) {
            _.each(rl, function (recip) {

                //todo:  if we extend exchange, should it get a new uuid - is it part of the original or a new thing?
                var e = _.extend({}, exchange);
                e.out.recipientList = null;
                e.in.recipientList = null;
                ruze.events().emit((recip.id)?recip.id:recip, e);
            }, this)
        }
    }

    ruze.fn.loadAll = function (name1, name2, others) {
        var loads = [];
        _.each(_.flatten(arguments), function (name) {
            loads.push(this.load({component:name, container:'local'}));
        }, this);
        return Q.allResolved(loads);
    }

    ruze.fn.load = function (endpoint) {
//            var name = endpoint.component, container = endpoint.container;

        var self = this;
        if (!this.cps) this.cps = {};

        var comp = this.cps[endpoint.component];
        if (comp) return Q.fcall(function () {
            return comp
        });

        var config = function (c, cb) {
            if (c && c.config)
                c.config(self, function () {
                    cb(null, c);
                });
            cb(null, c);
        }
        var qconfig = Q.nfbind(config);

        var save = function (c) {
            if (c) {
                self.cps[endpoint.component] = c;
            }
            return c;
        }

        var look = _.bind(function (ep) {
//                if (comp) return Q.fcall(function(){return 'cream'});

            if (!ep.container || ep.container == 'local') {
                ep.container = 'local';
                this.rewriteEndpointId(ep);
                return this._load(ep, 'local').then(qconfig).then(save);
            }
            return this._load(ep, 'remote').then(qconfig).then(save);

        }, this);

        return look(endpoint);
    };

    /**
     * an array of objects
     * @param arg
     * @return {Object}
     */
    ruze.fn.parseEndpoint = function (arg) {
        var s = arg.shift().split(':', 3);
        var container = (s.length == 3) ? s.shift() : null, component = s.shift(), object = s.shift();
        var idx = object.indexOf('?');
        if (~idx) {
            var args = object.substring(idx + 1);
            arg = _.object(_.map(args.split('&'), function (v, k) {
                return v.split('=')
            }));
            object = object.substring(0, idx);
        }
        var obj = _.extend.apply(_, [
            {}
        ].concat(arg));

        var endpoint = {component:component, container:container, object:object, args:obj}
        this.rewriteEndpointId(endpoint);

        return endpoint;
    }

    ruze.fn.rewriteEndpointId = function(endpoint){
        var tail = (endpoint.args && endpoint.args.length) ? '?' + cutils.normalize(endpoint.args) : '';
        var id = (endpoint.container)?
            endpoint.container + ':' + endpoint.component + ':' + endpoint.object + tail  :
            endpoint.component + ':' + endpoint.object + tail;

        endpoint.id = id;

    }

    ruze.fn.newExchange = function () {
        return _.extend({}, exchange, {id:uuid.v4()});
    }

    ruze.fn.from = function (arg,name) {
        var r = new route(this,name);
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
    ruze.fn.start = function (route1, route2, more) {
        if (!this.configuration) {
            this.configure();
        }
        var args = _.toArray(arguments);
        var callback = function () {
        };
        if (typeof args[args.length - 1] == 'function') {
            callback = args.pop();
        }

        var routeArray = _.bind(function () {
            var builder = [];
            _.each(this.routes, function (r) {
                if (!r.built)
                    builder.push(r.build());
            }, this);
            return builder;
        }, this);

        var start = _.bind(function () {
            _.each(args.length ? args : this.routes, function (v, k) {
                var r = (typeof v == 'string') ? this.routes[v] : v;
                if (r && r.built) {
                    this.events().emit(r.startEvent());
                } else {
                    throw new Error('route does not exist [' + v + '] or did not build');
                }
            }, this);
        }, this);

        return this.configuration.then(routeArray).then(function (b) {
            return Q.allResolved(b)
        }).then(start).done(callback);
    }

    /**
     *
     * @param route1
     * @param route2
     * @param more
     */
    ruze.fn.stop = function (route1, route2, more) {
        _.each(arguments.length ? arguments : this.routes, function (v, k) {
            var r = typeof v == 'string' ? this.routes[v] : v;
            if (r) {
                this.events().emit(r.stopEvent());
            } else {
                console.log('route does not exist [' + v + ']');
            }
        }, this)
    }

    ruze.fn.endpoint = function (end, cb, instance, recipients) {
        var parsed = this.parseEndpoint([end]);
        var self = this;
        if (self.endpoints[parsed.id]) {
            return Q.fcall(function () {
                cb(self.endpoints[parsed.id].instance, parsed)
            });
        } else {
            var r = new route(self);
            if (!this.routes) this.routes = {};
            this.routes[r.id] = r;
                r.to(end);
            if (instance){
                r.endpoint(instance);
            }

            return r.build().then(function () {
                var ep = self.endpoints[r.route[0].id];

                if (recipients){
                    ep.config.recipientList = recipients;
                }
                if (cb)
                    cb(ep && ep.instance,ep.config);
            });
        }
    }
    ruze.fn.send = function (routeId, body, cb) {
        var ex = this.newExchange(routeId);
        ex.out.body = body;
        this.events().emit(routeId, ex);
    }

    if (colors) {
        colors.setTheme({
            label:'grey',
            line:'grey',
            section:'black',
            interest:'black',
            emphasis:'red'
        });
    }

    ruze.fn.print = function () {
        var print = '';
        print += ('Configuration'.interest);
        print += '\n' + ('=============================================================================================='.line);
        print += '\n' + ('Plugins'.section);
        print += '\n' + ('+  loaded:'.label + _.keys(this.cps).join(', ').interest);
        print += '\n' + ('Active Endpoints:'.section);
        _.each(this.endpoints, function (ep, key) {
            print += '\n' + ('\+  endpoint'.label + ('(' + key + ')').emphasis);
            if (ep.config.recipientList) {
                _.each(_.pluck(ep.config.recipientList, 'id'), function (e) {
                    if (e)
                        print += '\n' + ('       |- fires '.label + e.interest);
                })
            } else {
                print += '\n' + ('       |- fires '.label + 'nothing'.interest)
            }
//                var count = 0;
//                var listeners = this.ee.listeners(key);
//                if (listeners)
//                    count = listeners.length;
//                print+='\n'+('\t\tlistener count : ',count)

        }, this)
        print += '\n' + ('Active Routes:'.section);
        _.each(this.routes, function (r) {
            print += '\n' + ('+  route'.label + ('(' + r.id + ')').interest);
            print += '\n' + ('       |- sequence '.label + ('(' + _.pluck(r.route, 'id').join(') -> (') + ')').emphasis)
        }, this)
        print += '\n' + ('Active Loaders:'.section);
        _.each(this.loaders, function (l, key) {
            if (l && l.paths)
                print += '\n' + ('+ '.label + key + ' loads from '.label + _.values(l.paths).join(',').emphasis);
        })

        print += '\n' + ('Other:'.section);
        print += '\n' + ('+ preload: '.label + (this.preload.join(', ')).interest)
        print += '\n' + ('+ setting '.label + 'longStackJumpLimit='.interest + (Q.longStackJumpLimit + '').interest)
        print += '\n' + ('=============================================================================================='.line);
        return print;

    }

    ruze.fn.mixin = function (name, f) {
        //todo look at underscore to make this better..
        if (this.route_type[name])
            throw new Error('mixin collision! ', name);
        this.route_type[name] = f;
    }
    ruze.fn.route_type = route.fn;


    ruze.fn.configFromObject = function(json){
        var routes = [];
        if (json.plugins){
            if (!this.options) this.options = {};
            this.options.plugins = json.plugins;
        }

        // do the routes..
        _.each(json.routes, function(route){
            var name = route.name;
            var routeBuild = this;
            if (route.route){
                _.each(route.route, function(obj){
                    var func = _.keys(obj)[0];
                    var val = _.values(obj)[0];

                    if (routeBuild && routeBuild[func]){
                        routeBuild = routeBuild[func].call(routeBuild,val);
                    } else {
                        throw new Error('ruze does not support function "'+func+'"')
                    }
                },this)
            }
            if (routeBuild)
                routes.push(routeBuild.id);
        },this);

        return routes;
    }

    ruze.fn.routesToObject = function(routes){
        var result = {};
        result.routes = [];

        _each(routes, function(route){
            var r = {route:[]};
            r.name = route.name;
            r.id = route.id;
            var first = true;
            var priorContainer = null;
            _each(route.route, function(obj){
                var ep = (obj.id) ? obj : this.parseEndpoint(obj);

                // look it up
                var component = this.cps[obj.component];

                // if it has a to Object method..
                if (component.toObject){
                    r.route.push(component.toObject(ep));
                } else if (first){
                    r.route.push({from:ep.id});
                } else {
                    r.route.push({to:ep.id});
                }
                first = false;

            },this);
            result.routes.push(r)
        },this)
        return result;
    }


    // remove singleton
//        return ruze;
//    }).call(this);
//    return singleton;

    return ruze;
});