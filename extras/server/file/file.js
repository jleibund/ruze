if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
var internalReq = require.config({
    baseUrl:'/',
    context:'file',
    nodeRequire:require
})
internalReq(['require','fs','nodewatch','path','module'],function(require) {

    var fs = require('fs'),
        watch = require('nodewatch');

    var m = require('module'),
        path = require('path');

    var sep = path && path.sep || '/';

    var FileComponent = function(){
    };
    FileComponent.prototype.initialize = function(endpoint,ruze){
        this.endpoint = endpoint;
        this.ruze = ruze;
    }
    FileComponent.prototype.consume = function(cb){
        this.consumeCb = cb;
        var self = this, ruze = this.ruze;

        // get any overrides from header
        var dir = this.endpoint.object;

        fs.exists(dir, function(exists){
            if (!exists) throw Error('no such dir '+dir)
            var dirRuze = dir + '/.ruze';
            fs.exists(dirRuze, function(exists2){
                if (!exists2){
                    fs.mkdir(dirRuze, function(err2){
                        if (err2) throw err2;
                    });
                }
            })

        })

        // make a processed dir

        watch.add(dir).onChange(function(file,prev,curr,action){
            var tokens = file.split(sep);

            if (tokens[tokens.length-1].charAt(0) != '.' && action == 'new' || action == 'change'){
                var exchange = ruze.newExchange();
                exchange.out.header.filename = tokens[tokens.length-1];

                console.log('id',exchange.id)

                fs.readFile(file, function(err,data){
                    exchange.out.body = data;
                    self.consumeCb(err,exchange);
                });

            }
        });

    };
    FileComponent.prototype.produce = function(exchange, cb){

        var dir = this.endpoint.object, isDir = true, file = null;
        if (!dir) dir = '.';

        if (exchange.in.header.filename){
            file = dir + sep + exchange.in.header.filename;
            isDir = false;
        } else {
            var ext = (exchange.in.header.extension) ? exchange.in.header.extension : 'out'
            file = dir + sep + exchange.id + '.' + ext;
        }

        fs.exists(dir, function(exists){
            if (!exists) {
                fs.mkdir(dir, function(err2){
                    if (err2) throw err2;
                    fs.writeFile(file, exchange.in.body, function(err){
                        exchange.out = exchange.in;
                        cb(err,exchange);
                    });
                });
            } else {
                fs.writeFile(file, exchange.in.body, function(err){
                    exchange.out = exchange.in;
                    cb(err,exchange);
                });
            }
        })
    }
    return FileComponent;

});