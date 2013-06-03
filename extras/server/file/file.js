if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function(){

    var fs = require('fs'),
        chokidar = require('chokidar'),
        readline = require('readline'),
        lazy = require('lazy'),
        uuid = require('node-uuid');

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
            ignored : endpoint.args.ignored || /.*\/\.ruze\/.*/,
            persistent : endpoint.args.persistent || true,
            ignorePermissionErrors : endpoint.args.ignorePermissionErrors || false,
            ignoreInitial : endpoint.args.ignoreInitial || false,
            interval : endpoint.args.interval ||  100,
            binaryInterval : endpoint.args.binaryInterval || 300,
            archive: endpoint.args.archive || false
        }
        this.ruze = ruze;
    };
    FileComponent.prototype.finalize = function (cb) {
        if (this.watcher){
            this.watcher.close();
            this.watcher = null;
        }
    }
    FileComponent.prototype.consume = function(cb){
        this.consumeCb = cb;
        var self = this, ruze = this.ruze;

        if (!this.watcher){

            var dir = this.dir;
            var dirRuze = this.ruzeDir;
            var config = this.config;

            var setup = function(){
                var watcher = self.watcher = chokidar.watch(dir, config);
                var once = self.once;
                var handler = function(path){
                    var tokens = path.split(sep);
                    var file =  tokens[tokens.length-1];
//                    var file = exchange.out.header.filename = tokens[tokens.length-1];

//                    var exchange = ruze.newExchange();
//                    var file = exchange.out.header.filename = tokens[tokens.length-1];

                    var rd = readline.createInterface({
                        input: fs.createReadStream(path),
                        output: process.stdout,
                        terminal: false
                    });

                    var aggregateId = uuid.v4();
                    var lineNum = 0, end = -1;

                    new lazy(fs.createReadStream(path))
                        .on('end', function() {
                            end = lineNum;
                        } )
                        .lines
                        .forEach(function(line){
                            var ex = ruze.newExchange();
//                        var file = ex.out.header.filename = tokens[tokens.length-1];
                            console.log(line);
//                        var ex = cutils.clone(exchange);
                            ex.out.header.aggregateId = aggregateId;
                            ex.out.header.index = lineNum;
                            var complete = ex.out.header.complete = (end == lineNum);
                            ex.out.body = line;
                            ex.id = uuid.v4();
                            lineNum++;
                            cb(null, ex);

                            if (complete){
                                if (config.archive){
                                    fs.rename(path, dirRuze + sep + file, function(err){
                                        if (err) throw err;
//                                        var ex = ruze.newExchange();
//                                        ex.out.header.aggregateId = aggregateId;
//                                        ex.out.header.index = lineNum;
//                                        ex.out.header.complete= true;
//                                        ex.id = uuid.v4();
//                                        cb(err, ex);

                                        if (once && watcher){
                                            self.watcher.close();
                                            delete self.watcher;
                                            watcher = self.watcher = null;
                                        }
                                    });
                                } else {
//                            self.consumeCb(err,exchange);
//                                    var ex = ruze.newExchange();
//                                    ex.out.header.aggregateId = aggregateId;
//                                    ex.out.header.index = lineNum;
//                                    ex.out.header.complete= true;
//                                    ex.id = uuid.v4();
//                                    cb(null, ex);

                                    if (once && watcher){
                                        self.watcher.close();
                                        delete self.watcher;
                                        watcher = self.watcher = null;
                                    }
                                }

                            }

                        }
                    );

//                    .addListener('close', function(){
//
//                    })


//                    rd.on('line', function(line) {
//                        var ex = ruze.newExchange();
////                        var file = ex.out.header.filename = tokens[tokens.length-1];
//                        console.log(line);
////                        var ex = cutils.clone(exchange);
//                        ex.out.header.aggregateId = aggregateId;
//                        ex.out.header.index = lineNum++;
//                        ex.out.body = line;
//                        ex.id = uuid.v4();
//                        cb(null, ex);
//
//                    });
//
//                    rd.on('close', function(line) {
//                        console.log(line);
//                        if (config.archive){
//                            fs.rename(path, dirRuze + sep + file, function(err){
//                                if (err) throw err;
////                                self.consumeCb(err,exchange);
//                                var ex = ruze.newExchange();
//                                ex.out.header.aggregateId = aggregateId;
//                                ex.out.header.index = lineNum;
//                                ex.out.header.complete= true;
//                                ex.id = uuid.v4();
//                                cb(err, ex);
//
//                                if (once && watcher){
//                                    self.watcher.close();
//                                    delete self.watcher;
//                                    watcher = self.watcher = null;
//                                }
//                            });
//                        } else {
////                            self.consumeCb(err,exchange);
//                            var ex = ruze.newExchange();
//                            ex.out.header.aggregateId = aggregateId;
//                            ex.out.header.index = lineNum;
//                            ex.out.header.complete= true;
//                            ex.id = uuid.v4();
//                            cb(null, ex);
//
//                            if (once && watcher){
//                                self.watcher.close();
//                                delete self.watcher;
//                                watcher = self.watcher = null;
//                            }
//                        }
//                    });

//                    fs.readFile(path, function(err,data){
//                        exchange.out.body = data;
//                        if (config.archive){
//                            fs.rename(path, dirRuze + sep + file, function(err){
//                                if (err) throw err;
//                                self.consumeCb(err,exchange);
//
//                                if (once && watcher){
//                                    self.watcher.close();
//                                    delete self.watcher;
//                                    watcher = self.watcher = null;
//                                }
//                            });
//                        } else {
//                            self.consumeCb(err,exchange);
//
//                            if (once && watcher){
//                                self.watcher.close();
//                                delete self.watcher;
//                                watcher = self.watcher = null;
//                            }
//                        }
//                    });
                };
                watcher.on('all',function(event,stats) {
                    console.log('chokidar', event, stats);
                });
                watcher.on('add', handler);

                //todo should be change
                //watcher.on('change', handler);
            };


            var existsSub = function(){
                fs.exists(dirRuze, function(exists2){
                    if (!exists2){
                        fs.mkdir(dirRuze, function(err2){
                            if (err2) throw err2;
                            setup();
                        });
                    } else {
                        setup();
                    }
                })
            }
            fs.exists(dir, function(exists){
                if (!exists) {
                    fs.mkdir(dir, function(err){
                        if (err) throw err;
                        if (config.archive){
                            existsSub();
                        } else {
                            setup();
                        }
                    })
                } else {
                    if (config.archive){
                        existsSub();
                    } else {
                        setup();
                    }
                }
            })
        };

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

        if (!fs.existsSync(dir))
            fs.mkdirSync(dir);
//        var exists = fs.existsSync(dir);
//        if (!exists){}

//        fs.exists(dir, function(exists){
//            if (!exists) {
//                fs.mkdir(dir, function(err2){
//                    if (err2) throw err2;
                    fs.writeFile(file, exchange.in.body, function(err){
                        exchange.out = exchange.in;
                        cb(err,exchange);
                    });
//                });
//            } else {
//                fs.writeFile(file, exchange.in.body, function(err){
//                    exchange.out = exchange.in;
//                    cb(err,exchange);
//                });
//            }
//        })
    }
    return FileComponent;

});