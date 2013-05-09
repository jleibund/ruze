
var Ruze =  require('../index.js'), _ = require('underscore');
var fs = require('fs');

var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze({debug:true});

        // defaults and plugins
        ruze.loaders.local.addPath('./../extras/server');

//        ruze.add('file','../extras/server')
//        ruze.add('plugin1','../extras/server')
//        ruze.add('plugin2','../extras/server')

        // todo:  this should happen by default
        ruze.add('../extras/server', ['file','plugin','plugin2']);
        ruze.add('../your/custom/stuff', ['plugin3']);
//
//        1)  absolute
//        2)  fallback
//        3)  write a server bind to express, fancy logic, etc
//        4)  all plugins in one place...  ruze has default plugi-- you must put your custom stuff into that dir

        ruze.configure(function(from){
            from('file:./test1.csv')
                .to('console:log')
                .to('mock:out');
        });
        ruze.start(function(){
            ruze.print();
            done();
        });
    } else {
        done();
    }

}
module.exports.testFileMock = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        fs.createReadStream('./file-test.csv').pipe(fs.createWriteStream('./in/file-test.csv'));
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

