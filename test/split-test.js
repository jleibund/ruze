
var Ruze =  require('../index.js');
var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze();
        ruze.configure(function(from){
            from('direct:a')
                .split('in.body','\n')
                .to('console:log')
                .to('mock:out');

            from('direct:b')
                .split('in.body')
                .to('console:log')
                .to('mock:out');

        });
        ruze.start(function(){
            done()
        });
    } else {
        done();
    }

}
module.exports.testSplitString = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:a', 'hello\nworld\n');
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testSplitArray = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:b', ['goodbye','world']);
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testSplitObject = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:b', {one:'one', two:'two'});
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}
