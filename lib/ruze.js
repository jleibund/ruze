if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

requirejs.config({
    paths: {
        cutils: './cutils',
        path: './path'
    },
    waitSeconds: 0
})


requirejs.onError = function (err) {
    console.log('requirejs error-- type:', err.requireType, 'message:', err.message)
}

define([ 'require', 'module', 'q', 'node-uuid', 'events', 'underscore', 'colors', 'path', 'cutils', 'exprjs'],
    function (require) {

        var m = require('module'),
            path = require('path'),
            cutils = require('cutils');


        // we save this off so we know the relative directory ruze is in.. later we need this to load plugins
        var dirname = path.dirname(m.uri);

        var uuid = require('node-uuid'), events = require('events'), _ = require('underscore'),
            Q = require('q'), colors = require('colors'), exprjs = require('exprjs'), md5 = cutils.md5;

        // todo - should we spell out exceptions .fail() and .progress() using Q or just have the default handler catch them on done()?

        // these are just templates for some of the basic objects we use or store.
        var apTemplate = {id: null, container: null, component: null, object: null, args: {}};
        var exTemplate = {in: {header: {}, recipientList: null}, out: {header: {}, recipientList: null}, properties: {}, id: null, error: null, fromEndpoint: null};
        var compTemplate = {name: null, loaded: false, container: null};

        // routes define a sequence of endpoints that are linked together by recipient lists
        var route = function (ruze, name, id) {

            this.id = id || uuid.v4();
            this.route = [];
            this.instances = {};
            this.ruze = ruze;
            this.inOut = false;
            //optional
            this.name = name;

            // yeah, seems stupid, but we need to notify when something is creating a new route..
            ruze.events().emit('route', this);

        };
        route.fn = route.prototype;

        // not yet implemented
        route.fn.inOut = function () {
            // todo will need to add a correlation id to exchange.
            this.inOut = true;
        }

        // not yet implemented
        route.fn.inOnly = function () {
            this.inOut = false;
        }

        // 'to' is the way we add an endpoint to the route.  it can build up an endpoint from multiple objects, if provided
        route.fn.to = function (arg) {
            var ruze = this.ruze;
            // we parse all provided arguments into a single endpoint object.  route stores endpont objects, not just their string ids
            var ep = ruze.parseEndpoint(Array.prototype.slice.call(arguments, 0));
            this.route.push(ep);
            return this;
        };

        // this is the means to provide a direct instance for the prior to().  e.g. to('my:thing').endpoint(myObject)
        route.fn.endpoint = function (instance) {
            var route = this.route, ruze = this.ruze;
            // make sure we have a route sequence field
            if (route && route.length > 0) {

                // get the last endpoint added - its the target for this instance
                var ep = route[route.length - 1];

                // make a clone of it in local container for lookup later- it must be 'local' if we define it here
                var clone = _.extend({}, ep);
                clone.container = 'local';
                this.ruze.rewriteEndpointId(clone);

                // we save it to an internal map of instances.  this will allow us to import into a loader, later, when we build this route
                this.instances[clone.id] = instance;
            }
            return this;
        }

        // convenience function returns all of the components used in this route
        route.fn._getComponents = function () {
            return _.pluck(this.route, 'component');
        }


        // this is the start event for this route
        route.fn.startEvent = function () {
            return (this.route.length) ? this.route[0].id : null;
        }

        // localloader loads, configures, creates and stores all locally provisioned endpoints
        var localloader = function (ruze) {
            // we store constructed endpoints in this map
            this.endpoints = {};
            // we store loaded components in this map
            this.components = {};
            this.ruze = ruze;
            // next two are using Q to bind our load and create functions so they work with promises
            this.load = Q.nfbind(_.bind(this._load, this));
            this.create = Q.nfbind(_.bind(this._create, this));

            // by default we will add the /plugin directory as a potential search path for components
            this.addPath('plugin')
        }
        localloader.fn = localloader.prototype;

        // this function adds a search path for components to localloader
        localloader.fn.addPath = function (path) {
            if (!this.paths) this.paths = [];
            // we accept paths relative to ruze, wherever its loaded
            this.paths.push(dirname + '/' + path);
        };


        // load is all about loading from requirejs, not instantiating anything.
        localloader.fn._load = function (strategy, cb) {
            var self = this;
            // grab the internal map of loaded components
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

            // what's left is what we need to load
            var neededList = _.difference(requestedList, loadedList);

            // we are building up a map of paths and fallback paths - addPath() - using requirejs fallback capability for CDN
            var lookup = {};
            _.each(neededList, function (name) {
                var list = lookup[name] = [];
                _.each(this.paths, function (path) {
                    list.push(path + '/' + name + '/' + name);
                })
            }, this);

            // reset requirejs to use our search paths for components, enforceDefine for these.  they should be in the prescribed format
            requirejs.config({
                enforceDefine: true,
                paths: lookup
            })

            requirejs(neededList, function () {

                // run through everything that loaded, in order
                for (var j = 0; j < neededList.length; j++) {
                    var name = neededList[j]
                    var comp = (arguments.length > j) ? arguments[j] : null;
                    if (comp) {
                        // we got a hit.  put it into our internal thing, remove from needed list, add to loadedList
                        components[name] = {config: false, component: comp};
                        loadedList.push(name);
                    }
                }
                // put what we loaded into the strategy object to send to the next step for building
                if (!strategy.loads) strategy.loads = {};
                strategy.loads.local = loadedList;

                // call the next thing passing in the possibly augmented strategy
                return cb.call(self, null, strategy)
            })
        };

        // returns a promise.. all endpoints after this will have components that are config'ed
        localloader.fn.configure = function (strategy) {
            var self = this, ruze = this.ruze, result = {};

            var components = this.components;

            // this is the config function - if the component exposes that function
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
            // wrap it in Q
            var qconfig = Q.nfbind(config);

            // we're going to run a bunch in parallel below, so save the request for each in this list
            var configList = [];

            // we are only doing config for local components, so grab those out of the strategy object that was passed in
            if (strategy && strategy.configure && strategy.configure.local) {

                // run this on the unique set of components
                _.each(_.uniq(strategy.configure.local), function (comp) {
                    var componentHolder = components[comp];

                    // call config on any components that haven't done it yet, add the request to our list
                    if (!componentHolder.config) {
                        configList.push(qconfig(componentHolder));
                    }
                });
            }

            // run all requests for config in parallel, then return strategy to hit the next step
            return Q.allResolved(configList).then(function () {
                return strategy;
            });
        };

        // now we're asked to create them
        localloader.fn._create = function (strategy, cb) {
            var self = this, ruze = this.ruze, result = {};

            // get the internal maps for loaded components and endpoints
            var endpoints = this.endpoints;
            var components = this.components;

            // we're running through the build strategy that was defined in _bindStrategy
            _.each(strategy.strategy, function (r, id) {
                // we keep track of an index of which part of the subroute we'll be in.  subroute is a chunk of a route all mapped to one container
                var idx = 0;

                // strategy has chunked the route into a bunch of subroutes, each maps to a stage in the route performed on a container
                _.each(r.route, function (subroute) {

                    // this is the 'substitute' array of endpoints for the placeholder added to the strategy.computed object for this subroute
                    var sub = [];

                    // we're only handling the subroutes that were tagged to be run locally
                    if (subroute.container == 'local') {
                        // process each endpoint in the route
                        _.each(subroute.route, function (ep) {
                            var component = components[ep.component] && components[ep.component].component;

                            // look inside the loader first, do we already have this endpoint, also look for the instance too
                            var endpoint = endpoints[ep.id];
                            var instance = endpoint && endpoint.instance;

                            // if its not there, it could be something saved in the route itself (e.g. route.instances map)
                            if (!instance) {
                                instance = strategy.routes && strategy.routes[r.id] && strategy.routes[r.id].instances[ep.id];
                                if (instance) {
                                    endpoint = {config: ep, instance: instance};
                                    endpoints[ep.id] = endpoint;
                                }
                            }

                            // if we have a component loaded, but no instance in the loader or in the route, its time to make one
                            if (!instance && component) {
                                var options = ruze.options && ruze.options.plugins && ruze.options.plugins[ep.component];

                                // make the new instance, pass in options to ruze, it can look up its own stuff, if its stuff is there
                                instance = new component(options);

                                // add a new endpoint definition to the local loader.. we save the endpoint defn in config and the instance
                                endpoint = endpoints[ep.id] = {instance: instance, config: ep};

                                // if it defines an initialize method, go do that.  set it as initialized
                                if (instance.initialize)
                                    instance.initialize(ep, ruze, this);
                                endpoint.initialized = true;
                            } else if (instance && !endpoint.initialized) {

                                // if we have an instance, but it wasn't initialized, go do that
                                if (instance.initialize)
                                    instance.initialize(ep, ruze, this);
                                endpoint.initialized = true;
                            } else if (!component) {

                                // we should have a component, if we got here you didn't load the thing
                                throw new Error('error, component didn\'t load for ', ep.id);
                            }
                            // add this endpoint to substitute array, keep track of all results
                            sub.push(ep);
                            result[ep.id] = endpoint;

                        }, this)
                    }
                    // replace the placeholder in computed with our built-up substitute array
                    strategy.computed[id][idx] = sub;
                    idx++;
                }, this)
            }, this);

            // goto the next step
            cb(null, strategy);
        };
        localloader.fn.remove = function (endpoint) {
            if (this.endpoints[endpoint.id || endpoint]){
                delete this.endpoints[endpoint.id || endpoint];
            }
        }

        // remotecomponent should be here defined internally, unlike other plugins
        //   it sits at the end of a route on the server, when it receives the exchange it kicks off the beginning, then later is the last producer, doing the return to caller
        var remotecomponent = function (options) {

            this.sockets = {};
            this.ruze = options.ruze;
            this.next = options.next;
            this.route = options.route;
            this.endpoint = this.ruze.parseEndpoint([remotecomponent.genId(this.route)]);
            this.from = options.from;
            this.terminate = options.terminate;
            this.client = options.client || false;

        };
        remotecomponent.fn = remotecomponent.prototype;

        // we can generate an id for a remote component using md5 to uniquely identify by the subroute
        remotecomponent.genId = function (subroute) {
            var str = subroute.container + ':remote:';
            var gen = '';
            _.each(subroute.route, function (ep) {
                gen += ep.id + ':';
            })
            gen = md5(gen);
            return str + gen;
        }

        // adds a new socket to this remote component in the event of multiple clients using the same remote route
        remotecomponent.fn.addSocket = function (socket, id) {
            var ruze = this.ruze, self = this;
            if (socket && !_.contains(_.keys(this.sockets), id)) {
                this.sockets[id] = socket;
                // this accepts incoming requests, we register for them on socket.io then forward to internal event emitter
                socket.on(PROCESS_CHANNEL, function (data) {
                    // we need to save off which client this is to avoid broadcast situations across multiple clients
                    // todo: want to allow broadcast as an option later - this opens it up to situations like multi user chat for example
                    var e = data.exchange, socketId = id;
                    // make sure this is, in fact, the intended endpoint (from) and also that there is a next step
                    if (data.endpoint.id == self.from.id) {
                        //e.out = e.in;
                        e.properties.socket = socketId;
                        console.log('!!received ',data.endpoint.id)

                        // if we are the client for the request
                        if (self.client){
                            // get the prior state from the exchange
                            if (e.parent && e.parent.length && self.next) {
                                // we are continuing on the route
                                var state = e.parent.shift();
                                if (e.routeId == self.route.id){
                                    e.process = state.process;
                                    e.routeId = state.routeId;
                                    ruze.emitRecipients(self.endpoint.id, e);
                                } else {
                                    delete e.process;
                                    delete e.routeId;
                                    delete e.parent;
                                    ruze.emitRecipients(self.endpoint.id, e,true);
                                }
                            } else {
                                delete e.process;
                                delete e.routeId;
                                delete e.parent;
                                ruze.emitRecipients(self.endpoint.id, e,true);
                            }
                        } else {
                            ruze.emitRecipients(self.next.id, e);
                        }

                    }
                })
            }
        }

        remotecomponent.fn.removeSocket = function (id) {
            var ruze = this.ruze, self = this;
            if (_.contains(_.keys(this.sockets), id)) {
                delete this.sockets[id];
            }
        }

                // produce is an expected method for components, note that remotecomponent is added as the end of a route, so this is actually the return call
        remotecomponent.fn.produce = function (exchange, cb) {

            // if there is no next on the caller's side, then don't do the above
            if (this.terminate){
                return cb(null, exchange);
            }

            // we clone the exchange then remove any cycles present in the fromEndpoint
            var clone = cutils.clone(exchange);
            delete clone.fromEndpoint.recipientList;

            var hasProcess = clone.process && clone.process.length;

            if (this.client && hasProcess){
                // push current state into the exchange
                if (!clone.parent) clone.parent = [];
                clone.parent.unshift({process: clone.process, routeId: clone.routeId});
                delete clone.process;
                delete clone.routeId;
            }

            // grab the sockets-- if we're filtered by client (see above) we grab just its socket
            var sockets = (!clone.properties.broadcast && clone.properties.socket &&
                this.sockets[clone.properties.socket]) ? [this.sockets[clone.properties.socket]] : _.values(this.sockets);

            delete clone.properties.socket;
            // for each socket, emit the return event on the process channel
            _.each(sockets, function (socket) {
                if (socket) {
                    console.log('!!produce fired ',this.from.id)
                    socket.emit(PROCESS_CHANNEL, {id: this.ruze.id, endpoint: this.from, exchange: clone});
                }
            }, this);

//            cb(null, exchange);
        }

        // these are our preset channels
        var RUZE = 'ruze';
        var ID_CHANNEL = RUZE + '.id';
        var SEARCH_CHANNEL = RUZE + '.search';
        var LOAD_CHANNEL = RUZE + '.load';
        var CONFIG_CHANNEL = RUZE + '.config';
        var CREATE_CHANNEL = RUZE + '.create';
        var PROCESS_CHANNEL = RUZE + '.process';

        // remoteloader uses remote components to represent a route on a server
        var remoteloader = function (ruze) {

            // keep track of our remote component endpoints
            this.endpoints = {};
            this.endpointsBySocket = {};
            this.ruze = ruze;
            var self = this;

            // we grab io, for use on clients; also listen is our server socket.io instance; connect is the list of clients
            var io = this.io = ruze.options && ruze.options.io;
            var io_timeout = this.io_timeout = ruze.options && ruze.options.io_timeout || 5000;
            var listen = this.listen = ruze.options && ruze.options.listen;
            var connect = this.connect = ruze.options && ruze.options.connect;

            // if we're a server
            if (listen) {

                // on connect, we have to define a bunch of channels
                listen.on('connection', function (socket) {

                    socket.on('disconnect', function(){
                        var remotes = self.endpointsBySocket[socket.id];
                        if (remotes){
                            _.each(remotes, function(remote){
                                // first just remove the socket
                                remote.removeSocket(socket.id);

                                if (remote.sockets && _.isEmpty(_.keys(remote.sockets))) {
                                    // remove the route..

                                    if (remote.route.locallyDefined){
                                        ruze._removeEndpoint(remote.route.route[remote.route.route.length-1]);
                                        var first = remote.route.route[0];
                                        if (first.process){
                                            first.process.splice(first.process.length-2,1);
                                        }
                                    } else {
                                        ruze._removeRoute(remote.route);
                                    }
                                }
                            })
                            delete self.endpointsBySocket[socket.id];
                        }
                    })

                    // when asked to identify ourself
                    socket.on(ID_CHANNEL, function (name, fn) {
                        //console.log('server', ID_CHANNEL)
                        fn({id: ruze.id})
                    })

                    // searching for components on other servers...
                    socket.on(SEARCH_CHANNEL, function (data) {
                        //console.log('server', SEARCH_CHANNEL)
                        // looking for a component..
                        if (data.request && data.component && _.contains(_.keys(ruze.cps), data.component)) {
                            socket.emit(SEARCH_CHANNEL, {id: ruze.id, component: data.component})
                        }
                    });


                    // we've been asked to load components
                    socket.on(LOAD_CHANNEL, function (data, fn) {
                        //console.log('server', LOAD_CHANNEL)

                        // a list of the components requested
                        var requestedList = _.compact(_.uniq(data.request));

                        // set it up as a strategy object
                        var strategy = {components: requestedList};

                        // call load, return result to requester
                        ruze._load(strategy)
                            .then(function (strategy) {
                                fn(strategy.loads)
                            })
                            .done();
                    });

                    // we've been asked to configure components
                    socket.on(CONFIG_CHANNEL, function (data, fn) {
                        //console.log('server', CONFIG_CHANNEL)
                        // a list of the components requested to be config'ed
                        var requestedList = _.compact(_.uniq(data.request));

                        // make a strategy object
                        var strategy = {components: requestedList, configure: requestedList};

                        // we have to do load, then config (just in case)
                        ruze._load(strategy)
                            .then(function (strategy) {
                                return ruze._bindStrategy(strategy)
                            })
                            .then(function (strategy) {
                                return ruze._configure(strategy)
                            })
                            .then(function (strategy) {
                                fn({})
                            })
                            .done();
                    })

                    // we've been asked to create some routes
                    socket.on(CREATE_CHANNEL, function (data, fn) {

                        // ok- data includes a bunch of routes in json/object format.  process it like any other definition
                        // it will make all of the appropriate calls for expr, when, otherwise, etc on the DSL
                        var incoming = ruze.configFromObject(data.request, data.container);

                        //todo- we need to create totally new routes, even if they contain the same endpoints
                        //todo- we need to keep track of which routes were created for which sockets

                        // keep track of everything we're going to create
                        var toProcess = {};
                        var socketId = socket.id;
                        // for each route we've been tasked to create
                        _.each(incoming, function (subroute) {

                            // make sure we're good
                            if (subroute.route && subroute.route.length) {

                                // configFromObject creates the .mapped field for each, so lets grab that
                                var callbackRoute = data.request.mapped[subroute.id];

                                // the callback endpoint is the very first endpoint in that route, get it
                                var callbackEp = callbackRoute && callbackRoute.route && callbackRoute.route.length && callbackRoute.route[0] && callbackRoute.route[0].from;

                                // make sure its a real endpoint, not just a string
                                if (callbackEp) callbackEp = ruze.parseEndpoint([callbackEp]);

                                // our subroute is no longer a remote ref, we're going to do it here, so its local container
                                subroute.container = 'local';

                                // get the id for this subroute, maybe we created it before
                                var id = remotecomponent.genId(subroute);

                                // do we already have that remote component?
                                var existing = self.endpoints[id];
                                if (!existing) {

                                    // if not, we create one.  from is the callback at the end, endpoint is where we start, pass in the full route too
                                    var entryRC = new remotecomponent({ruze:ruze, from:callbackEp, next:subroute.route[0], route:subroute, terminate:callbackRoute.terminate, client:false});
                                    // add this as a new socket to use
                                    entryRC.addSocket(socket,socketId);
                                    if (!self.endpointsBySocket[socketId]) self.endpointsBySocket[socketId] = [];
                                    self.endpointsBySocket[socketId].push(entryRC);
                                    // add our new remote component to the end of the route, so its the last thing called when processing

                                    //todo: the below must be added to the end of the route after we've called start so that bindstrategy runs correctly

                                    subroute.route.push(entryRC.endpoint);
                                    // save it off as an instance in both the route and in our loader
                                    subroute.instances[entryRC.endpoint.id] = entryRC;
                                    self.endpoints[entryRC.endpoint.id] = {config: entryRC.endpoint, instance: entryRC};

                                    // add the new route to process into the map we're building up
                                    toProcess[subroute.id] = subroute;
                                } else {

                                    // if we already built this remote component, we just need to add a new socket for the requestor
                                    existing.instance.addSocket(socket, socketId);
                                    if (!self.endpointsBySocket[socketId]) self.endpointsBySocket[socketId] = [];
                                    self.endpointsBySocket[socketId].push(existing.instance);
                                }
                            }
                        }, this);

                        // if we have new routes to process, do it
                        if (!_.isEmpty(toProcess)) {

                            // make a new strategy with those routes and components
                            var strategy = {client:socketId, routes: toProcess, components: ruze._getComponents(_.values(toProcess))};

                            // use our internal start to the build process
                            ruze._start.call(ruze, strategy, function () {
                                // callback to socket.io that we're done
                                fn({id: ruze.id})
                            });
                        } else {
                            // we're done, just return to socket.io
                            fn({id: ruze.id})
                        }


                    })

                })
            }

            // the above handled if we're a server.. we may also be making our own client connections
            if (io) {


                // keep track of our connections
                this.connections = {};

                // we use ready to make sure that for each client channel we have a real socket connection
                this._ready = _.bind(function (channel, cb) {
                    var client = this.connections[channel.name]
                    if (!client) {
                        client = {};
                        client.ready = false;
                        client.url = channel.url;
                        this.connections[channel.name] = client;
                    }
                    if (!client.ready){
                        console.log('connecting to ' + channel.url)
                        if (client.socket){
                            client.socket.socket.connect();
                        } else {
                            client.socket = io.connect(channel.url, { 'connect timeout': io_timeout });
                        }
                        var socket = client.socket;
                        socket.on('connect_failed', function (e) {
                            console.log('could not connect to ' + channel.url)
                            client.ready = false;
                            cb(null, client);
//                            cb(e, client);
                        })
                        socket.on('disconnect', function (e) {
                            console.log('disconnected from ' + channel.url)

                            // todo:  we need to trash all of the remote component routes

                            client.ready = false;
                            cb(null, client);
//                            cb(e, client);
                        })
                        socket.on('error', function (e) {
                            // todo: fix socket.io it shouldn't kill my server when I can't connect to something
                            console.log('error occurred on ' + channel.url,arguments)
                            client.ready = false;
                            cb(null, client);
//                            cb(e, client);
                        })
                        socket.on('connect', function () {
                            console.log('connected to ' + channel.url)
                            socket.emit(ID_CHANNEL, ruze.id, function (data) {
                                client.id = data.id;
                                client.ready = true;
                                cb(null, client);
                            });
                        });
                        socket.on('reconnect', function () {
                            console.log('reconnected to ' + channel.url)
                            self.ruze.start();

//                            socket.emit(ID_CHANNEL, ruze.id, function (data) {
//                                client.id = data.id;
//                                client.ready = true;
//                                self.ruze.start().then(function(){
//                                    cb(null, client);
//                                })
//                            });
                        });
//                        client.socket.connect(client.url);
                    } else {
                        cb(null, client);
                    }

                }, this);
                this.ready = Q.nfbind(this._ready);
            }
        };

        remoteloader.fn = remoteloader.prototype;

        // we've been asked to load something by the build process
        remoteloader.fn.load = function (strategy) {

            // get or make our client socket connection

            // get the components we've been asked to load
            var requestedList = _.uniq(strategy.components);
            var requests = [];
            var connect = this.connect;

            // do we even have any connections
            if (connect) {

                // for each connection, we'll reach out to see what they have
                _.each(connect, function (channel, container) {

                    // we have a connection with no url, we can't do much with this
                    if (container && !channel)
                        throw new Error('you specified a container that is not configured ' + container);

                    // using a process, we'll run the Q-wrapped ready command then our load logic
                    var promise = this.ready({name: container, url: channel})
                        .then(function (client) {
                            var deferred = Q.defer();

                            // reach out to the server on the load channel with the stuff we want to find
                            client.socket.emit(LOAD_CHANNEL, {id: ruze.id, request: requestedList}, function (data) {

                                // make sure our strategy object has a loads section
                                if (!strategy.loads) strategy.loads = {};

                                // for each component we got back..
                                _.each(data, function (list, k) {
                                    // key is the container.. if it says local, its what we refer to as the container, otherwise it's some proxied thing
                                    var key = (k == 'local') ? container : k;
                                    strategy.loads[key] = list;

                                    // if we received something that is not in the container we requested it from, that server is proxying for its own connections
                                    if (!connect[key]) {
                                        // we'll add it to unknown, since we haven't registered that container anywhere
                                        if (!strategy.unknown) strategy.unknown = {};
                                        strategy.unknown[key] = container;
                                    }
                                }, this)
                                deferred.resolve();
                            })
                            return deferred.promise;
                        })

                    // add in any of our load requests
                    requests.push(promise);
                }, this);
            }

            // for all of our load requests, run in parallel, then return the built up strategy object
            return Q.allResolved(requests).then(function () {
                return strategy;
            })

        };

        // we've been asked to configure remote components
        remoteloader.fn.configure = function (strategy) {

            var requests = [];
            var connect = this.connect;

            // if we have any connections..
            if (connect) {
                _.each(strategy.configure, function (list, container) {
                    var channel = connect[container];
                    if (channel) {
                        // for each channel send out a config request
                        var promise = this.ready({name: container, url: channel})
                            .then(function (client) {
                                var deferred = Q.defer();
                                client.socket.emit(CONFIG_CHANNEL, {id: ruze.id, request: list}, function (data) {
                                    deferred.resolve();
                                })
                                return deferred.promise;
                            })
                        requests.push(promise);
                    }
                }, this);
            }

            // run them all in parallel, then go to the next step
            return Q.allResolved(requests).then(function () {
                return strategy;
            })

        }

        // we're been asked to send out create requests
        remoteloader.fn.create = function (strategy) {
            var self = this, ruze = this.ruze;


            var endpoints = this.endpoints;
            var requests = [];
            var connect = this.connect;

            // gotta do this for each route and subroute in the strategy
            _.each(strategy.strategy, function (r, id) {
                var idx = 0;

                // go through the routes, each has a subroute -- runs of endpoints, chunked by container
                var last = r.route.length-1;
                var priorContainer = null;
                _.each(r.route, function (subroute, subidx) {
                    var sub = [];
                    var container = subroute.container;

                    // do we have it here already?
                    var endpoint = subroute.route && subroute.route.length == 1 && subroute.route[0];

                    var existing = (endpoint) ? endpoints[endpoint.id] : null;
                    if (existing) {
                        // if we do, add it at the right point in computed
                        sub.push(existing.config);
                        strategy.computed[r.id][idx] = sub;
                    } else if (connect) {

                        // otherwise we need to connect and send out a create request
                        var channel = connect[container];

                        // the remote server may be proxying other servers..
                        var proxyContainer = container;


                        // try the unknowns (proxy) use that to reset the proxyContainer or channel as required
                        if (!channel && strategy.unknown && strategy.unknown[container]) {
                            proxyContainer = strategy.unknown[container];
                            channel = connect[proxyContainer];
                        }

                        // make sure we actually have a channel now
                        if (channel) {
                            if (proxyContainer && !channel)
                                throw new Error('you specified a container that is not configured ' + container);


                            // set up the substitute array for computed
                            strategy.computed[r.id][idx] = sub;

                            // make our promise that checks that the socket is real, then does the create request logic
                            var promise = this.ready({name: proxyContainer, url: channel})
                                .then(function (client) {
                                    var deferred = Q.defer();

                                    // set the route id
                                    subroute.id = r.id;

                                    // take our route and make a json/object format out of it
                                    var payload = ruze.routesToObject([subroute], strategy.routes[r.id].instances);

                                    // send it to the server as a request
                                    client.socket.emit(CREATE_CHANNEL, {id: ruze.id, request: payload, container: proxyContainer}, function (data) {

                                        // we're going to make a local remotecomponent in the route to represent this whole thing
                                        var rc = new remotecomponent({ruze:ruze, from:subroute.route[0], next:subroute.next, route:subroute, client:true});
                                        rc.addSocket(client.socket, client.socket.id || strategy.client);
                                        // add it to computed
                                        sub.push(rc.endpoint);
                                        // add it to our loader endpoint map
                                        endpoints[rc.endpoint.id] = {config: rc.endpoint, instance: rc};
                                        deferred.resolve();
                                    })
                                    return deferred.promise;
                                })
                            // keep track of all the promises
                            requests.push(promise);
                        }
                    }
                    idx++;
                    priorContainer = container;
                }, this);
            }, this)

            // run all of the creates in parallel, then keep going
            return Q.allResolved(requests).then(function () {
                    return strategy;
            })

        };
        remoteloader.fn.remove = function (endpoint) {
            if (this.endpoints[endpoint.id || endpoint]){
                delete this.endpoints[endpoint.id || endpoint];
            }
        }

        var ruze = function (options) {
            this.options = options;
            this.id = options && options.id || uuid.v4();
            this.loaders = {local: new localloader(this), remote: new remoteloader(this)}
            this.loaders.local.components.remote = {config: true, component: remotecomponent};
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

            //var self = this;

            // first init the basics
            var loadDefinition = _.bind(function (newRoutes) {
                if (!newRoutes) newRoutes = {};
                var routeCreation = function (r) {
                    newRoutes[r.id] = r;
                }
                this.events().addListener('route', routeCreation);
                if (typeof definition == 'string') {
                    // load from text
                    var obj = JSON.parse(config);
                    this.configFromObject(obj)
                } else if (typeof definition == 'function') {
                    definition(_.bind(this.from, this));
                } else {
                    throw new Error('ruze cannot parse configuration with value of ' + (typeof definition));
                }
                this.events().removeListener('route', routeCreation);
                return newRoutes;
            }, this);

            var promise = this.configuration;
            var loadall = this.loadall;
            var preload = _.compact(this.preload)
            if (!loadall || !promise) {
                var strategy = {components: preload, configure: {local: preload}};
                var self = this;
                promise = this._load(strategy)
                    .then(function () {
                        return self._configure(strategy).then(function () {
                            return {}
                        });
                    })
                this.loadall = true;
                if (definition) {
                    promise.then(loadDefinition);
                }
            } else if (definition) {
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


        // step 1 in building is usually load-- it takes what we need and loads it across local and remote contexts
        ruze.fn._load = function (strategy, local) {
            return this._doLoaders('load', strategy, local);
        };

        // step two is a bind strategy, based on what is available, based on step 1, this picks out who is going to do what unless explicitly specified
        ruze.fn._bindStrategy = function (strategy) {

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
                var runs = {id: r.id, route: []}, curRun;
                var placeholder = [];
                strategy.computed[r.id] = placeholder;
                _.each(r.route, function (sequence) {
                    var curEp = sequence;
                    // first check the container for the current one
                    var curContainer = curEp.container;

                    var unknown = null;
                    if (strategy.unknown && strategy.unknown[curContainer]) {
                        unknown = strategy.unknown[curContainer]
                    }

//                    var terminate = false;
//                    if ((priorContainer == 'local' || !priorContainer) && curContainer != 'local'
//                        && runs.route && runs.route.length && r.route.length-1 == i)
//                        terminate = true;

                    var terminate = false;
                    if (runs.route && runs.route.length && r.route.length-1 == i){
                        terminate = true;
                        if (curContainer == 'local' && priorContainer != 'local')
                            terminate = false;
                    }

                    //todo:  curContainer - what todo when curConatiner is unknown now that runs contain mixed remote components?
                    if (curContainer) {
                        // we are starting a new run.
                        if (!priorContainer || (curContainer != 'local' && priorContainer == 'local') || (priorContainer != 'local' && curContainer =='local')) {
//                        if (curContainer != priorContainer && (!unknown || unknown != priorContainer)) {
                            curRun = [];
                            runs.route.push({container: curContainer, route: curRun})
//                            if ((priorContainer == 'local') && curContainer != 'local' && runs.route && runs.route.length)
//                                runs.route[runs.route.length-1].terminate = true;
                            placeholder.push([]);
                        }
                        priorContainer = curContainer;
                        curRun.push(curEp);
                    } else if (cache[curEp.id]) {
                        // get the container from our cache --
                        curContainer = cache[curEp.id];
                        if (!priorContainer || (curContainer != 'local' && priorContainer == 'local') || (priorContainer != 'local' && curContainer =='local')) {
//                        if (curContainer != priorContainer && (!unknown || unknown != priorContainer)) {
                            curRun = [];
                            runs.route.push({container: curContainer, route: curRun})
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
                        self.rewriteEndpointId(curEp);
                        curRun = [];
                        runs.route.push({container: bestContainer, route: curRun})
//                        if ((priorContainer == 'local' || !priorContainer) && bestContainer != 'local' && runs.route && runs.route.length)
//                            runs.route[runs.route.length-1].terminate = true;
                        priorContainer = bestContainer;
                        placeholder.push([]);

                        curRun.push(curEp);
                    }
                    if (runs.route && runs.route.length && r.route.length-1 == i && terminate)
                        runs.route[runs.route.length-1].terminate = true;


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
                _.each(runs.route, function (run) {
                    if (prevRun) {
                        prevRun.next = run.route[0];
                    }
                    prevRun = run;
                })

                strategy.strategy[runs.id] = runs;
            }, this);
            return strategy;
        };

        // step 3 is to have the loaders configure the selected components, per container
        ruze.fn._configure = function (strategy, local) {
            return this._doLoaders('configure', strategy, local);
        };

        // step 4 takes the strategy developed in _bindStrategy and creates all of the endpoints locally and remotely
        ruze.fn._create = function (strategy, local) {
            return this._doLoaders('create', strategy, local);
        };

        ruze.fn._remove = function (endpoint, local) {
            return this._doLoaders('remove', endpoint, local);
        };


        // a convenience function for some of the steps above
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

        // convenience function will find a stored endpoint across loaders, if it exists
        ruze.fn.getEndpoint = function (endpoint) {
            var ep = null;
            _.each(this.loaders, function (v, k) {
                var id = (endpoint.id) ? endpoint.id : endpoint;
                if (v.endpoints[id])
                    ep = v.endpoints[id];
            })
            return ep;
        }

        // step 5 takes all created endpoints, now in the .computed field and sets up the local event emitter event structure
        ruze.fn._buildRecipientsAndEvents = function (strategy) {
            // for each route
            // ok, now that we have that aligned, need to do the recipient Lists at the route level

            var deltaToStart = {};
            _.each(strategy.computed, function (computed, id) {

                // here's where we save/setup things
                var stratRoute = strategy.routes[id];
                if (!this.routes[id]) {
                    this.routes[id] = stratRoute;
                    deltaToStart[id] = stratRoute;
                    stratRoute.strategy = strategy.strategy[id];
                    stratRoute.computed = computed;

                    var sequence = stratRoute.sequence = _.flatten(computed);
                    var first = _.first(sequence), last = _.last(sequence);
                    _.each(sequence, function (curEp) {
                        var cur = this.getEndpoint(curEp);

                        if (curEp.id == first.id) {
                            var client = strategy.client || 'local';
                            if (!cur.process) cur.process = {};
                            if (!cur.process[client]) cur.process[client] = [];
                            if (!_.contains(cur.process[client],id))
                                cur.process[client].push(id);
                        }

                        // setup events, this is the basis for how the routing works with producers and consumers
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
                                            if (e.out || !_.isEmpty(e.out))
                                                e.in = e.out;
                                            e.out = {header: {}, recipientList: null};

                                            self.emitRecipients(cur.config,e, true);

                                        });
                                    }
                                } else {

//                                    if (exchange.out || !_.isEmpty(exchange.out))
//                                        exchange.in = exchange.out;
//                                    exchange.out = {header: {}, recipientList: null};

                                    if (instance.produce) {
                                        instance.produce(exchange, function (err, e) {
                                            if (err) throw err;

                                            e.fromEndpoint = _.clone({}, cur.config);
                                            if (e.out || !_.isEmpty(e.out))
                                                e.in = e.out;
                                            e.out = {header: {}, recipientList: null};

                                            self.emitRecipients(cur.config,e);

                                        });
                                    } else {
                                        throw new Error('produce called, but no produce method on endpoint', cur.config.id);
                                    }
                                }
                            })
                        }
                    }, this);
                    stratRoute.built = true;
                }
            }, this);
            return deltaToStart;

        };

        ruze.fn._removeRoute = function(rte){
            var id = rte.id, self = this;
            if (this.routes[id]){
                _.each(rte.route, function(endpoint){

                    this._removeEndpoint(endpoint);

                },this)
                delete this.routes[id];
            }
        }

        ruze.fn._removeEndpoint = function(endpoint){
            // remove the listeners
            this.events().removeAllListeners(endpoint.id || endpoint);
            this._remove(endpoint.id || endpoint);
        }

        ruze.fn.emitRecipients = function (ep, exchange, consume) {
            var ruze = this;
            // exchange overrides

            var endpoint = this.getEndpoint(ep.id || ep);
            var rl = exchange.out && exchange.out.recipientList;

            if (rl){
                _.each(rl, function (recip) {
                    //todo:  if we extend exchange, should it get a new uuid - is it part of the original or a new thing?
                    var e = cutils.clone(exchange);
                    delete e.process;
                    delete e.out.recipientList;
                    delete e.in.recipientList;
                    ruze.events().emit(recip.id || recip, e);
                }, this)
            } else if (exchange.process && exchange.process.length){

                var next = exchange.process.shift();
                var id = exchange.routeId;
                if (!exchange.process.length && !_.contains(exchange.done, id)) exchange.done.push(id);

                console.log('run ',next.id)

                ruze.events().emit(next.id || next, exchange);
            } else if (endpoint && endpoint.process){

                // this section kicks off new routes..

                //todo:  we need to make sure that the client owns or has access to the route
                var e = exchange;
                if (!e.done) e.done = [];

                var client = e.properties && e.properties.socket || 'local';

                var routesToProcess = endpoint.process[client] || [];
                var localToProcess = endpoint.process['local'] || [];
                if (client != 'local'){
                    routesToProcess = _.union(routesToProcess,localToProcess);
                }

                // kick off any other this node has
                var diff = _.difference(routesToProcess, e.done);
                if (diff && diff.length) {
                    _.each(diff, function (routeId) {
                        var cloneEx = (consume)? e : cutils.clone( e);
                        cloneEx.routeId = routeId;
                        var process = this.routes[routeId].sequence;
                        var copy = cloneEx.process = process.slice(0);
                        if (copy && copy.length){
                            var next = cloneEx.process.shift();
                            if (consume) next = cloneEx.process.shift();
//                            if (cloneEx.out) {
//                                cloneEx.in = cloneEx.out;
//                                cloneEx.out = {header: {}, recipientList: null};
//                            }
                            console.log('run ',next && next.id)

                            ruze.events().emit(next.id || next, cloneEx);
                        }
                    },this);
                }
            } else {
//                console.log('ended route at ',ep.id);
            }
        }

        // step 6 fires start events on built routes after everything is wired up in step 5
        ruze.fn._fireStart = function (routesToStart) {
            _.each(routesToStart, function (v, k) {
                var r = (typeof v == 'string') ? routesToStart[v] : v;
                if (r && r.built) {
                    this.events().emit(r.startEvent());
                } else {
                    throw new Error('route does not exist [' + v + '] or did not build');
                }
            }, this);
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

            var endpoint = {component: component, container: container, object: object, args: obj}
            this.rewriteEndpointId(endpoint);

            return endpoint;
        }

        // convenience function allows you to change the container then rewrite the component id
        ruze.fn.rewriteEndpointId = function (endpoint) {
            var tail = (endpoint.args && endpoint.args.length) ? '?' + cutils.normalize(endpoint.args) : '';
            var id = (endpoint.container) ?
                endpoint.container + ':' + endpoint.component + ':' + endpoint.object + tail :
                endpoint.component + ':' + endpoint.object + tail;

            endpoint.id = id;

        }

        // convenience function for writing plugins-- allows a consumer to generate a prepopulated exchange
        ruze.fn.newExchange = function () {
            return _.extend({}, exTemplate, {id: uuid.v4()});
        }

        // the beginning of a route definition takes an endpoint string or array..  name allows you to optionally name the route
        ruze.fn.from = function (arg, name, id) {
            var r = new route(this, name, id);
            if (!this.routes) this.routes = {};
            //this.routes[r.id] = r;
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

            var self = this;

            //todo:  this thing is actually broken now -- routes and callback need to enter into the Q process upfront

            return this.configuration.then(
                function (routes) {
                    if (args && args.length) {
                        _.each(args, function (arg) {
                            routes[arg.id] = arg;
                            arg.locallyDefined = true;
                        })
                    }
                    var unBuilt = {};
                    _.each(routes, function (v, k) {
                        if (!v.built) unBuilt[k] = v;
                    });

                    return {routes: unBuilt, components: self._getComponents(_.values(unBuilt))};
                }).then(function (strategy) {
                    return self._start(strategy, callback);
                });
        }

        // this is the internal route build and start function, used above but also by remoteloader
        ruze.fn._start = function (strategy, callback) {
            var self = this;

            self._load(strategy)
                .then(function (strategy) {
                    return self._bindStrategy(strategy);
                }).then(function (strategy) {
                    return self._configure(strategy)
                }).then(function (strategy) {
                    return self._create(strategy);
                }).then(function (strategy) {
                    return self._buildRecipientsAndEvents(strategy)
                }).then(function (routes) {
                    return self._fireStart(routes)
                }).done(callback);

        }

        // convenence function will tell you what components are defined across an array of routes
        ruze.fn._getComponents = function (routes) {
            var components = [];
            _.each(routes, function (r) {
                components = (components.length) ? _.union(r._getComponents(), components) : r._getComponents();
            })
            return _.compact(components);
        }

        // this allows you to define a single endpoint/route - for example when doing mock testing
        ruze.fn.endpoint = function (end, cb, instance, recipients) {
            var parsed = this.parseEndpoint([end]);
            var self = this;
            if (self.getEndpoint(parsed.id)) {
                return Q.fcall(function () {
                    cb(self.getEndpoint[parsed.id].instance, parsed)
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
                var strategy = {routes: routes, components: this._getComponents([r])};

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
                        if (!self.routes[r.id]) {
                            self.routes[r.id] = r;
                        }

                        var ep = self.getEndpoint(r.route[0].id);

                        if (recipients) {
                            // todo - change to map per route
                            ep.config.recipientList = recipients;
                        }
                        if (cb)
                            cb(ep && ep.instance, ep.config);
                    })
            }
        }

        // send a new payload to an endpoint - used a lot with testing and mocks
        ruze.fn.send = function (endpoint, body, cb) {
            var ep = (endpoint.id) ? endpoint : this.parseEndpoint([endpoint]);
            if (!ep.container) {
                ep.container = 'local';
                this.rewriteEndpointId(ep);
            }
            var ex = this.newExchange(ep.id);
            ex.out.body = body;
            this.emitRecipients(ep.id, ex);
        }

        // todo:  need to make this better, do I really want this extraneous package even if it looks nice?
        // define themes for printing out internal status
        if (colors) {
            colors.setTheme({
                label: 'grey',
                line: 'grey',
                section: 'black',
                interest: 'black',
                emphasis: 'red'
            });
        }

        // will create a string for printing or html display that shows internal diagnostics, routes, endpoints, etc
        ruze.fn.print = function () {
            var print = '';
            print += ('Configuration'.interest);
            print += '\n' + ('=============================================================================================='.line);
            print += '\n' + ('Active Routes:'.section);
            _.each(this.routes, function (r) {
                print += '\n' + ('+ route '.label + ('(' + r.id + ')').interest);
                print += '\n' + ('     |- defined  '.label + ('(' + _.pluck(r.route, 'id').join(')\n                  -> (') + ')').emphasis)
                if (r.computed) {
                    var computed = _.flatten(r.computed);
                    print += '\n' + ('     |- computed '.label + ('(' + _.pluck(computed, 'id').join(')\n                  -> (') + ')').emphasis)
                }
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

        // used by plugin components that want to extend the DSL
        ruze.fn.mixin = function (name, f) {
            if (this.route_type[name])
                throw new Error('mixin collision! beeatch. ', name);
            this.route_type[name] = f;
        }
        ruze.fn.route_type = route.fn;

        // convenence function that will build out a route calling the right DSL functions.  optionally takes a local argument string that will replace
        //  any container identifiers with local..  e.g. local='local' or local='myserver', leaves everything else alone
        ruze.fn.configFromObject = function (json, local, keepIds) {
            var routes = {};
            if (json.plugins) {
                if (!this.options) this.options = {};
                this.options.plugins = json.plugins;
            }

            json.mapped = {};

            // do the routes..
            _.each(json.routes, function (rte) {
                var name = rte.name;
                var id = (keepIds) ? rte.id :null;
                var routeBuild = this;
                if (rte.route) {
                    _.each(rte.route, function (obj) {
                        var func = _.keys(obj)[0];
                        var val = _.values(obj)[0];

                        if (func == 'from' || func == 'to' && local) {
                            var clone = _.extend({}, this.parseEndpoint([val]));
                            if (clone.container == local)
                                clone.container = 'local';
                            this.rewriteEndpointId(clone);
                            val = clone.id;
                        }

                        if (routeBuild && routeBuild[func]) {
                            if (func == 'from') {
                                routeBuild = routeBuild[func].call(routeBuild, val, name, id);
                            } else {
                                routeBuild = routeBuild[func].call(routeBuild, val);
                            }
                        } else {
                            throw new Error('ruze does not support function "' + func + '"')
                        }
                    }, this)
                }
                if (routeBuild) {
                    json.mapped[routeBuild.id] = rte;
                    routes[routeBuild.id] = routeBuild;
                }
            }, this);

            return routes;
        }

        // will turn a list of routes into an object/json representation.. pass in instances to refer to
        ruze.fn.routesToObject = function (routes, instances) {
            var result = {};
            result.routes = {};

            _.each(routes, function (rte) {
                var r = {route: []};
                r.name = rte.name;
                r.id = rte.id;
                r.terminate = rte.terminate;
                r.container = rte.container;
                var first = true;
                _.each(rte.route, function (obj) {
                    var ep = (obj.id) ? obj : this.parseEndpoint([obj]);

                    // look it up in local
                    var clone = _.extend({}, ep);
                    clone.container = 'local';
                    this.rewriteEndpointId(clone);

                    var instance = instances && instances[clone.id];

                    // if it has a to Object method..
                    if (instance && instance.toObject) {
                        // see if we can get the instance as its probably rewritten
                        r.route.push(instance.toObject());
                    } else if (first) {
                        r.route.push({from: ep.id});
                    } else {
                        r.route.push({to: ep.id});
                    }
                    first = false;

                }, this);
                result.routes[r.id] = r;
            }, this)
            return result;
        }


        return ruze;
    });