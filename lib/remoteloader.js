if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

requirejs.config({
    paths: {
        remotecomponent: './remotecomponent'
    },
    waitSeconds: 0
});


define(['require','q','underscore','node-uuid','remotecomponent'],function (require) {

    var Q = require('q'), _ = require('underscore'), uuid = require('node-uuid'), remotecomponent = require('remotecomponent');

    // these are our preset channels
    var RUZE = 'ruze';
    var ID_CHANNEL = RUZE + '.id';
    var SEARCH_CHANNEL = RUZE + '.search';
    var LOAD_CHANNEL = RUZE + '.load';
    var CONFIG_CHANNEL = RUZE + '.config';
    var CREATE_CHANNEL = RUZE + '.create';
    var DISCONNECT_CHANNEL = RUZE + '.disconnect';
    var RECONNECT_CHANNEL = RUZE + '.reconnect';

    // remoteloader uses remote components to represent a route on a server
    var remoteloader = function (ruze) {

        // keep track of our remote component endpoints
        this.endpoints = {};
        this.endpointsBySocket = {};
        this.ruze = ruze;

        // we grab io, for use on clients; also listen is our server socket.io instance; connect is the list of clients
        var io = this.io = ruze.options && ruze.options.io;
        var listen = this.listen = ruze.options && ruze.options.listen;

        if (listen){
            this.createServer(listen);
        }

        if (io){
            this.createClients(io);
        }

    };

    remoteloader.fn = remoteloader.prototype;

    remoteloader.fn.createClients = function(io) {
        var self = this, ruze = this.ruze;
        var io_timeout = this.io_timeout = ruze.options && ruze.options.io_timeout || 5000;
        var connect = this.connect = ruze.options && ruze.options.connect;

        if (io) {
            // keep track of our connections
            this.connections = {};
            this.rebuild = false;

            // we use ready to make sure that for each client channel we have a real socket connection
            this._ready = _.bind(function (channel, cb) {
                var client = this.connections[channel.name]
                if (!client) {
                    client = {};
                    client.firstConnect = true;
                    client.ready = false;
                    client.url = channel.url;
                    this.connections[channel.name] = client;
                }
                if (!client.ready){
                    ruze.log('connecting to ',channel.url)
                    if (client.socket){
                        client.socket.socket.connect();
                    } else {
                        client.socket = io.connect(channel.url, { 'connect timeout': io_timeout });
                    }
                    var socket = client.socket;

                    var disconnectAction = function(){
                        var socketId = client.socket && client.socket.id || client.socket && client.socket.socket && client.socket.socket.sessionid;
                        var remotes = _.values(self.endpointsBySocket[socketId]);
                        if (remotes){
                            _.each(remotes, function(remote){
                                // first just remove the socket
                                var epHolder = ruze.getEndpoint(remote.endpoint.id);
                                remote.removeSocket(socketId);

                                if (remote.sockets && _.isEmpty(_.keys(remote.sockets))) {
                                    // remove the route..
                                    var remoteRouteId = remote.parent;
                                    var rebuildRoute = remoteRouteId && ruze.routes[remoteRouteId];

                                    if (rebuildRoute && !self.rebuild[remoteRouteId]){
                                        rebuildRoute.built = false;

                                        if (rebuildRoute.locallyDefined){
                                            self.rebuild = true;
                                        } else {

                                            // need to get the owner's socket and fire a special deconnect msg
                                            var clientRemoteId = _.last(rebuildRoute.route).id;

                                            if (clientRemoteId){
                                                var clientRemote = ruze.getEndpoint(clientRemoteId).instance;
                                                if (clientRemote && clientRemote.sockets){
                                                    // get the sockets, notify them and shove them in the client
                                                    if (!client.notifyReconnects)
                                                        client.notifyReconnects = {};

                                                    _.each(_.keys(clientRemote.sockets), function(sid){
                                                        var sock = clientRemote.sockets[sid];
                                                        if (sock){
                                                            if (!client.notifyReconnects[sid]){
                                                                client.notifyReconnects[sid] = sock;
                                                                ruze.log('!!disconnect fired ',clientRemote.from.id)
                                                                sock.emit(DISCONNECT_CHANNEL, {id: ruze.id, from: clientRemote.from, sid:sid});
                                                            }
                                                        }
                                                    }, this);
                                                }
                                            }
                                        }
                                        ruze._removeRoute(rebuildRoute);
                                        delete rebuildRoute.sequence;
                                        delete rebuildRoute.strategy;
                                        delete rebuildRoute.computed;

                                    }
                                }
                            })
                        }

//                        var toDelete = [];
//                        _.each(self.endpoints, function(ep,id){
//                            if (ep.refCount < 1) toDelete.push(id);
//                            ruze._removeEndpoint(id);
//                        });
//
//                        self.endpoints = _.difference(self.endpoints, toDelete);

                        client.ready = false;
                    }


                    var connectAction = function(cb){
                        socket.emit(ID_CHANNEL, ruze.id, function (data) {
                            client.id = data.id;
                            client.ready = true;
                            var rebuild = self.rebuild;
                            var notify = false;
                            var map = {};
                            if (client.notifyReconnects){
                                map = _.extend({}, client.notifyReconnects);
                                client.notifyReconnects = {};
                                notify = !_.isEmpty(map);
                            }

                            var emitFunc = function(){
                                _.each(_.keys(map), function(sid){
                                    var sock = map[sid];
                                    if (sock){
                                        ruze.log('!!reconnect fired ',sid)
                                        sock.emit(RECONNECT_CHANNEL, {id: ruze.id, sid:sid});
                                    }
                                })
                            }

                            if (rebuild && notify){
                                self.rebuild = false;
                                self.ruze.start(emitFunc);
                            } else if (rebuild){
                                self.rebuild = false;
                                self.ruze.start();
                            } else if (notify) {
                                emitFunc();
                            }

                            if (cb) cb(null, client);
                        });
                    };

                    var createSingleListener = function(evt, c){
                        var l = socket.listeners(evt);
                        if (!l || !l.length){
                            socket.on(evt,c);
                        }
                    }

                    createSingleListener('connect_failed', function (e) {
                        ruze.log('could not connect to ',channel.url)
                        disconnectAction();
                    })
                    createSingleListener(DISCONNECT_CHANNEL, function (data) {
                        ruze.log('disconnect channel ',data.from, data.sid)
                        disconnectAction();
                    })
                    createSingleListener(RECONNECT_CHANNEL, function (data) {
                        ruze.log('reconnect channel ',data.sid)
                        connectAction();
                    })
                    createSingleListener('disconnect', function (e) {
                        ruze.log('disconnected from ',channel.url)
                        disconnectAction();
                    })
                    createSingleListener('error', function (e) {
                        // todo: fix socket.io it shouldn't kill my server when I can't connect to something
                        ruze.log('error occurred on ',channel.url,arguments)
                        disconnectAction();
                    })
                    createSingleListener('connect', function () {
                        ruze.log('connected to ', channel.url)
                        if (client.firstConnect){
                            client.firstConnect = false;
                            connectAction(cb);
                        } else {
                            connectAction();
                        }
                    });
                    createSingleListener('reconnect', function () {
                        ruze.log('reconnected to ', channel.url)
                    });
                } else {
                    cb(null, client);
                }

            }, this);
            this.ready = Q.nfbind(this._ready);
        }
    };

    remoteloader.fn.createServer = function(listen){
        var self = this, ruze = this.ruze;
        // if we're a server
        if (listen) {

            // on connect, we have to define a bunch of channels
            listen.on('connection', function (socket) {

                socket.on('disconnect', function(){
                    var remotes = _.values(self.endpointsBySocket[socket.id]);
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
                    ruze.log('server', ID_CHANNEL)
                    fn({id: ruze.id})
                })

                // searching for components on other servers...
                socket.on(SEARCH_CHANNEL, function (data) {
                    ruze.log('server', SEARCH_CHANNEL)
                    // looking for a component..
                    if (data.request && data.component && _.contains(_.keys(ruze.cps), data.component)) {
                        socket.emit(SEARCH_CHANNEL, {id: ruze.id, component: data.component})
                    }
                });


                // we've been asked to load components
                socket.on(LOAD_CHANNEL, function (data, fn) {
                    ruze.log('server', LOAD_CHANNEL)

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

                socket.on(DISCONNECT_CHANNEL, function (data) {
                    ruze.log('server', DISCONNECT_CHANNEL)

                    var from = data.from;
                    if (from && from.id){
                        _.each(self.endpoints, function(ep, id){
                            var sockets = ep.instance.sockets;
                            if (ep.instance.from.id == from.id && sockets){
                                var socketId = socket.id || socket.socket && socket.socket.sessionid;
                                ep.instance.removeSocket(socketId);
                                if (!sockets || !sockets.length){
                                    var remoteRouteId = ep.instance.parent;
                                    var rebuildRoute = remoteRouteId && ruze.routes[remoteRouteId];
                                    if (rebuildRoute){
                                        ruze._removeRoute(rebuildRoute);
                                        delete rebuildRoute.sequence;
                                        delete rebuildRoute.strategy;
                                        delete rebuildRoute.computed;
                                    }
                                }
                                return false;
                            }
                        },this);
                    }


                });

                // we've been asked to configure components
                socket.on(CONFIG_CHANNEL, function (data, fn) {
                    ruze.log('server', CONFIG_CHANNEL)
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
                    ruze.log('server', CREATE_CHANNEL)

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
                                var entryRC = new remotecomponent({ruze:ruze, from:callbackEp, next:subroute.route[0], route:subroute, terminate:callbackRoute.terminate, parent:subroute.id, client:false});
                                // add this as a new socket to use
                                entryRC.addSocket(socket,socketId);
                                if (!self.endpointsBySocket[socketId]) self.endpointsBySocket[socketId] = {};
                                self.endpointsBySocket[socketId][entryRC.endpoint.id] = entryRC;
                                // add our new remote component to the end of the route, so its the last thing called when processing

                                subroute.route.push(entryRC.endpoint);

                                // save it off as an instance in both the route and in our loader
                                subroute.instances[entryRC.endpoint.id] = entryRC;
                                self.endpoints[entryRC.endpoint.id] = {config: entryRC.endpoint, instance: entryRC, refCount:0};

                                // add the new route to process into the map we're building up
                                toProcess[subroute.id] = subroute;
                            } else {

                                // if we already built this remote component, we just need to add a new socket for the requestor
                                existing.instance.addSocket(socket, socketId);
                                //existing.refCount++;
                                if (!self.endpointsBySocket[socketId]) self.endpointsBySocket[socketId] = {};
                                self.endpointsBySocket[socketId][existing.config.id] = existing.instance;
                            }
                        }
                    }, this);

                    // if we have new routes to process, do it
                    if (!_.isEmpty(toProcess)) {

                        // make a new strategy with those routes and components
                        var strategy = {client:socketId, routes: toProcess, components: ruze._getComponents(_.values(toProcess))};

                        // use our internal start to the build process
                        ruze._start.call(ruze, strategy).done(function () {
                            fn({id: ruze.id})
                        });
                    } else {
                        // we're done, just return to socket.io
                        fn({id: ruze.id})
                    }


                })

            })
        } else {
            throw Error('attempted to create server but no socket.io (null)')
        }
    };

    // we've been asked to load something by the build process
    remoteloader.fn.load = function (strategy) {
        var self = this, ruze = this.ruze;

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
        var self = this, ruze = this.ruze;

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
        var endpointsBySocket = this.endpointsBySocket;
        var requests = [];
        var reqByChannel = {};
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
                    //existing.refCount++;
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

                        // set the route id
                        subroute.id = uuid.v4();

                        // take our route and make a json/object format out of it

                        // we're going to make a local remotecomponent in the route to represent this whole thing
//                            var rc = new remotecomponent({ruze:ruze, from:subroute.route[0], next:subroute.next, route:subroute, client:true});
                        var rc = new remotecomponent({ruze:ruze, from:subroute.route[0], next:subroute.next, route:subroute, parent: r.id, client:true});
                        // add it to computed
                        sub.push(rc.endpoint);
                        // add it to our loader endpoint map
                        endpoints[rc.endpoint.id] = {config: rc.endpoint, instance: rc, refCount:0};

                        var req = {channel:channel, container:proxyContainer, rcs:[], payload:{}};
                        if (reqByChannel[channel]){
                            req = reqByChannel[channel];
                        } else {
                            reqByChannel[channel] = req;
                        }
                        // copy the processed routes over

                        var pl = req.payload[r.id];
                        if (!pl){
                            req.payload[r.id] = pl = [];
                        }
                        pl.push(subroute);
                        req.rcs.push(rc);

                    }
                }
                idx++;
                priorContainer = container;
            }, this);
        }, this)

        _.each(_.values(reqByChannel), function(req){
            // make our promise that checks that the socket is real, then does the create request logic
            var promise = this.ready({name: req.container, url: req.channel})
                .then(function (client) {
                    var deferred = Q.defer();
                    var socketId = client.socket && client.socket.id || client.socket && client.socket.socket && client.socket.socket.sessionid;
                    _.each(req.rcs, function(rc){
                        rc.addSocket(client.socket, socketId || strategy.client);
                        if (!endpointsBySocket[socketId]) endpointsBySocket[socketId] = {};
                        endpointsBySocket[socketId][rc.endpoint.id] = rc;
                    });

                    var payload = {routes:{}};
                    _.each(_.keys(req.payload), function(rid){
                        var pl = ruze.routesToObject(req.payload[rid], strategy.routes[rid].instances);
                        payload.routes = _.extend(payload.routes,pl.routes);
                    },this);


                    // send it to the server as a request
                    client.socket.emit(CREATE_CHANNEL, {id: ruze.id, request: payload, container: req.container}, function (data) {
                        deferred.resolve();
                    });
                    return deferred.promise;
                })
            // keep track of all the promises
            requests.push(promise);
        },this)

        // run all of the creates in parallel, then keep going
        return Q.allResolved(requests).then(function () {
            return strategy;
        })

    };
    remoteloader.fn.remove = function (endpoint) {
        var ep = this.endpoints[endpoint.id || endpoint];

        var delSockets = _.bind(function(comp){
            _.each(this.endpointsBySocket, function(arr, socketid){
                this.endpointsBySocket[socketid] = _.omit(arr, comp.config.id);
            }, this);
            _.each(this.endpointsBySocket, function(arr, socketid){
                if (!this.endpointsBySocket[socketid].length)
                    delete this.endpointsBySocket[socketid];
            }, this);
        },this);

        if (ep){
            if (ep.instance.finalize){
                ep.instance.finalize(_.bind(function(e){
                    if (e) throw e;
                    delete this.endpoints[ep.config.id];
                    delSockets(ep);
                },this));
            } else {
                delete this.endpoints[ep.config.id];
                delSockets(ep);
            }
        }
    }

    return remoteloader;

});
