if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(function(require) {

    var fs = require('fs'),
        watch = require('nodewatch');


    var FileComponent = function(){
    };
    FileComponent.prototype.initialize = function(options,ctx){
        this.endpoint = options.object;
        this.ctx = ctx;
    }
    FileComponent.prototype.consume = function(cb){
        this.consumeCb = cb;
        var self = this;

        // get any overrides from header
        var dir = this.endpoint;

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

        watch.add(dir).onChange(function(file,prev,curr,action){
            var tokens = file.split('/');

            if (tokens[tokens.length-1].charAt(0) != '.' && action == 'new' || action == 'change'){
                var exchange = this.ctx.newExchange();
                exchange.header.filename = file;

                console.log('uid',exchange.uid)

                fs.readFile(file, function(err,data){

                    exchange.out.body = data;
                    self.consumeCb(err,exchange);
                });

            }
        });

    };
    FileComponent.prototype.produce = function(exchange, cb){

        var file = this.endpoint;
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
    return FileComponent;

});