
var Camel =  require('../index.js');
var camel = new Camel({preload:['mock','direct']});

module.exports.setUp = function(next){

    camel.define(function(){
        camel.from('direct:in').to('mock:out');
    }).then(function(){
        return camel.start();
    });

    next();
}
module.exports.testDirectMock = function(done){
    camel.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        camel.send('direct:in', 'helloworld');
        mockEnd.assert();
        done.done();
    });
}