if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

//define(['require'],function(mylocalrequire) {
define(function(){

//    mylocalrequire(['fs','./nodewatch','path','module'],function(fs, watch, m, path) {
//
//        var sep = path && path.sep || '/';
//    });

    var fs = require('fs'),
        chokidar = require('chokidar');
//    watch = require('nodewatch');



    var m = require('module'),
        path = require('path');

    var sep = path && path.sep || '/';

    var FileComponent = function(){
    };
    FileComponent.prototype.initialize = function(endpoint,ruze){
        this.endpoint = endpoint;
        this.dir = endpoint.object;
        this.ruzeDir = this.dir + '/.ruze';
        this.once = endpoint.args.once || false;
        this.config = {
            ignored : endpoint.args.ignored || /^.ruze/,
            persistent : endpoint.args.persistent || true,
            ignorePermissionErrors : endpoint.args.ignorePermissionErrors || false,
            ignoreInitial : endpoint.args.ignoreInitial || false,
            interval : endpoint.args.interval ||  100,
            binaryInterval : endpoint.args.binaryInterval || 300
        }
        this.ruze = ruze;
    };
    FileComponent.prototype.finalize = function (cb) {
        if (this.watcher){
            this.watcher.close();
            delete this.watcher;
        }
    }
    FileComponent.prototype.consume = function(cb){
        this.consumeCb = cb;
        var self = this, ruze = this.ruze;

        if (!this.watcher){

            var setup = function(dir, config){
                var watcher = self.watcher = chokidar.watch(dir, config);
                var once = self.once;
                var handler = function(path){
                    var tokens = path.split(sep);

                    var exchange = ruze.newExchange();
                    var file = exchange.out.header.filename = tokens[tokens.length-1];

                    fs.readFile(path, function(err,data){
                        exchange.out.body = data;
                        fs.rename(path, dirRuze + sep + file, function(err){
                            if (err) throw err;
//                            console.log('id',exchange.id, file)
                            self.consumeCb(err,exchange);

                            if (once){
                                watcher.close();
                                watcher = self.watcher = null;
                            }
                        });
                    });
                };
                watcher.on('change', handler);
            };

            var dir = this.dir;
            var dirRuze = this.ruzeDir;
            var config = this.config;
            fs.exists(dir, function(exists){
                if (!exists) throw Error('no such dir '+dir)
                fs.exists(dirRuze, function(exists2){
                    if (!exists2){
                        fs.mkdir(dirRuze, function(err2){
                            if (err2) throw err2;
                            setup(dir,config);
                        });
                    } else {
                        setup(dir,config);
                    }
                })

            })

        }

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