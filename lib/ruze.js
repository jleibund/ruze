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
            last.recipientList.push(next);
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

    route.fn.recipientList = function (expression) {
        //
    }

    // todo - move all building, impl, etc to ruze, shouldn't be in route anymore

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
//                    endpoint.config.recipientList = _.uniq(_.union(endpoint.config.recipientList,ep.recipientList),function(a,b){return a.id == b.id});
                    endpoint.config.recipientList = _.union(endpoint.config.recipientList, ep.recipientList);
                }
                return instance;
            }, function (e) {
                throw new Error(e);
            })
            .then(function (instance) {
                self.init(ep, instance)
            });
    }

    // todo - we may still need this for remote plugins.  we need a route.build() method with a promise and/or join

    route.fn.startEvent = function () {
        return (this.route.length) ? this.route[0].id : null;
    }
//    route.fn.stopEvent = function () {
//        return 'stop-' + this.id;
//    }

    route.fn._emitRecipients = function (endpoint, exchange) {
        var ruze = this.ruze;
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
                            e.fromEndpoint = ep;
                            self._emitRecipients(ep, e);
                        });
                    }
                } else {
                    if (exchange.out || !_.isEmpty(exchange.out))
                        exchange.in = exchange.out;
                    exchange.out = {header:{}, recipientList:null};

                    if (instance.produce) {
                        instance.produce(exchange, function (err, e) {
                            if (err) throw err;
                            e.fromEndpoint = ep;
                            self._emitRecipients(ep, e);
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

    // todo - complete this based on socket io
    //  on their own without the need for a full route rebuild in the remote site.

    var remotecomponent = function (socket, ruze) {
        // todo need to check for multiple registrations

        this.socket = socket;
        this.endpoints = {};
        this.ruze = ruze;

        var self = this;

        socket.on(LOAD_CHANNEL,function(data){
            console.log('client',LOAD_CHANNEL,data)
            self.endpoints[data.endpoint.id] = data.endpoint;
        })

        socket.on(PROCESS_CHANNEL,function(data){
            console.log('client',PROCESS_CHANNEL,data)
            if (self.endpoints[data.endpoint.id]){
                self.ruze._emitRecipients(data.endpoint, data.exchange);
            }
        })


    };

    remotecomponent.fn = remotecomponent.prototype;

    remotecomponent.fn.add = function(endpoint){
        this.endpoints[endpoint.id] = endpoint;
    }

//    remotecomponent.fn.consume = function (cb) {
//    }
    remotecomponent.fn.produce = function (cb, exchange) {
        // make a remote call to the server to set it up
        this.socket.emit(PROCESS_CHANNEL,{id:this.ruze.id, exchange:exchange})
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

                    var listenRC = this.listenRC = new remotecomponent(socket,ruze);

                    socket.on(ID_CHANNEL, function(data){
                        console.log('server',ID_CHANNEL)
                        socket.emit(ID_CHANNEL,{id:ruze.id})
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
                    socket.on(LOAD_CHANNEL,function(data){
                        console.log('server',LOAD_CHANNEL)

                        // looking for a component..
                        if (data.id && data.endpoint && _.contains(_.keys(ruze.cps), data.endpoint.component)){


                            // clone to mak3 it local
                            var cloned = _.extend({},data.endpoint);
                            cloned.container = 'local';

                            // is it already loaded?
                            var endpoint = ruze.endpoints[cloned.id];
                            var returnEp = ruze.endpoints[data.endpoint.id];


                            if (!returnEp){
                                // setup a way to comm back to the client
                                ruze.to(data.endpoint.id).endpoint(listenRC);
                                listenRC.add(data.endpoint);
                            }

                            if (!endpoint){

                                // setup the actual endpoint
                                ruze.endpoint(cloned.id, function(instance, ep){
                                    ep.recipientList = [data.endpoint.id];

                                    socket.emit(LOAD_CHANNEL,{id:ruze.id, endpoint:ep})

                                    console.log(ruze.print());
                                }).done();

                            } else {
                                socket.emit(LOAD_CHANNEL,{id:ruze.id, endpoint:endpoint.config})
                            }
                        }
                    });

                    socket.on(PROCESS_CHANNEL, function(data){
                        console.log('server',PROCESS_CHANNEL)

                        if (data.endpoint && data.endpoint.id && data.exchange){


                            var cloned = _.extend({},data.endpoint);
                            cloned.container = 'local';

                            if (this.endpoints[cloned.id]){
                                ruze.send(cloned.id, data.exchange);
                            }

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
                        client.socket.emit(ID_CHANNEL,{id:ruze.id});
                    });
                    client.socket.on(ID_CHANNEL,function(data){
                        console.log('client',ID_CHANNEL,data)
                        client.id = data.id;
                        client.url = channel.url;
                        client.ready = true;
                        client.handler = new remotecomponent(client.socket, ruze);
                        self.connections[channel.name] = client;
                        cb(null,client);
                    })
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

            if (container && !channel)
                throw new Error('you specified a container that is not configured '+container);

            if (this.ready){
                // one place to go
                if (channel){
                    this.ready({name:container,url:channel})
                        .then(function(client){
                            // emit an event to load stuff up
                            client.handler.add(ep);
                            client.socket.emit(LOAD_CHANNEL,{id:ruze.id, endpoint:ep})

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
                this.defineUsingJSON(definition)
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
        var tail = (arg.length) ? '?' + cutils.normalize(arg) : '';
        var id = component + ':' + object + tail;

        return {id:id, component:component, container:container, object:object, args:obj};
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

    ruze.fn.endpoint = function (end, cb) {
        var parsed = this.parseEndpoint([end]);
        var self = this;
        if (self.endpoints[parsed.id]) {
            return Q.fcall(function () {
                cb(self.endpoints[parsed.id].instance, parsed)
            });
        } else {
            var r = this.from(end);
            return r.build().then(function () {
                var ep = self.endpoints[r.route[0].id];
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
                    print += '\n' + ('       |- fires'.label + e.interest);
                })
            } else {
                print += '\n' + ('       |- fires'.label + 'nothing'.interest)
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
            print += '\n' + ('       |- sequence'.label + ('(' + _.pluck(r.route, 'id').join(') -> (') + ')').emphasis)
        }, this)
        print += '\n' + ('Active Loaders:'.section);
        _.each(this.loaders, function (l, key) {
            if (l && l.paths)
                print += '\n' + ('+ '.label + key + ' loads from '.label + _.values(l.paths).join(',').emphasis);
        })

        print += '\n' + ('Other:'.section);
        print += '\n' + ('+ preload:'.label + (this.preload.join(', ')).interest)
        print += '\n' + ('+ setting'.label + 'longStackJumpLimit='.interest + (Q.longStackJumpLimit + '').interest)
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


    ruze.fn.defineUsingJSON = function(config){
        var json = JSON.parse(config);

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
        },this);

        // todo: remote servers
    }


    // remove singleton
//        return ruze;
//    }).call(this);
//    return singleton;

    return ruze;
});