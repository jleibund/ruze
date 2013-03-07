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
        this.inOut = false;

        //optional
        this.name = name;
    };
    route.fn = route.prototype;

    route.fn.inOut = function(){
        this.inOut = true;
    }

    route.fn.inOnly = function(){
        this.inOut = false;
    }

    route.fn.to = function (arg) {
        var ruze = this.ruze;
        var ep = ruze.parseEndpoint(Array.prototype.slice.call(arguments, 0));
        this.route.push(ep);
        return this;
    };

    route.fn.endpoint = function (instance, container) {
        var route = this.route, ruze = this.ruze;
        if (route && route.length > 0) {
            var ep = route[route.length - 1];
            if (!ep.container)
                ep.container = (container)? container : 'local';
            this.ruze.rewriteEndpointId(ep);
            ruze.loaders.local.endpoints[ep.id] = {instance:instance, config:ep};
        }
        return this;
    }


    // step 1 is loading
    route.fn._load = function(){
        var self = this;
        var components = _.pluck(this.route,'component');
        // call load using our route, make sure we save off what options we have with the loaders
        return this.ruze._load(components).then(function(obj){ self.loaderComponents = obj; });
    }

    // step two is a bind strategy
    route.fn._bindStrategy = function(){

        var ruze = this.ruze;

        // todo: for now this is fixed.

        // keep track of prior so we have 'runs'
        var priorContainer = null;
        var loaderComponents = this.loaderComponents;

        if (!loaderComponents)
            throw new Error('you are running a bind strategy but never did _load')

        var runs = [], curRun;
        for (var i=0; i< this.route.length; i++){
            var curEp = this.route[i];
            var prevEp = (i>0)? this.route[i-1] : null;

            // first check the container for the current one
            var curContainer = curEp.container;
            if (curContainer){
                // we are starting a new run.
                if (curContainer != priorContainer){
                    curRun = [];
                    runs.push(curRun);
                }
                priorContainer = curContainer;
                curRun.push(curEp);
            } else if (priorContainer) {
                // set the current one to prior - creating 'runs'
                curContainer = priorContainer;
                curEp.container = priorContainer;
                ruze.rewriteEndpointId(curEp)
                curRun.push(curEp);
            } else {

                // get the next number of N components with no container..
                var lookForward = [curEp.component];
                for (var j=i; j<this.route.length;j++){
                    var next = this.route[j];

                    // also no container assigned?
                    if (next.container) break;

                    lookForward.push(next.component);
                }

                // lets look around... start with local, first it needs to contain ours
                var bestContainer = null;

                var localLoader = loaderComponents.local;

                // local always wins by default
                if (localLoader && _.contains(localLoader,curEp.component)){
                    bestContainer = 'local';
                } else {
                    var bestNum = 0;
                    _.each(loaderComponents,function(list,k){

                        var isLocal = (k == 'local');

                        var num = _.intersection(list,lookForward).length;

                        if (num > bestNum){
                            bestNum = num;
                            bestContainer = k;
                        } else if (num == bestNum){
                            if (bestContainer != 'local')
                                bestContainer = k;
                        }
                    })
                }

                // if we don't have a container, there's a problem
                if (!bestContainer)
                    throw new Error('there are not any containers that satisfy this progression: '+lookForward);

                curEp.container = bestContainer;
                priorContainer = bestContainer;
                ruze.rewriteEndpointId(curEp)
                curRun = [];
                runs.push(curRun);
                curRun.push(curEp);
            }
        }
        return runs;
    };


    // step 3
    route.fn._configure = function(){
        // call load using our route, make sure we save off what options we have with the loaders
        var components = _.pluck(this.route,'component');
        return this.ruze._configure(components);
    };

    // step 4
    route.fn._create = function(){
        var self = this;
        // call load using our route, make sure we save off what options we have with the loaders
        return this.ruze._create(this.route).then(function(){self.built = true});
    }


    route.fn.startEvent = function () {
        return (this.route.length) ? this.route[0].id : null;
    }
