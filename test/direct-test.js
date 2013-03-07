
var Ruze =  require('../index.js');
var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze();
        ruze.configure(function(){
            ruze.from('direct:in').to('mock:out');
        });
        ruze.start(function(){

            console.log(ruze.print());
            done()
        });
    } else {
        done();
    }

}
module.exports.testDirectMock = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:in', 'helloworld');
        mockEnd.assert();
        mockEnd.maxWait(2000);
    }).then(function(){
        done.done()
    }).done();
}
module.exports.testDirectMockTimeout = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        mockEnd.maxWait(3000);
        setTimeout(function(){
            ruze.send('local:direct:in', 'helloworld');
            mockEnd.assert();
        },2000);
    }).then(function(){
        done.done()
    }).done();

}