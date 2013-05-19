if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}


define(['require', './cutils', 'underscore'], function (require) {

    var cutils = require('./cutils'),
        md5 = cutils.md5,
        _ = require('underscore') || exports._;

    var RUZE = 'ruze';
    var PROCESS_CHANNEL = RUZE + '.process';
    var DISCONNECT_CHANNEL = RUZE + '.disconnect';

    // remotecomponent should be here defined internally, unlike other plugins
    //   it sits at the end of a route on the server, when it receives the exchange it kicks off the beginning, then later is the last producer, doing the return to caller
    var remotecomponent = function (options) {

        this.sockets = [];
        this.ruze = options.ruze;
        this.next = options.next;
        this.route = options.route;
        this.endpoint = this.ruze.parseEndpoint([remotecomponent.genId(this.route)]);
        this.parent = options.parent;
        this.from = options.from;
        this.terminate = options.terminate;
        this.loader = options.loader;
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
    remotecomponent.fn.addSocket = function (id) {
        var ruze = this.ruze, self = this;
        if (!_.contains(this.sockets, id)) {
            this.sockets.push(id)
            // this accepts incoming requests, we register for them on socket.io then forward to internal event emitter

            var createSingleListener = function (evt, c) {
                var socket = self.loader.getSocket(id);
                socket.on(evt, c);
            }

            createSingleListener(PROCESS_CHANNEL, function (data) {
                // we need to save off which client this is to avoid broadcast situations across multiple clients
                // todo: want to allow broadcast as an option later - this opens it up to situations like multi user chat for example
                var e = data.exchange, socketId = id;
                // make sure this is, in fact, the intended endpoint (from) and also that there is a next step
                if (data.endpoint.id == self.from.id) {
                    //e.out = e.in;
                    ruze.log('!!received ', data.endpoint.id)

                    // if we are the client for the request
                    if (self.client) {
                        // get the prior state from the exchange
                        var state = e.parent && e.parent.length && e.parent.shift();
                        if (state && state.socket)
                            e.properties.socket = state.socket;

                        if (state && self.next && state.routeId == self.route.id) {
                            // we are continuing on the route
                            e.process = state.process;
                            e.routeId = state.routeId;
                            ruze.emitRecipients(self.endpoint.id, e);
                        } else {
                            delete e.process;
                            delete e.routeId;
                            delete e.parent;
                            ruze.emitRecipients(self.endpoint.id, e, true);
                        }
                    } else {
                        e.properties.socket = socketId;
                        ruze.emitRecipients(self.next.id, e);
                    }
                }
            })
        }
    }

    remotecomponent.fn.removeSocket = function (id) {
        var ruze = this.ruze, self = this;
        if (_.contains(this.sockets, id)) {
            var socket = this.loader.getSocket(id);

            if (socket) {
                socket.removeAllListeners(PROCESS_CHANNEL);
            }

            this.sockets = _.without(this.sockets, id);
        }
    }

    remotecomponent.fn.finalize = function (cb) {
        var ruze = this.ruze, self = this;

        if (this.client && this.sockets) {
            _.each(this.sockets, function (sid) {
                var sock = this.loader.getSocket(sid);
                ruze.log('!!disconnect fired ', this.from.id)
                sock.emit(DISCONNECT_CHANNEL, {id: ruze.id, from: this.from, sid: sid});
            }, this);
        }
        cb();
    }

    // produce is an expected method for components, note that remotecomponent is added as the end of a route, so this is actually the return call
    remotecomponent.fn.produce = function (exchange, cb) {
        var ruze = this.ruze, self = this;

        // if there is no next on the caller's side, then don't do the above
        if (this.terminate) {
            return cb(null, exchange);
        }

        // we clone the exchange then remove any cycles present in the fromEndpoint
        var clone = cutils.clone(exchange);
        delete clone.fromEndpoint.recipientList;

        var hasProcess = clone.process && clone.process.length;

        var sockets = [];
        if (this.client && hasProcess) {
            // push current state into the exchange
            if (!clone.parent) clone.parent = [];
            var sock = clone.properties && clone.properties.socket;
            clone.parent.unshift({process: clone.process, routeId: clone.routeId, socket: sock});
            delete clone.process;
            delete clone.routeId;
            delete clone.properties.socket;
            sockets = this.loader.getSocket(this.sockets);
        } else if (clone.properties.socket) {
            var cloneSocket = this.loader.getSocket(clone.properties.socket);
            // grab the sockets-- if we're filtered by client (see above) we grab just its socket
            sockets = (!clone.properties.broadcast && clone.properties.socket &&
                cloneSocket ? [cloneSocket] : this.loader.getSocket(this.sockets));
            delete clone.properties.socket;
        } else {
            sockets = this.loader.getSocket(this.sockets);
        }

        // for each socket, emit the return event on the process channel
        _.each(sockets, function (socket) {
            if (socket) {
                ruze.log('!!produce fired ', this.from.id)
                socket.emit(PROCESS_CHANNEL, {id: this.ruze.id, endpoint: this.from, exchange: clone});
            }
        }, this);
    }

    return remotecomponent;

});