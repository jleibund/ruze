var isServer = true;
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
} else {
    isServer = false;
}

define(['require', 'underscore', 'q'], function (require) {

    var _ = require('underscore') || exports._,
        Q = require('q');

    var back = (isServer) ? '..' : '.';

    var PLUGIN_DIR = './plugin';
    var SERVER_DIR = '../extras/server';
    var CLIENT_DIR = back + '/extras/client';
    var USER_DIR = back + '/user';

    var NATIVE_COMPS = {};
    NATIVE_COMPS['console'] = PLUGIN_DIR;
    NATIVE_COMPS['direct'] = PLUGIN_DIR;
    NATIVE_COMPS['expr'] = PLUGIN_DIR;
    NATIVE_COMPS['mock'] = PLUGIN_DIR;
    NATIVE_COMPS['process'] = PLUGIN_DIR;
    NATIVE_COMPS['when'] = PLUGIN_DIR;
    NATIVE_COMPS['file'] = SERVER_DIR;
    NATIVE_COMPS['dom'] = CLIENT_DIR;
    var USER_COMPS = {};

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

    }
    localloader.fn = localloader.prototype;

    localloader.fn.loadComponents = function (components, dir) {
        if (!_.isArray(components)) {
            components = [components];
        }
        _.each(components, function (c) {
            if (!_.contains(USER_COMPS, c)) {
                USER_COMPS[c] = (dir) ? dir : USER_DIR;
            }
        })
    }

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
            var native = NATIVE_COMPS[name];
            var user = USER_COMPS[name];
            if (!native && !user)
                throw Error('component ' + name + ' is not mapped to a directory');
            var p = (native) ? (native + '/' + name + '/' + name) : (user + '/' + name + '/' + name);
            lookup[name] = [p];
        }, this);

        // reset requirejs to use our search paths for components, enforceDefine for these.  they should be in the prescribed format

        var processResults = function (results) {
            // run through everything that loaded, in order
            for (var j = 0; j < neededList.length; j++) {
                var name = neededList[j]
                var comp = (results.length > j) ? results[j] : null;
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
        }

        if (isServer) {
            var arr = [];
            _.each(lookup, function (pathArr, name) {
                var path = pathArr[0];
                arr.push(require(path));
            })
            processResults(arr);

        } else {
            requirejs.config({
                enforceDefine: true,
                paths: lookup
            })

            requirejs(neededList, function () {
                processResults(arguments);
            })
        }

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
                if (componentHolder && !componentHolder.config) {
                    configList.push(qconfig(componentHolder));
                } else if (!componentHolder) {
                    throw Error('no such component! ' + comp);
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
                                endpoint = {config: ep, instance: instance, refCount: 0};
                                endpoints[ep.id] = endpoint;
                            }
                        }

                        // if we have a component loaded, but no instance in the loader or in the route, its time to make one
                        if (!instance && component) {
                            var options = ruze.options && ruze.options.plugins && ruze.options.plugins[ep.component];

                            // make the new instance, pass in options to ruze, it can look up its own stuff, if its stuff is there
                            instance = new component(options);

                            // add a new endpoint definition to the local loader.. we save the endpoint defn in config and the instance
                            endpoint = endpoints[ep.id] = {instance: instance, config: ep, refCount: 0};

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
                        endpoint.refCount++;
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
        var ep = this.endpoints[endpoint.id || endpoint];
        if (ep) {
            if (ep.instance.finalize) {
                ep.instance.finalize(_.bind(function (e) {
                    if (e) throw e;
                    delete this.endpoints[endpoint.id || endpoint];
                }, this));
            } else {
                delete this.endpoints[endpoint.id || endpoint];
            }
        }
    }

    return localloader;
});