//    route.fn.stopEvent = function () {
//        return 'stop-' + this.id;
//    }


    route.fn.init = function (endpoint, instance) {
        var ruze = this.ruze;

//
//        }
    }

    var localloader = function (ruze) {

        this.paths = [dirname + '/plugin'];
        this.endpoints = {};
        this.components = {};
        this.ruze = ruze;
        this.load = Q.nfbind(_.bind(this._load,this));
        this.create = Q.nfbind(_.bind(this._create,this));
    }
    localloader.prototype.addPath = function (path) {
        this.paths.push(path)
    };


        // load is all about loading from requirejs, not instantiating anything.
    localloader.prototype._load = function (componentList, cb) {
            var self = this;
            var components = (this.components)? this.components : {};
            // these are all of the components requested.
            var requestedList = _.uniq(componentList);

            // is this already loaded?
            var loadedList = _.intersection(
                requestedList,
                _.keys(components)
            );

            // if everything is loaded, lets go with that.
            if ( _.isEqual(requestedList, loadedList) ){
                return cb.call(self,null,{local:loadedList})
            }

            var neededList = _.difference(requestedList, loadedList);

            var runPaths = _.extend([],this.paths);

            var runRequire = function(paths,cb) {

                if (!paths || _.isEmpty(paths)){
                    // run the callback
                    return cb.call(self,null,{local:loadedList})
                }

                var path = paths.shift();

                var lookup = _.map(neededList, function(name){ return path + '/' + name + '/' + name + '.js' })

                requirejs(lookup, function(){

                    // co-iterate through arguments and lookup
                    var replaceNeededList = neededList;
                    for (var j=0; j < lookup.length; j++){
                        var path = lookup[j];
                        var name = neededList[j]
                        var comp = arguments[j];
                        if (comp){
                            // we got a hit.  put it into our internal thing, remove from needed list, add to loadedList

                            components[name] = {config:false, component:comp};
                            loadedList.push(name);
                            replaceNeededList = _.without(neededList,name);

                            // now see if we can break or do we need to keep going?
                            if ( _.isEqual(requestedList, loadedList) )
                                return cb.call(self,null,{local:loadedList})

                        }
                    }
                    neededList = replaceNeededList;
                    // lets go to the next one..
                    runRequire(paths,cb);
                })
            }


            runRequire(runPaths,cb);
        };

        // returns a promise.. all endpoints after this will have components that are config'ed
        localloader.prototype.configure = function(componentList){
            var self = this, ruze = this.ruze, result = {};

            var components = this.components;

            var config = function (holder, cb) {
                var c = holder.component;
                if (c && c.config)
                    c.config(ruze, function () {
                        holder.config = true;
                        cb(null, c);
                    });
                holder.config = true;
                cb(null, c);
            }
            var qconfig = Q.nfbind(config);

            var configList = [];

            _.each(_.uniq(componentList), function(comp){
                var componentHolder = components[comp];

                // call config on any components that haven't done it yet
                if (!componentHolder.config){
                    configList.push(qconfig(componentHolder));
                }
            });
            return Q.allResolved(configList);
        };

        // now we're asked to create them
        localloader.prototype._create = function(endpointList,cb) {
            var self = this, ruze = this.ruze, result = {};

            var endpoints = this.endpoints;
            var components = this.components;
            _.each(endpointList, function(ep){
                var component = components[ep.component].component;
                var endpoint = endpoints[ep.id];
                var instance = endpoint && endpoint.instance;
                if (!instance && component) {
                    var options = ruze.options && ruze.options.plugins && ruze.options.plugins[ep.component];
                    instance = new component(options);
                    endpoint = endpoints[ep.id] = {instance:instance, config:ep};
                    if (instance.initialize)
                        instance.initialize(ep, ruze, this);
                    endpoint.initialized = true;
                } else if (instance && component && !endpoint.initialized){
                    if (instance.initialize)
                        instance.initialize(ep, ruze, this);
                    endpoint.initialized = true;
                } else if (!component) {
                    throw new Error('error, component didn\'t load for ', ep.component);
                }
                result[ep.id] = endpoint;
            },this);

            cb(null,result);
        };

    //  on their own without the need for a full route rebuild in the remote site.

    var remotecomponent = function (ruze, endpoint) {

        this.sockets = {};
//        this.endpoints = {};
        this.ruze = ruze;
        this.endpoint = endpoint;
        this.id = uuid.v4();

    };
    remotecomponent.fn = remotecomponent.prototype;

    remotecomponent.fn.addSocket = function(id,socket){
        var ruze = this.ruze, self = this;
        if (!_.contains(_.keys(this.sockets),id)){
            this.sockets[id] = socket;
            // this needs to be loaded remotely
                // this accepts incoming requests
            socket.on(PROCESS_CHANNEL,function(data){
                data.exchange.properties.client = data.id;
                if (data.endpoint.id == self.endpoint.id)
                    data.exchange.out = data.exchange.in;
                    ruze.emitRecipients(self.endpoint, data.exchange);
            })
        }
    }


    remotecomponent.fn.produce = function (exchange, cb) {
//        console.log('rc client',PROCESS_CHANNEL,exchange)
        // make a remote call to the server to set it up

        var clone = _.extend({},exchange);
        delete clone.fromEndpoint.recipientList;

        var sockets = (clone.properties.client) ? [this.sockets[clone.properties.client]] : this.sockets;

        _.each(sockets,function(socket){
            delete clone.properties.client;
            socket.emit(PROCESS_CHANNEL,{id:this.ruze.id, endpoint:this.endpoint,exchange:clone}, function(data){
                var e = data.exchange;
                e.in = e.out;
                cb(null,e);
            })
        },this);

    }


    var RUZE = 'ruze';
    var ID_CHANNEL = RUZE + '.id';
    var SEARCH_CHANNEL = RUZE + '.search';
    var LOAD_CHANNEL = RUZE + '.load';
    var CREATE_CHANNEL = RUZE + '.create';
    var PROCESS_CHANNEL = RUZE + '.process';


    var remoteloader = function (ruze) {

        this.endpoints = {};
        this.components = {};

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
                                var entryRC = new remotecomponent(ruze,entry);
                                entryRC.addSocket(data.id,socket);
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
                                entryEp.instance.addSocket(data.id,socket);
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
                                var rc = new remotecomponent(ruze, ep);
                                rc.addSocket(client.id, client.socket)

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
        this.configure = Q.nfbind(function(componentList,cb) {
            cb(null,{})
        });
        this.create = Q.nfbind(function(endpointList,cb) {
            cb(null,{})
        });
    };

    var ruze = function (options) {
        this.options = options;

        this.id = options && options.id || uuid.v4();

        this.loaders = {local:new localloader(this), remote:new remoteloader(this)}


        this.preload = options && options.preload || ['expr', 'when', 'process'];
        Q.longStackJumpLimit = options && options.longStackJumpLimit || 0;

    };
    ruze.fn = ruze.prototype;

    ruze.fn.ids = function(){
        var ids = [this.id];
        if (this.loaders && this.loaders.remote && this.loaders.remote.connections){
            ids = _.union(ids, _.keys(this.loaders.remote.connections));
        }
        return ids;
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
            var self = this;
            promise = this._load(this.preload,true)
                .then(function(){
                    return self._configure(self.preload,true)
                });
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
        var rl = (exchange.out && exchange.out.recipientList)? exchange.out.recipientList : this.getEndpoint(endpoint).config.recipientList;
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

    // pass in an endpoint, get back an array of who has it unless specified.
    ruze.fn._load = function (components, local) {
        return this._doLoaders('load',components,local);
    };

    ruze.fn._configure = function (components, local) {
        return this._doLoaders('configure',components,local);
    };

    ruze.fn._create = function (endpoints, local) {
        return this._doLoaders('create',endpoints,local);
    };

    ruze.fn._doLoaders = function(fn,arg,local){
        if (local)
            return this.loaders.local[fn](arg)
        // this is now simpler..  just run them through each loader.

        return this.loaders.local[fn](arg).then(function(obj){
            // todo add in remote later
            return obj;
        })
    }

    ruze.fn.getEndpoint = function(endpoint){
        var ep = null;
        _.each(this.loaders, function(v,k){
            var id = (endpoint.id)? endpoint.id : endpoint;
            if (v.endpoints[id])
                ep = v.endpoints[id];
        })
        return ep;
    }

    ruze.fn._buildRecipientsAndEvents = function(routes){
        // for each route
        // ok, now that we have that aligned, need to do the recipient Lists at the route level

        if (!routes)
            routes = this.routes;

        _.each(routes, function(route){
            var prevEp;
            _.each(route.route, function(curEp){
                var cur = this.getEndpoint(curEp);
                if (prevEp) {
                    // lets get the master items..
                    var prev = this.getEndpoint(prevEp);

                    if (!cur.config.recipientList) cur.config.recipientList = [];
                    if (!prev.config.recipientList) prev.config.recipientList = [];

                    prev.config.recipientList.push(cur.config.id);
                }

                // setup events
                var self = this;
                var instance = cur.instance;
                var listeners = self.events().listeners(curEp.id);
                if (!listeners || !listeners.length) {
                    self.events().on(cur.config.id, function (exchange) {
                        if (!exchange) {
                            if (instance.consume) {
                                instance.consume(function (err, e) {
                                    if (err) throw err;
                                    e.fromEndpoint = _.clone({},cur.config);
                                    self.emitRecipients(cur.config, e);
                                });
                            }
                        } else {
                            if (exchange.out || !_.isEmpty(exchange.out))
                                exchange.in = exchange.out;
                            exchange.out = {header:{}, recipientList:null};

                            if (instance.produce) {
                                instance.produce(exchange, function (err, e) {
                                    if (err) throw err;
                                    e.fromEndpoint = _.clone({},cur.config);
                                    self.emitRecipients(cur.config, e);
                                });
                            } else {
                                throw new Error('produce called, but no produce method on endpoint', ep);
                            }
                        }
                    })
                }
                prevEp = curEp;
            },this);
        },this)


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

        var self = this;


        return this.configuration.then(function () {
            if (!args || args.length==0){
                args = self.routes;
            }
            args = _.filter(args, function(arg){return !arg.built})

            var loading = _.map(args,function(a){
                return a._load()
            });

            return Q.allResolved(loading)
                .then(function(){
                    _.each(args,function(a){
                        a._bindStrategy();
                    });
//                    var binding = _.map(args,function(a){
//                        return Q.fcall(a._bindStrategy())
//                    });
//                    return Q.allResolved(binding);
                })
                .then(function(){
                    var configuring = _.map(args,function(a){ return Q.fcall(
                        a._configure())
                    });
                    return Q.allResolved(configuring);
                })
                .then(function(){
                    var creating = _.map(args,function(a){ return Q.fcall(
                        a._create())
                    });
                    return Q.allResolved(creating)
                })
                .then(function(){
                    return self._buildRecipientsAndEvents(args)
                });

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
        if (self.getEndpoint(parsed.id)) {
            return Q.fcall(function () {
                cb(self._findEndpointDescriptor[parsed.id].instance, parsed)
            });
        } else {
            var r = new route(self);
            if (!this.routes) this.routes = {};
            this.routes[r.id] = r;
                r.to(end);
            if (instance){
                r.endpoint(instance);
            }

            return r._load().then(function(){
                    return r._bindStrategy();
                }).then(function(){
                    return r._configure()
                }).then(function(){
                    return r._create()
                }).then(function () {
                    var ep = self.getEndpoint(r.route[0].id);

                    if (recipients){
                        ep.config.recipientList = recipients;
                    }
                    if (cb)
                        cb(ep && ep.instance,ep.config);
            });
        }
    }
    ruze.fn.send = function (endpoint, body, cb) {
        var ep = (endpoint.id) ? endpoint : this.parseEndpoint([endpoint]);
        if (!ep.container){
            ep.container = 'local';
            this.rewriteEndpointId(ep);
        }
        var ex = this.newExchange(ep.id);
        ex.out.body = body;
        this.events().emit(ep.id, ex);
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
        print += '\n' + ('Active Routes:'.section);
        _.each(this.routes, function (r) {
            print += '\n' + ('+  route'.label + ('(' + r.id + ')').interest);
            print += '\n' + ('       |- sequence '.label + ('(' + _.pluck(r.route, 'id').join(') -> (') + ')').emphasis)
        }, this)
        print += '\n' + ('Active Loaders:'.section);
        _.each(this.loaders, function (l, key) {
            if (l && l.paths)
                print += '\n' + ('+ '.label + key + ' loads from '.label + _.values(l.paths).join(',').emphasis);
            _.each(l.endpoints, function (ep, key) {
                print += '\n' + ('     |-  endpoint'.label + (' (' + key + ')').emphasis);
                if (ep.config.recipientList) {
                    _.each(ep.config.recipientList, function (e) {
                        if (e)
                            print += '\n' + ('         |- fires '.label + e.interest);
                    })
                } else {
                    print += '\n' + ('         |- fires '.label + 'nothing'.interest)
                }
            }, this)
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