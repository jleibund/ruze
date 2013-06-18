
var Ruze =  require('../index.js');
var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze({debug:false});
        ruze.configure(function(from){
            from('direct:a')
                .split('in.body','\n')
                .aggregate({completionFromBatchConsumer:true})
                .to('console:log')
                .to('mock:a');

            from('direct:b')
                .split('in.body')
                .expr('in.header.blah = (in.body == "worldee")')
                .aggregate({completionPredicate:'in.header.blah', strategy:'stringStrategy'})
                .to('console:log')
                .to('mock:b');

            from('direct:c')
                .split('in.body')
                .aggregate({completionTimeout:1000})
                .to('console:log')
                .to('mock:c');

            from('direct:d')
                .split('in.body')
                .aggregate({completionInterval:500})
                .to('console:log')
                .to('mock:d');

            from('direct:e')
                .split('in.body')
                .aggregate({completionFromBatchConsumer:true, strategy:function(ruze, oldEx, newEx){
                    if (!oldEx) return newEx;
                    oldEx.in.body = oldEx.in.body + '--doodoo--' +newEx.in.body;
                    return oldEx;
                }})
                .to('console:log')
                .to('mock:e');

        });
        ruze.start(function(){
            console.log(ruze.print())
            done()
        });
    } else {
        done();
    }

}

module.exports.testSplitString = function(done){
    ruze.endpoint('mock:a', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:a', 'hello\nworld');
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testSplitArray = function(done){
    ruze.endpoint('mock:b', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:b', ['goodbyeee','worldee']);
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testSplitObject = function(done){
    ruze.endpoint('mock:c', function(mockEnd){
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
    ruze.endpoint('mock:d', function(mockEnd){
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

module.exports.testFuncStrategy = function(done){
    ruze.endpoint('mock:e', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:e', ['good','word']);
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}
