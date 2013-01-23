var _ = require('underscore'),
    util = require('util'),
    fs = require('fs'),
    uuid = require('node-uuid')
    watch = require('nodewatch'),
    EventEmitter = require('events').EventEmitter,
    Stream = require('stream').Stream;

var debug = (process.env['DEBUG']) ?
    function (msg) {
        util.debug(msg)
    } : function () {
};

var info = util.log;

debug('on');

var Context = function() {
    EventEmitter.constructor.call(this);
    this._routes = [];
};
Context.prototype = new EventEmitter();

Context.loadComponent = function(comp){
    if (!comp) throw Error('component is null');
    if (!comp.prototype.prefix) throw Error('component needs a prefix');
    if (!Context._components) Context._components = {};
    Context._components[comp.prototype.prefix] = comp;
}


Context.prototype.from = function (endpoint) {
    var r = new Route(this,endpoint);
    this._routes.push(r);
    return r;
};
Context.prototype.run = function(){

    _.each(this._routes, function(r){
        r.run();
    })
    this.emit('run');
};
Context.prototype.INOUT = 'inout';
Context.prototype.INONLY = 'inonly';
Context.prototype.OUTONLY = 'outonly'

function Route(ctx, from) {
    this._route = [this._compFactory(from)];
    this._ctx = ctx;
}

Route.prototype.to = function(endpoint){
    this._route.push(this._compFactory(endpoint));
    return this;
};

Route.prototype.marshall = function(){
    var dfc = new DataFormatComponent(this,true);
    this._route.push(dfc);
    return dfc;
}

Route.prototype.unmarshall = function(){
    var dfc = new DataFormatComponent(this,false);
    this._route.push(dfc);
    return dfc;
}

Route.prototype.header = function(){
    var hc = new HeaderComponent(this);
    this._route.push(hc);
    return hc;
}


Route.prototype._compFactory = function(endpoint){
    if (!endpoint) throw Error('endpoint must have a value');
    var comps = Context._components;
    var parts = endpoint.split(':');
    if (!parts || !parts.length == 2) throw Error('endpoint must be in the form of component:object>');
    var comp = comps[parts[0]];
    if (!comp) throw Error(' we don\'t have component '+parts[0]);
    var instance = new comp(parts[1]);
    return instance;
};

Route.prototype.run = function(){
    if (this._route.length < 2) throw Error('must add at least one destination');

    var route = _.extend([],this._route);

    var ctx = this._ctx;

    var prior = 'run';
    _.each(route, function(c){
        ctx.on(prior, function(exchange){

            if (!exchange){
                c.consume(function(err, e){
                    if (err) throw err;
                    ctx.emit(c.uid(),e);
                });
            } else {
                if (exchange.out)
                    exchange.in = exchange.out;
                exchange.out = null;

                c.produce(exchange, function(err,e){
                    if (err) throw err;
                    ctx.emit(c.uid(), e);
                });
            }
        });

        prior = c.uid();
    });



};

var newExchange = function(){
    return {in:{}, out:{}, header:{}, uid:uuid.v1()};
};

var Component = function(arg){
    this.arg = (arg)? arg: uuid.v1()
}
Component.prototype.uid = function(){
    return (this.prefix)? this.prefix+':'+this.arg : this.arg;
}

var HeaderComponent =  function (route) {
    Component.call(this);
    this._route = route;
};
HeaderComponent.prototype = new Component();
HeaderComponent.prototype.constructor = HeaderComponent;
HeaderComponent.prototype.inout = Context.OUTONLY;
HeaderComponent.prototype.add = function(key, val){
    this._method = function(arg){ arg[key] = val};
    return this._route;
}

HeaderComponent.prototype.remove = function(key){
    this._method = function(arg){ delete arg[key]; };
    return this._route;
}

//HeaderComponent.prototype.consume = function(cb){
//    this._method(exchange.header);
//    //noop
//    cb();
//};

