if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(['require','fs','nodewatch'],function(require) {

    var fs = require('fs'),
        watch = require('nodewatch');


    var FileComponent = function(){
    };
    FileComponent.prototype.initialize = function(endpoint,ruze){
        this.endpoint = endpoint;
        this.ruze = ruze;
    }
    FileComponent.prototype.consume = function(cb){
        this.consumeCb = cb;
        var self = this;

        // get any overrides from header
        var dir = this.endpoint;

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
            var tokens = file.split('/');

            if (tokens[tokens.length-1].charAt(0) != '.' && action == 'new' || action == 'change'){
                var exchange = this.ruze.newExchange();
                exchange.out.header.filename = file;

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
        if (exchange.in.header.filename)
            file = exchange.in.header.filename;

        if (!file) file = '.';

        fs.stat(file, function(err, stats){
            if (err) throw err;
            if (stats.isDirectory()){
                var ext = (exchange.in.header.extension) ? exchange.in.header.extension : 'out'

                file = file + '/' + exchange.id + '.' + ext;
            }
            fs.writeFile(file, exchange.in.body, function(err){
                cb(err,exchange);
            });

        })
    }
    return FileComponent;

});