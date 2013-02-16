
requirejs.config({
    baseUrl:'/js',
    paths:{
        plugin:'camel/plugin',
        camel:'camel'
    }
})

requirejs(['camel/camel'], function(Camel) {
    var camel = new Camel();

    camel.define(function(){
        camel.from('dom:h1.project?on=click').to('console:out');
    }).then(function(){
            camel.start()
        }, function(err){
            console.log(arguments);
        });


});