HeaderComponent.prototype.produce = function(exchange, cb){
    this._method(exchange.header);
    cb(null,exchange);
}


var DataFormatComponent =  function (route, marshall) {
    Component.call(this);
    this._route = route;
    this._marshall = marshall;
};
DataFormatComponent.prototype = new Component();
DataFormatComponent.prototype.constructor = DataFormatComponent;
DataFormatComponent.prototype.inout = Context.OUTONLY;
DataFormatComponent.prototype.json = function(cb){
    this._method = function(arg){ return (this._marshall)? JSON.stringify(arg,null,2) : JSON.parse(arg)};
    return this._route;
}

//DataFormatComponent.prototype.consume = function(cb){
//    exchange.in.body = this._method(exchange.in.body);
//    //noop
//    cb();
//};
DataFormatComponent.prototype.produce = function(exchange, cb){
    exchange.in.body = this._method(exchange.in.body);
    cb(null,exchange);
}


var ConsoleComponent =  function () {
    Component.call(this);
};
ConsoleComponent.prototype = new Component();
ConsoleComponent.prototype.constructor = ConsoleComponent;
ConsoleComponent.prototype.inout = Context.INOUT;
ConsoleComponent.prototype.prefix = 'console';
ConsoleComponent.prototype.consume = function(cb){
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
        var exchange = newExchange();
        exchange.out.body = chunk
        cb(null,exchange);
    });
};
ConsoleComponent.prototype.produce = function(exchange, cb){
    console.log(exchange.in.body);
    cb(null,exchange);
}


var FileComponent =  function (file) {
    Component.call(this,file);
    this._file = file;
}
FileComponent.prototype = new Component();
FileComponent.prototype.constructor = FileComponent;
FileComponent.prototype.inout = Context.INOUT;
FileComponent.prototype.prefix = 'file';
FileComponent.prototype.consume = function(cb){
    this.consumeCb = cb;
    var self = this;

    // get any overrides from header
    var dir = this._file;

    fs.exists(dir, function(exists){
        if (!exists) throw Error('no such dir '+dir)
        var dirCamel = dir + '/.camel';
        fs.exists(dirCamel, function(exists2){
            if (!exists2){
                fs.mkdir(dirCamel, function(err2){
                    if (err2) throw err2;
                });
            }
        })

    })

    // make a processed dir

    watch.add(this._file).onChange(function(file,prev,curr,action){
        var tokens = file.split('/');

        if (tokens[tokens.length-1].charAt(0) != '.' && action == 'new' || action == 'change'){
//            console.log(file, action, curr.mtime.getTime());
            var exchange = newExchange();
            exchange.header.filename = file;

            console.log('uid',exchange.uid)

            fs.readFile(file, function(err,data){

                exchange.out.body = data;
                self.consumeCb(err,exchange);

                // move it

//                setTimeout(function(){
//                    var tokens = file.split('/');
//                    var path = dir+'/.camel/'+tokens[tokens.length-1];
//                    fs.rename(file, path, function(err){
//                        if (err) console.log(err);
//                    });
//                },3000);

            });

        }
    //    console.log(prev.mtime.getTime());
    //    console.log(curr.mtime.getTime());
    //    console.log(action) // new, change, delete

     });

};
FileComponent.prototype.produce = function(exchange, cb){

    var file = this._file;
    if (exchange.header.filename)
        file = exchange.header.filename;

    if (!file) file = '.';

    fs.stat(file, function(err, stats){
        if (err) throw err;
        if (stats.isDirectory()){
            var ext = (exchange.header.extension) ? exchange.header.extension : 'out'

            file = file + '/' + exchange.uid + '.' + ext;
        }
        fs.writeFile(file, exchange.in.body, function(err){
            cb(err,exchange);
        });

    })
}

Context.loadComponent(FileComponent);
Context.loadComponent(ConsoleComponent);
//Context.loadComponent(DataFormatComponent);


module.exports.Context = Context;