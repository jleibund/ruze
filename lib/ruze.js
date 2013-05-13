if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

requirejs.config({
    paths: {
        cutils: './cutils',
        remotecomponent: './remotecomponent',
        localloader: './localloader',
        remoteloader:'./remoteloader',
        path: './path'
    },
    waitSeconds: 0
})


requirejs.onError = function (err) {
    console.log('requirejs error-- type:', err.requireType, 'modules:',err.requireModules, 'message:', err.message)
    console.log(err)
}

define([ 'require', 'q', 'node-uuid', 'events', 'underscore', 'colors', 'cutils', 'remotecomponent',
    'localloader', 'remoteloader', 'exprjs'],

    function (require) {

        var  cutils = require('cutils');


        var uuid = require('node-uuid'),
            events = require('events'),
            _ = require('underscore') || exports._,
            Q = require('q'),
            colors = require('colors'),
            exprjs = require('exprjs'),
            remotecomponent = require('remotecomponent'),
            localloader = require('localloader'),
            remoteloader = require('remoteloader');

        var getUuid = function(){
            return uuid.v4();
        }

        // todo - should we spell out exceptions .fail() and .progress() using Q or just have the default handler catch them on done()?

        // these are just templates for some of the basic objects we use or store.
        var apTemplate = {id: null, container: null, component: null, object: null, args: {}};
        var exTemplate = {in: {header: {}, recipientList: null}, out: {header: {}, recipientList: null}, properties: {}, id: null, error: null, fromEndpoint: null};
        var compTemplate = {name: null, loaded: false, container: null};

        // routes define a sequence of endpoints that are linked together by recipient lists
        var route = function (ruze, name, id) {

            this.id = id || getUuid();
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

        var ruze = function (options) {
            this.options = options;
            this.id = options && options.id || getUuid();
            this.loaders = {local: new localloader(this), remote: new remoteloader(this)}
            this.loaders.local.components.remote = {config: true, component: remotecomponent};
            this.preload = options && options.preload || ['expr', 'when', 'process'];
            this.debug = options && options.debug || false;
            this.maxListeners = options && options.maxListeners || 0;
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

        ruze.fn.load = function(components){
            if (this.loaders.local)
                this.loaders.local.loadComponents(components);
        }


        ruze.fn.configure = function (definition) {

            //var self = this;

            // first init the basics
            var loadDefinition = _.bind(function (newRoutes) {
                if (!newRoutes) newRoutes = {};
                var routeCreation = function (r) {
                    newRoutes[r.id] = r;
                    r.locallyDefined = true;
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
                this.ee.setMaxListeners(this.maxListeners);
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

                var lastEp = r.route && r.route.length && r.route[r.route.length-1];
                var lastInstance = r.instances[lastEp.id];
                var hasServerRemote = lastInstance && (lastInstance instanceof remotecomponent && !lastInstance.client) || false;

                _.each(r.route, function (sequence) {
                    var curEp = sequence;
                    // first check the container for the current one
                    var curContainer = curEp.container;

                    var unknown = null;
                    if (strategy.unknown && strategy.unknown[curContainer]) {
                        unknown = strategy.unknown[curContainer];
                    }

                    var terminate = false;
                    var evalTerminate = (runs.route && runs.route.length && ((!hasServerRemote && r.route.length-1 == i) || (hasServerRemote && r.route.length-2 == i)));

                    //todo:  curContainer - what todo when curConatiner is unknown now that runs contain mixed remote components?
                    if (curContainer) {
                        if (evalTerminate){
                            terminate = true;
                            if (curContainer == 'local')
                                terminate = false;
                        }


                        // we are starting a new run.
                        if (!priorContainer || (curContainer != 'local' && priorContainer == 'local') || (priorContainer != 'local' && curContainer =='local')) {
                            curRun = [];
                            runs.route.push({container: curContainer, route: curRun})
                            placeholder.push([]);
                        }
                        priorContainer = curContainer;
                        curRun.push(curEp);
                    } else if (cache[curEp.id]) {
                        // get the container from our cache --
                        curContainer = cache[curEp.id];

                        if (evalTerminate){
                            terminate = true;
                            if (curContainer == 'local')
                                terminate = false;
                        }


                        if (!priorContainer || (curContainer != 'local' && priorContainer == 'local') || (priorContainer != 'local' && curContainer =='local')) {
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

                        if (evalTerminate){
                            terminate = true;
                            if (bestContainer == 'local')
                                terminate = false;
                        }

                        runs.route.push({container: bestContainer, route: curRun})
                        priorContainer = bestContainer;
                        placeholder.push([]);
                        curRun.push(curEp);
                    }
                    if (terminate && evalTerminate){
                        runs.route[runs.route.length-1].terminate = true;
                    } else {
                        runs.route[runs.route.length-1].terminate = false;
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
                if (!this.routes[id] || !this.routes[id].built) {
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
                        //var listeners = self.events().listeners(curEp.id);

                        self.events().removeAllListeners(cur.config.id);

//                        if (!listeners || !listeners.length) {
                            self.events().on(cur.config.id, function (exchange) {
                                if (!exchange) {
                                    if (instance.consume) {

                                        instance.consume(function (err, e) {
                                            if (err) throw err;
                                            e.fromEndpoint = _.clone({}, cur.config);
                                            if (e.out || !_.isEmpty(e.out)){
                                                e.in = e.out;
                                            }
                                            e.out = {header: {}, recipientList: null};

                                            self.emitRecipients(cur.config,e, true);

                                        });
                                    }
                                } else {

                                    if (instance.produce) {
                                        instance.produce(exchange, function (err, e) {
                                            if (err) throw err;

                                            e.fromEndpoint = _.clone({}, cur.config);
                                            if (e.out || !_.isEmpty(e.out)){
                                                e.in = e.out;
                                            }
                                            e.out = {header: {}, recipientList: null};

                                            self.emitRecipients(cur.config,e);

                                        });
                                    } else {
                                        throw new Error('produce called, but no produce method on endpoint', cur.config.id);
                                    }
                                }
                            })
                        //}
                    }, this);
                    stratRoute.built = true;
                }
            }, this);
            return deltaToStart;

        };

        ruze.fn._removeRoute = function(rte){
            var id = rte.id, self = this;
            if (this.routes[id]){
                var epHolder = this.getEndpoint(rte.sequence[0].id);

                if (epHolder.process){
                    _.each(epHolder.process, function(list, containerid){
                        epHolder.process[containerid] = _.without(epHolder.process[containerid],id);
                    },this);
                    var toDelete = [];
                    _.each(epHolder.process, function(list, containerid){
                        if (!epHolder.process[containerid].length)
                            toDelete.push(containerid)
                    },this);
                    epHolder.process = _.omit(epHolder.process, toDelete);
                    if (_.isEmpty(epHolder.process))
                        delete epHolder.process;
                }

                _.each(rte.sequence, function(endpoint){
                    this._removeEndpoint(endpoint);
                },this)

                delete this.routes[id];
            }
        }

        ruze.fn._removeEndpoint = function(endpoint){
            // remove the listeners
            var epHolder = this.getEndpoint(endpoint.id || endpoint);
            if (epHolder){
                epHolder.refCount--;
                if (epHolder.refCount < 1){
                    this.events().removeAllListeners(endpoint.id || endpoint);
                    this._remove(endpoint.id || endpoint);
                }
            }
        }

        ruze.fn.emitRecipients = function (ep, exchange, consume) {
            var ruze = this;
            // exchange overrides

            var endpoint = this.getEndpoint(ep.id || ep);
            var id = exchange.routeId;


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

                ruze.log('run ',next.id)

                var nextEp = this.getEndpoint(next.id);
                var runNewKickoff = nextEp && endpoint.process && (nextEp.instance instanceof remotecomponent && !nextEp.instance.client) || false;

                if (runNewKickoff)
                    ruze.events().emit(endpoint.config.id, exchange);

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
                    e.done = _.union(e.done,routesToProcess);
                    _.each(diff, function (routeId) {
                        var cloneEx = (consume)? e : cutils.clone( e);
                        cloneEx.routeId = routeId;
                        var process = this.routes[routeId].sequence;
                        var copy = cloneEx.process = process && process.slice(0) || [];
                        if (copy && copy.length){
                            var next = cloneEx.process.shift();
                            if (consume) next = cloneEx.process.shift();
                            ruze.log('run ',next && next.id)

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
            return _.extend({}, exTemplate, {id: getUuid()});
        }

        // the beginning of a route definition takes an endpoint string or array..  name allows you to optionally name the route
        ruze.fn.from = function (arg, name, id) {
            var r = new route(this, name, id);
            if (!this.routes) this.routes = {};
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
                    return self._start(strategy);
                }).done(callback);
        }

        // this is the internal route build and start function, used above but also by remoteloader
        ruze.fn._start = function (strategy) {
            var self = this;

            return self._load(strategy)
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
                });
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
            var ex = this.newExchange();
            ex.in.body = body;
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
                if (r){
                    print += '\n' + ('+ route '.label + ('(' + r.id + ')').interest);
                    print += '\n' + ('     |- defined  '.label + ('(' + _.pluck(r.route, 'id').join(')\n                  -> (') + ')').emphasis)
                    if (r.computed) {
                        var computed = _.flatten(r.computed);
                        print += '\n' + ('     |- computed '.label + ('(' + _.pluck(computed, 'id').join(')\n                  -> (') + ')').emphasis)
                    }
                } else {
                    print += '\n' + ('+ route '.label + ('(null)').interest);
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
        };

        ruze.fn.log = function(){
            if (this.debug) console.log.apply(console,arguments);
        }


        return ruze;
    });