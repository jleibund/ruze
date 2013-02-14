define([ 'node-uuid', 'events', 'underscore'], function(uuid, events, _){

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
        var self = this;
        this.factory(ep, function (instance) {
            self.init(ep, instance);
        });
        return this;
    };

    route.fn.parseEndpoint = function (arg) {
        var camel = this.camel;
        var ep = camel.parseEndpoint(arg);
        ep.id = uuid.v4();
        ep.routeid = this.id;
        return ep;
    };
    route.fn.factory = function (endpoint, cb) {
        var camel = this.camel;
        camel.load(endpoint.component, _.bind(function (comp) {
            var instance = new comp();
            cb(instance)
        }, this), endpoint.container);
    };
    route.fn.startEvent = function () {
        return 'start-' + this.id;
    }
    route.fn.stopEvent = function () {
        return 'start-' + this.id;
    }

    route.fn.init = function (endpoint, instance) {
        var camel = this.camel;
        var ep = endpoint;
        if (instance.initialize)
            instance.initialize(ep, camel);
        this.impl[ep.id] = instance;

        var first = this.route.length == 0;
        this.route.push(ep);

        var prior = this.startEvent();
        if (!first) {
            var ids = _.pluck(this.route, 'id');

            // may need to go through later here to see which are remote

            prior = ids[ids.indexOf(ep.id) - 1];
        }

        camel.events().on(prior, function (exchange) {
            if (first) {
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
        this.load = function (name, cb) {
            var self =this;
            require(this.paths.map(function(p){ return p+'/'+name+'/index'}), function(v){
                _.each(arguments, function(comp, i ){
                    if (comp) cb.call(self, comp, 'local');
                    else{
                        console.log('did not recieve plugin '+self.paths[i]+'/'+name);
                    }

                });
            });
        };
    };

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
        this.load = function (name, cb) {
            _.each(this.paths, function (p, c) {
                $.getJSON(p + '/load?name=' + name, function (data) {
                    if (data.ready) {
                        cb(remotecomponent, c);
                    }
                })
            }, this)
        };
    };

    var singleton = (function () {
        var root = this;
        var previousCamel = root.camel;

        var camel = function (obj) {
            if (obj instanceof camel) return obj;
            if (!(this instanceof camel)) return new camel(obj);
        };

        if (typeof exports !== 'undefined') {
            if (typeof module !== 'undefined' && module.exports) {
                exports = module.exports = camel;
            }
            exports.camel = camel;
        } else {
            root.camel = camel;
        }

        camel.noConflict = function () {
            root.camel = previousCamel;
            return this;
        };

        camel.events = function () {
            if (!this.ee) this.ee = new events.EventEmitter();
            return this.ee;
        }

        camel.load = function (name, callback, container) {
            var cps = this.cps;
            if (!cps) cps = {};
            var comp = cps[name];

            if (!this.local) this.local = new localloader();
            if (!this.remote) this.remote = new remoteloader();

            var cb = function (comp, cont) {
                cps[name] = comp;
                callback(comp);
            }

            if (!comp) {
                if (!container) {
                    this.local.load(name, cb);
                    if (!cps[name])
                        this.remote.load(name, cb);
                } else if (container == 'local') {
                    this.local.load(name, cb);
                } else {
                    this.remote.load(name, cb);
                }
            } else {
                callback(comp);
            }
        };

        camel.parseEndpoint = function (arg) {
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

        camel.newExchange = function (routeid) {
            return _.extend({routeid:routeid, id:uuid.v4()}, exchange);
        }

        camel.from = function (arg) {
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
        camel.start = function (route1, route2, more) {
            _.each(arguments.length ? arguments : this.routes, function (v, k) {
                var r = typeof v == 'string' ? this.routes[v] : v;
                if (r) {
                    this.events().emit(r.startEvent());
                } else {
                    console.log('route does not exist [' + v + ']');
                }
            }, this)
        }
        /**
         *
         * @param route1
         * @param route2
         * @param more
         */
        camel.stop = function (route1, route2, more) {
            _.each(arguments.length ? arguments : this.routes, function (v, k) {
                var r = typeof v == 'string' ? this.routes[v] : v;
                if (r) {
                    this.events().emit(r.stopEvent());
                } else {
                    console.log('route does not exist [' + v + ']');
                }
            }, this)
        }

        camel.print = function () {
            console.log(this.routes);
        }

        return camel;
    }).call(this);

    return singleton;
});