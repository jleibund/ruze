if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define([ 'require', 'node-uuid', 'events', 'underscore', 'q', 'cutils', 'colors', 'exprjs', 'module', 'path'],
//    function (uuid, events, _, Q, cutils, colors, exprjs, module, path) {
    function (require) {

        var uuid = require('node-uuid'), events = require('events'), _ = require('underscore'), Q = require('q'),
            cutils = require('cutils'), colors = require('colors'), exprjs = require('exprjs'), module = require('module'),
            path = require('path'), md5 = cutils.md5;

        var dirname = path.dirname(module.uri);


        // todo - should we spell out exceptions .fail() and .progress() using Q or just have the default handler catch them on done()?

        var endpoint = {id:null, container:null, component:null, object:null, args:{}};
//    var init_endpoint = {id:null, container:'local', component:'route'}
        var exchange = {in:{header:{}, recipientList:null}, out:{header:{}, recipientList:null}, properties:{}, id:null, error:null, fromEndpoint:null};
        var component = {name:null, loaded:false, container:null};

        var route = function (ruze, name) {
            this.id = uuid.v4();
            this.route = [];
            this.instances = {};
            this.ruze = ruze;
            this.inOut = false;

            //optional
            this.name = name;
        };
        route.fn = route.prototype;

        route.fn.inOut = function () {

            // todo will need to add a correlation id to exchange.

            this.inOut = true;
        }

        route.fn.inOnly = function () {
            this.inOut = false;
        }

        route.fn.to = function (arg) {
            var ruze = this.ruze;
            var ep = ruze.parseEndpoint(Array.prototype.slice.call(arguments, 0));
            this.route.push(ep);
            return this;
        };

        route.fn.endpoint = function (instance) {
            var route = this.route, ruze = this.ruze;
            if (route && route.length > 0) {
                var ep = route[route.length - 1];

                // make a clone of it in local container for lookup later
                var clone = _.extend({},ep);
                clone.container = 'local';
                this.ruze.rewriteEndpointId(clone);

                this.instances[clone.id] = instance;
//                if (!ep.container)
//                    ep.container = (container) ? container : 'local';
//                ruze.loaders.local.endpoints[ep.id] = {instance:instance, config:ep};
            }
            return this;
        }

        route.fn._getComponents = function () {
            return _.pluck(this.route, 'component');
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
            this.load = Q.nfbind(_.bind(this._load, this));
            this.create = Q.nfbind(_.bind(this._create, this));
        }
        localloader.fn = localloader.prototype;
        localloader.fn.addPath = function (path) {
            this.paths.push(path)
        };


        // load is all about loading from requirejs, not instantiating anything.
        localloader.fn._load = function (strategy, cb) {
            var self = this;
            var components = (this.components) ? this.components : {};
            // these are all of the components requested.
            var requestedList = _.compact(_.uniq(strategy.components));

            // is this already loaded?
            var loadedList = _.intersection(
                requestedList,
                _.keys(components)
            );

            // if everything is loaded, lets go with that.
            if (_.isEqual(requestedList, loadedList)) {
                if (!strategy.loads) strategy.loads = {};
                strategy.loads.local = loadedList;
                return cb.call(self, null, strategy)
            }

            var neededList = _.difference(requestedList, loadedList);

            var runPaths = _.extend([], this.paths);

            var runRequire = function (paths, cb) {

                if (!paths || _.isEmpty(paths)) {
                    // run the callback
                    if (!strategy.loads) strategy.loads = {};
                    strategy.loads.local = loadedList;
                    return cb.call(self, null, strategy)
                }

                var path = paths.shift();

                var lookup = _.map(neededList, function (name) {
                    return path + '/' + name + '/' + name + '.js'
                })

                try {
                    requirejs(lookup, function () {

                        // co-iterate through arguments and lookup
                        var replaceNeededList = neededList;
                        for (var j = 0; j < lookup.length; j++) {
                            var path = lookup[j];
                            var name = neededList[j]
                            var comp = arguments[j];
                            if (comp) {
                                // we got a hit.  put it into our internal thing, remove from needed list, add to loadedList

                                components[name] = {config:false, component:comp};
                                loadedList.push(name);
                                replaceNeededList = _.without(neededList, name);

                                // now see if we can break or do we need to keep going?
                                if (_.isEqual(requestedList, loadedList)) {
                                    if (!strategy.loads) strategy.loads = {};
                                    strategy.loads.local = loadedList;
                                    return cb.call(self, null, strategy)

                                }
                            }
                        }
                        neededList = replaceNeededList;
                        // lets go to the next one..
                        runRequire(paths, cb);
                    })
                } catch (ex){
                    // keep moving
                    runRequire(paths, cb);
                } finally {

                }
            }


            runRequire(runPaths, cb);
        };

        // returns a promise.. all endpoints after this will have components that are config'ed
        localloader.fn.configure = function (strategy) {
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

            if (strategy && strategy.configure && strategy.configure.local) {
                _.each(_.uniq(strategy.configure.local), function (comp) {
                    var componentHolder = components[comp];

                    // call config on any components that haven't done it yet
                    if (!componentHolder.config) {
                        configList.push(qconfig(componentHolder));
                    }
                });
            }
            return Q.allResolved(configList).then(function () {
                return strategy;
            });
        };

        // now we're asked to create them
        localloader.fn._create = function (strategy, cb) {
            var self = this, ruze = this.ruze, result = {};

            var endpoints = this.endpoints;
            var components = this.components;
            _.each(strategy.strategy, function (r, id) {
                var idx = 0;
                _.each(r.route, function (subroute) {
                    var sub = [];
                    if (subroute.container == 'local') {
                        // process it here
                        _.each(subroute.route, function (ep) {
                            var component = components[ep.component] && components[ep.component].component;

                            // look inside the loader first
                            var endpoint = endpoints[ep.id];
                            var instance = endpoint && endpoint.instance;

                            // if its not there, it could be something saved in the route
                            if (!instance) {
                                instance = strategy.routes && strategy.routes[r.id] && strategy.routes[r.id].instances[ep.id];
                                if (instance) {
                                    endpoint = {config:ep, instance:instance};
                                    endpoints[ep.id] = endpoint;
                                }
                            }

                            if (!instance && component) {
                                var options = ruze.options && ruze.options.plugins && ruze.options.plugins[ep.component];
                                instance = new component(options);
                                endpoint = endpoints[ep.id] = {instance:instance, config:ep};
                                if (instance.initialize)
                                    instance.initialize(ep, ruze, this);
                                endpoint.initialized = true;
                            } else if (instance && !endpoint.initialized) {
                                if (instance.initialize)
                                    instance.initialize(ep, ruze, this);
                                endpoint.initialized = true;
                            } else if (!component) {
                                throw new Error('error, component didn\'t load for ', ep.id);
                            }
                            sub.push(ep);
                            result[ep.id] = endpoint;

                        }, this)
                    }
                    // replace in computed
                    strategy.computed[id][idx] = sub;
                    idx++;
                }, this)
            }, this);

            cb(null, strategy);
        };

        //  on their own without the need for a full route rebuild in the remote site.

        var remotecomponent = function (ruze, from, next, route) {

            this.sockets = {};
//        this.endpoints = {};
            this.ruze = ruze;
            this.next = next;
            this.route = route;
            this.endpoint = ruze.parseEndpoint([remotecomponent.genId(route)]);
            this.from = from;

        };
        remotecomponent.fn = remotecomponent.prototype;

        remotecomponent.genId = function(subroute){
            var str = subroute.container+':remote:';
            _.each(subroute.route,function(ep){
                str += md5(ep.id)+':';
            })
            return str;
        }

        remotecomponent.fn.addSocket = function (id, socket) {
            var ruze = this.ruze, self = this;
            if (!_.contains(_.keys(this.sockets), id)) {
                this.sockets[id] = socket;
                // this needs to be loaded remotely
                // this accepts incoming requests
                socket.on(PROCESS_CHANNEL, function (data) {
                    data.exchange.properties.client = data.id;
                    if (data.endpoint.id == self.from.id){
                        data.exchange.out = data.exchange.in;
                        ruze.events().emit(self.next.id, data.exchange);
                    }
                })
            }
        }


        remotecomponent.fn.produce = function (exchange, cb) {
//        console.log('rc client',PROCESS_CHANNEL,exchange)
            // make a remote call to the server to set it up

            var clone = _.extend({}, exchange);
            delete clone.fromEndpoint.recipientList;

            var sockets = (clone.properties.client) ? [this.sockets[clone.properties.client]] : this.sockets;

            _.each(sockets, function (socket) {
                delete clone.properties.client;
                socket.emit(PROCESS_CHANNEL, {id:this.ruze.id, endpoint:this.from, exchange:clone}, function (data) {
                    var e = data.exchange;
                    e.in = e.out;
                    cb(null, e);
                })
            }, this);

        }


        var RUZE = 'ruze';
        var ID_CHANNEL = RUZE + '.id';
        var SEARCH_CHANNEL = RUZE + '.search';
        var LOAD_CHANNEL = RUZE + '.load';
        var CONFIG_CHANNEL = RUZE + '.config';
        var CREATE_CHANNEL = RUZE + '.create';
        var PROCESS_CHANNEL = RUZE + '.process';


        var remoteloader = function (ruze) {

            this.endpoints = {};
            this.ruze = ruze;
            var self = this;

            var io = this.io = ruze.options && ruze.options.io;
            var listen = this.listen = ruze.options && ruze.options.listen;
            var connect = this.connect = ruze.options && ruze.options.connect;

            if (io) {
                // check in options, is there anything to bind to?
                //var listen = ruze.options && ruze.options.containers;

                if (listen) {

                    //var server = this.listenSocket = io.listen(listen);
                    io.on('connection', function (socket) {

                        socket.on(ID_CHANNEL, function (name, fn) {
                            //console.log('server', ID_CHANNEL)
                            fn({id:ruze.id})
                        })

                        // searching for components on other servers...
                        socket.on(SEARCH_CHANNEL, function (data) {
                            //console.log('server', SEARCH_CHANNEL)
                            // looking for a component..
                            if (data.request && data.component && _.contains(_.keys(ruze.cps), data.component)) {
                                socket.emit(SEARCH_CHANNEL, {id:ruze.id, component:data.component})
                            }
                        });


                        // tell another server to build one
                        socket.on(LOAD_CHANNEL, function (data, fn) {
                            //console.log('server', LOAD_CHANNEL)

                            // a list of the components requested
                            var requestedList = _.compact(_.uniq(data.request));

                            // first add me..
                            var strategy = {components:requestedList};

                            ruze._load(strategy)
                                .then(function (strategy) {
                                    fn(strategy.loads)
                                })
                                .done();
                        });

                        socket.on(CONFIG_CHANNEL, function (data, fn) {
                            //console.log('server', CONFIG_CHANNEL)
                            // a list of the components requested
                            var requestedList = _.compact(_.uniq(data.request));

                            // first add me..
                            var strategy = {components:requestedList, configure:requestedList};

                            ruze._load(strategy)
                                .then(function (strategy) {
                                    return ruze._bindStrategy(strategy)
                                })
                                .then(function (strategy) {
                                    return ruze._configure(strategy)
                                })
                                .then(function(strategy){
                                    fn({})
                                })
                                .done();
                        })

                        socket.on(CREATE_CHANNEL, function (data, fn) {
                            console.log('server', CREATE_CHANNEL)

                            var subroute = data.request;



                            var incoming = ruze.configFromObject(data.request,true);
                            var toProcess = [];

                            _.each(incoming, function(subroute){


                                if (subroute.route && subroute.route.length){
                                    // rewrite it with local

                                    var callbackRoute = data.request.mapped[subroute.id];
                                    var callbackEp = callbackRoute && callbackRoute.route[0] && callbackRoute.route[0].from;
                                    if (callbackEp) callbackEp = ruze.parseEndpoint([callbackEp]);

                                    // do we have it?
                                    subroute.container = 'local';
                                    var id = remotecomponent.genId(callbackRoute);

                                    var existing = self.endpoints[id];
                                    if (!existing){

                                        var entryRC = new remotecomponent(ruze, callbackEp,subroute.route[0], callbackRoute);
                                        entryRC.addSocket(data.id, socket);
                                        subroute.route.push(entryRC.endpoint);
                                        self.endpoints[entryRC.endpoint.id] = {config:entryRC.endpoint, instance:entryRC};

                                        toProcess.push(subroute);
                                    }
                                }
                            },this);

                            toProcess.push(function(){
                                fn({id:ruze.id})
                            });

                            ruze.start.apply(ruze,toProcess);

                        })

                    })
                }
                this.connections = {};

                this._ready = _.bind(function (channel, cb) {
                    var client = this.connections[channel.name]
                    if (!client || !client.ready || !client.id) {
                        client = {};
                        client.socket = io.connect(channel.url);
                        var self = this;
                        client.socket.on('connect', function () {
                            client.socket.emit(ID_CHANNEL, ruze.id, function (data) {
                                client.id = data.id;
                                client.url = channel.url;
                                client.ready = true;
                                self.connections[channel.name] = client;
                                cb(null, client);
                            });
                        });
                    } else {
                        cb(null, client);
                    }

                }, this);
            }
        };
        remoteloader.fn = remoteloader.prototype;

        remoteloader.fn.load = function (strategy) {

            if (!this.ready)
                this.ready = Q.nfbind(this._ready);

            var requestedList = _.uniq(strategy.components);
            var requests = [];
            var connect = this.connect;

            if (connect) {
                _.each(connect, function (channel, container) {
                    if (container && !channel)
                        throw new Error('you specified a container that is not configured ' + container);

                    var promise = this.ready({name:container, url:channel})
                        .then(function (client) {
                            var deferred = Q.defer();
                            client.socket.emit(LOAD_CHANNEL, {id:ruze.id, request:requestedList}, function (data) {
                                if (!strategy.loads) strategy.loads = {};
                                _.each(data, function(list,k){
                                    var key = (k=='local')? container : k;
                                    strategy.loads[key] = list;
                                },this)
                                deferred.resolve();
                            })
                            return deferred.promise;
                        })
                    requests.push(promise);
                }, this);
            }

            return Q.allResolved(requests).then(function () {
                return strategy;
            })

            /////


//            var name = ep.component;
//            var container = ep.container;

        };

        remoteloader.fn.configure = function (strategy) {

            if (!this.ready)
                this.ready = Q.nfbind(this._ready);

            var requests = [];
            var connect = this.connect;

            if (connect) {
                _.each(strategy.configure, function (list, container) {
                    var channel = connect[container];
                    if (channel) {
                        var promise = this.ready({name:container, url:channel})
                            .then(function (client) {
                                var deferred = Q.defer();
                                client.socket.emit(CONFIG_CHANNEL, {id:ruze.id, request:list}, function (data) {
                                    deferred.resolve();
                                })
                                return deferred.promise;
                            })
                        requests.push(promise);
                    }
                }, this);
            }

            return Q.allResolved(requests).then(function () {
                return strategy;
            })

        }

        remoteloader.fn.create = function (strategy) {
            var self = this, ruze = this.ruze;

            if (!this.ready)
                this.ready = Q.nfbind(this._ready);


            var endpoints = this.endpoints;
            var requests = [];
            var connect = this.connect;

                _.each(strategy.strategy, function (r, id) {
                    var idx = 0;
                    _.each(r.route, function (subroute) {
                        var sub = [];
                        var container = subroute.container;

                        // do we have it?
                        var endpoint = subroute.route && subroute.route.length == 1 && subroute.route[0];

                        var existing = (endpoint) ? endpoints[endpoint.id] : null;
                        if (existing){
                            sub.push(existing.config);
                            strategy.computed[r.id][idx] = sub;
                        } else if (connect) {
                            var channel = connect[container];
                            if (channel) {
                                // process it here
                                if (container && !channel)
                                    throw new Error('you specified a container that is not configured ' + container);
                                strategy.computed[r.id][idx] = sub;

                                var promise = this.ready({name:container, url:channel})
                                    .then(function (client) {
                                        var deferred = Q.defer();
                                        var payload = ruze.routesToObject([subroute], strategy.routes[r.id].instances);

                                        client.socket.emit(CREATE_CHANNEL, {id:ruze.id, request:payload}, function (data) {
                                            var rc = new remotecomponent(ruze, subroute.route[0], subroute.next, subroute);
                                            rc.addSocket(client.id, client.socket);
                                            sub.push(rc.endpoint);
                                            endpoints[rc.endpoint.id] = {config:rc.endpoint, instance:rc};
                                            // replace in computed
                                            deferred.resolve();
                                        })
                                        return deferred.promise;
                                    })
                                requests.push(promise);
                            }
                        }
                        idx++;
                    }, this);
                }, this)

            return Q.allResolved(requests).then(function () {
                return strategy;
            })

        };

        var ruze = function (options) {
            this.options = options;

            this.id = options && options.id || uuid.v4();

            this.loaders = {local:new localloader(this), remote:new remoteloader(this)}

            this.loaders.local.components.remote = remotecomponent;

            this.preload = options && options.preload || ['expr', 'when', 'process'];
            Q.longStackJumpLimit = options && options.longStackJumpLimit || 0;

        };
        ruze.fn = ruze.prototype;

        ruze.fn.ids = function () {
            var ids = [this.id];
            if (this.loaders && this.loaders.remote && this.loaders.remote.connections) {
                ids = _.union(ids, _.keys(this.loaders.remote.connections));
            }
            return ids;
        }

        ruze.fn.configure = function (definition) {
            // first init the basics
            var loadDefinition = _.bind(function () {
                if (typeof definition == 'string') {
                    // load from text
                    var obj = JSON.parse(config);
                    this.configFromObject(obj)
                } else if (typeof definition == 'function') {
                    definition(_.bind(this.from, this));
                } else {
                    throw new Error('ruze cannot parse configuration with value of ' + (typeof definition));
                }
            }, this);

            var promise = this.configuration;
            var loadall = this.loadall;
            var preload = _.compact(this.preload)
            var strategy = {components:preload, configure:{local:preload}};
            if (!loadall || !promise) {
                var self = this;
                promise = this._load(strategy)
                    .then(function () {
                        return self._configure(strategy);
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
            var rl = (exchange.out && exchange.out.recipientList) ? exchange.out.recipientList : this.getEndpoint(endpoint).config.recipientList;
            if (rl) {
                _.each(rl, function (recip) {

                    //todo:  if we extend exchange, should it get a new uuid - is it part of the original or a new thing?
                    var e = _.extend({}, exchange);
                    e.out.recipientList = null;
                    e.in.recipientList = null;
                    ruze.events().emit((recip.id) ? recip.id : recip, e);
                }, this)
            }
        }


        // pass in an endpoint, get back an array of who has it unless specified.
        ruze.fn._load = function (strategy, local) {
            return this._doLoaders('load', strategy, local);
        };

        // step two is a bind strategy
        ruze.fn._bindStrategy = function (strategy) {

            // todo: for now this is fixed.

            // keep track of prior so we have 'runs'
            var loaderComponents = strategy.loads;
            strategy.strategy = {};
            strategy.configure = {};
            strategy.computed = {};

            if (!loaderComponents)
                throw new Error('you are running a bind strategy but never did _load')

            // before assignment to a container, want to keep a cache of originals for x-ref across routes
            var cache = {};
            var self = this;

            // go through all of the routes
            _.each(strategy.routes, function (r) {
                var priorContainer = null;
                var prevEp = null;
                var i = 0;
                var runs = {id:r.id, route:[]}, curRun;
                var placeholder = [];
                strategy.computed[r.id] = placeholder;
                _.each(r.route, function (sequence) {
                    var curEp = sequence;

                    // first check the container for the current one
                    var curContainer = curEp.container;
                    if (curContainer) {
                        // we are starting a new run.
                        if (curContainer != priorContainer) {
                            curRun = [];
                            runs.route.push({container:curContainer, route:curRun})
                            placeholder.push([]);
                        }
                        priorContainer = curContainer;
                        curRun.push(curEp);
                    } else if (cache[curEp.id]) {
                        // get the container from our cache --
                        curContainer = cache[curEp.id];
                        if (curContainer != priorContainer) {
                            curRun = [];
                            runs.route.push({container:curContainer, route:curRun})
                            placeholder.push([]);
                        }
                        priorContainer = curContainer;
                        curEp.container = priorContainer;
                        self.rewriteEndpointId(curEp)
                        curRun.push(curEp);
                    } else if (priorContainer) {
                        // set the current one to prior - creating 'runs'
                        curContainer = priorContainer;
                        cache[curEp.id] = curContainer;
                        curEp.container = curContainer;
                        self.rewriteEndpointId(curEp)
                        curRun.push(curEp);
                    } else {

                        // get the next number of N components with no container..
                        var lookForward = [curEp.component];
                        for (var j = i; j < sequence.length; j++) {
                            var next = sequence[j];

                            // also no container assigned?
                            if (next.container) break;

                            lookForward.push(next.component);
                        }

                        // lets look around... start with local, first it needs to contain ours
                        var bestContainer = null;

                        var localLoader = loaderComponents.local;

                        // local always wins by default
                        if (localLoader && _.contains(localLoader, curEp.component)) {
                            bestContainer = 'local';
                        } else {
                            var bestNum = 0;
                            _.each(loaderComponents, function (list, k) {

                                var isLocal = (k == 'local');

                                var num = _.intersection(list, lookForward).length;

                                if (num > bestNum) {
                                    bestNum = num;
                                    bestContainer = k;
                                } else if (num == bestNum) {
                                    if (bestContainer != 'local')
                                        bestContainer = k;
                                }
                            })
                        }

                        // if we don't have a container, there's a problem
                        if (!bestContainer)
                            throw new Error('there are not any containers that satisfy this progression: ' + lookForward);

                        cache[curEp.id] = bestContainer;
                        curEp.container = bestContainer;
                        priorContainer = bestContainer;
                        self.rewriteEndpointId(curEp)
                        curRun = [];
                        runs.route.push({container:bestContainer, route:curRun})
                        placeholder.push([]);

                        curRun.push(curEp);
                    }

                    var stratConfig = strategy.configure[curEp.container];
                    if (!stratConfig) {
                        stratConfig = strategy.configure[curEp.container] = [];
                    }
                    stratConfig.push(curEp.component);
                    strategy.configure[curEp.container] = _.uniq(stratConfig);

                    prevEp = curEp;
                    i++;

                }, this);

                // setup next
                var prevRun;
                _.each(runs.route, function(run){
                    if (prevRun){
                        prevRun.next = run.route[0];
                    }
                    prevRun = run;
                })

                strategy.strategy[runs.id] = runs;
            }, this);
            return strategy;
        };

        ruze.fn._configure = function (strategy, local) {
            return this._doLoaders('configure', strategy, local);
        };

        ruze.fn._create = function (strategy, local) {
            return this._doLoaders('create', strategy, local);
        };

        ruze.fn._doLoaders = function (fn, arg, local) {
            if (local)
                return this.loaders.local[fn](arg)
            // this is now simpler..  just run them through each loader.

            var promise = null;
            _.each(this.loaders, function (loader) {
                promise = (!promise) ? loader[fn](arg) : promise.then(function (obj) {
                    return loader[fn](obj);
                });
            })

            return promise;
        }

        ruze.fn.getEndpoint = function (endpoint) {
            var ep = null;
            _.each(this.loaders, function (v, k) {
                var id = (endpoint.id) ? endpoint.id : endpoint;
                if (v.endpoints[id])
                    ep = v.endpoints[id];
            })
            return ep;
        }

        ruze.fn._buildRecipientsAndEvents = function (strategy) {
            // for each route
            // ok, now that we have that aligned, need to do the recipient Lists at the route level

            _.each(strategy.computed, function (computed, id) {
                var prevEp;
                var sequence = _.flatten(computed);
                _.each(sequence, function (curEp) {
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
                                        e.fromEndpoint = _.clone({}, cur.config);
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
                                        e.fromEndpoint = _.clone({}, cur.config);
                                        self.emitRecipients(cur.config, e);
                                    });
                                } else {
                                    throw new Error('produce called, but no produce method on endpoint', ep);
                                }
                            }
                        })
                    }
                    prevEp = curEp;
                }, this);
                strategy.routes[id].built = true;
            }, this)
            return strategy;

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

        ruze.fn.rewriteEndpointId = function (endpoint) {
            var tail = (endpoint.args && endpoint.args.length) ? '?' + cutils.normalize(endpoint.args) : '';
            var id = (endpoint.container) ?
                endpoint.container + ':' + endpoint.component + ':' + endpoint.object + tail :
                endpoint.component + ':' + endpoint.object + tail;

            endpoint.id = id;

        }

        ruze.fn.newExchange = function () {
            return _.extend({}, exchange, {id:uuid.v4()});
        }

        ruze.fn.from = function (arg, name) {
            var r = new route(this, name);
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


            return this.configuration.then(
                function () {
                    if (!args || args.length == 0) {
                        args = self.routes;
                    }
                    args = _.filter(args, function (arg) {
                        return !arg.built
                    })

                    var routes = {};
                    _.each(args, function (a) {
                        routes[a.id] = a
                    });

                    var strategy = {routes:routes, components:self._getComponents(args)};

                    return self._load(strategy).then(
                        function (strategy) {
                            return self._bindStrategy(strategy);
                        }).then(
                        function (strategy) {
                            return self._configure(strategy)
                        }).then(
                        function (strategy) {
                            return self._create(strategy);
                        }).then(function (strategy) {
                            return self._buildRecipientsAndEvents(strategy)
                        }).then(function(strategy){
                            _.each(strategy.routes, function(v,k){
                                if (!self.routes[k]){
                                    self.routes[k] = v;
                                }
                            })
                            return strategy;
                        })

                }).then(start).done(callback);
        }

        ruze.fn._getComponents = function (routes) {
            var components = [];
            _.each(routes, function (r) {
                components = (components.length) ? _.union(r._getComponents(), components) : r._getComponents();
            })
            return _.compact(components);
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
                if (instance) {
                    r.endpoint(instance);
                }

                var routes = {};
                routes[r.id] = r;
                var strategy = {routes:routes, components:this._getComponents([r])};

                return self._load(strategy).then(
                    function (strategy) {
                        return self._bindStrategy(strategy);
                    }).then(
                    function (strategy) {
                        return self._configure(strategy)
                    }).then(
                    function (strategy) {
                        return self._create(strategy);
                    }).then(function (strategy) {
                        var ep = self.getEndpoint(r.route[0].id);

                        if (recipients) {
                            ep.config.recipientList = recipients;
                        }
                        if (cb)
                            cb(ep && ep.instance, ep.config);
                    })
            }
        }
        ruze.fn.send = function (endpoint, body, cb) {
            var ep = (endpoint.id) ? endpoint : this.parseEndpoint([endpoint]);
            if (!ep.container) {
                ep.container = 'local';
                this.rewriteEndpointId(ep);
            }
            var ex = this.newExchange(ep.id);
            ex.out.body = body;
            this.events().emit(ep.id, ex);
        }

        if (colors) {
            colors.setTheme({
                label:   'grey',
                line:    'grey',
                section: 'black',
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
                print += '\n' + ('+ route '.label + ('(' + r.id + ')').interest);
                print += '\n' + ('     |- sequence '.label + ('(' + _.pluck(r.route, 'id').join(') -> (') + ')').emphasis)
            }, this)
            print += '\n' + ('Active Loaders:'.section);
            _.each(this.loaders, function (l, key) {
                if (l && l.paths)
                    print += '\n' + ('+ '.label + key + ' loads from '.label + _.values(l.paths).join(',').emphasis);
                _.each(l.endpoints, function (ep, key) {
                    print += '\n' + ('     |- endpoint'.label + (' (' + key + ')').emphasis);
                    if (ep.config.recipientList) {
                        _.each(ep.config.recipientList, function (e) {
                            if (e)
                                print += '\n' + ('            |- fires '.label + e.interest);
                        })
                    } else {
                        print += '\n' + ('            |- fires '.label + 'nothing'.interest)
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


        ruze.fn.configFromObject = function (json,local) {
            var routes = {};
            if (json.plugins) {
                if (!this.options) this.options = {};
                this.options.plugins = json.plugins;
            }

            json.mapped = {};

            // do the routes..
            _.each(json.routes, function (route) {
                var name = route.name;
                var routeBuild = this;
                if (route.route) {
                    _.each(route.route, function (obj) {
                        var func = _.keys(obj)[0];
                        var val = _.values(obj)[0];

                        if (func == 'from' || func == 'to' && local){
                            var clone = _.extend({},this.parseEndpoint([val]));
                            clone.container = 'local';
                            this.rewriteEndpointId(clone);
                            val = clone.id;
                        }

                        if (routeBuild && routeBuild[func]) {
                            routeBuild = routeBuild[func].call(routeBuild, val);
                        } else {
                            throw new Error('ruze does not support function "' + func + '"')
                        }
                    }, this)
                }
                if (routeBuild){
                    json.mapped[routeBuild.id] = route;
                    routes[routeBuild.id] = routeBuild;
                }
            }, this);

            return routes;
        }

        ruze.fn.routesToObject = function (routes, instances) {
            var result = {};
            result.routes = {};

            _.each(routes, function (rte) {
                var r = {route:[]};
                r.name = rte.name;
                r.id = rte.id;
                r.container = rte.container;
                var first = true;
                var priorContainer = null;
                _.each(rte.route, function (obj) {
                    var ep = (obj.id) ? obj : this.parseEndpoint([obj]);

                    // look it up in local
                    var clone = _.extend({},ep);
                    clone.container = 'local';
                    this.rewriteEndpointId(clone);



                    var instance = instances && instances[clone.id];

                    // if it has a to Object method..
                    if (instance && instance.toObject) {
                        // see if we can get the instance as its probably rewritten
                        r.route.push(instance.toObject());
                    } else if (first) {
                        r.route.push({from:ep.id});
                    } else {
                        r.route.push({to:ep.id});
                    }
                    first = false;

                }, this);
                result.routes[r.id]= r;
            }, this)
            return result;
        }


        // remove singleton
//        return ruze;
//    }).call(this);
//    return singleton;

        return ruze;
    });