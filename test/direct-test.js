
var Camel =  require('../index.js');
var camel;

module.exports.setUp = function(done){

    if (!camel){
        camel = new Camel();
        camel.configure(function(){
            camel.from('direct:in').to('mock:out');
        });
        camel.start(function(){
            camel.print();
            done()
        });
    } else {
        done();
    }

}
module.exports.testDirectMock = function(done){
    camel.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        camel.send('direct:in', 'helloworld');
        mockEnd.assert();
        mockEnd.maxWait(2000);
    }).then(function(){
        done.done()
    }).done();
}
module.exports.testDirectMockTimeout = function(done){
    camel.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        mockEnd.maxWait(3000);
        setTimeout(function(){
            camel.send('direct:in', 'helloworld');
            mockEnd.assert();
        },2000);
    }).then(function(){
        done.done()
    }).done();

}