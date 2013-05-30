
var Ruze =  require('../index.js');
var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze();
        ruze.configure(function(from){
            from('direct:a')
                .split('in.body','\n')
                .aggregate({completionFromBatchConsumer:true})
                .to('console:log')
                .to('mock:out');

            from('direct:b')
                .split('in.body')
                .expr('in.header.blah=true')
                .aggregate({completionPredicate:'in.header.blah', strategy:'stringStrategy'})
                .to('console:log')
                .to('mock:out');

            from('direct:c')
                .split('in.body')
                .aggregate({completionTimeout:1000})
                .to('console:log')
                .to('mock:out');

            from('direct:d')
                .split('in.body')
                .aggregate({completionInterval:500})
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
        ruze.send('direct:a', 'hello\nworld');
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
        ruze.send('direct:c', {one:'one', two:'two'});
        mockEnd.maxWait(4000);
        setTimeout(function(){
            mockEnd.assert();
        },3000);
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testSplitObject2 = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        mockEnd.maxWait(4000);
        ruze.send('direct:d', {three:'three', four:'four'});
        setTimeout(function(){
            mockEnd.assert();
        },3000);
    }).then(function(){
            done.done()
        }).done();
}
