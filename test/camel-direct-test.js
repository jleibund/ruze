
var camel =  require('../index.js');

module.exports.setUp = function(next){
    camel.from('direct:in').to('mock:out');
    camel.start();

    next();
}
module.exports.testDirectMock = function(done){
    var mockEnd = camel.endpoint('mock:out');
    mockEnd.expectedMessageCount(1);
    camel.send('direct:in', 'helloworld');
    mockEnd.assert();
    done.done();
}