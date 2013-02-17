
requirejs.config({
    baseUrl:'/js',
    paths:{
        plugin:'camel/plugin',
        camel:'camel'
    }
})

requirejs(['camel/camel'], function(Camel) {

    // todo - right now lazy loading and promises are driving me crazy, configuring with the options for preload

    var camel = new Camel({preload:['dom','console']});

//    camel.loadAll('console','direct').then(function(){
//        console.log('loaded');
//    }, function(err){
//        console.log(err)
//    })

    camel.define(function(){
        camel.from('dom:h1.project?on=click').to('console:out');
    }).then(function(){
            camel.start()
        }, function(err){
            console.log(arguments);
        });


});