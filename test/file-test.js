
var Ruze =  require('../index.js'), _ = require('underscore');
var fs = require('fs');

var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze({debug:true});

        ruze.configure(function(from){
            from('file:/Users/jpleibundguth/dev/ruze/test/in?once=true&archive=true')
                .expr('out.body=in.body.toString()')
                .to('console:log')
                .aggregate({completionFromBatchConsumer:true})
                .to('file:/Users/jpleibundguth/dev/ruze/test/out')
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
        fs.createReadStream('/Users/jpleibundguth/dev/ruze/test/test1.csv').pipe(fs.createWriteStream('/Users/jpleibundguth/dev/ruze/test/in/file-test.csv'));
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

