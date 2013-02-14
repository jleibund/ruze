
requirejs.config({
    baseUrl:'/js',
    paths:{
        plugin:'camel/plugin',
        camel:'camel'
    }
})

requirejs(['camel/camel'], function(camel) {

    camel.from('dom:h1.project?on=click').to('console:out');
    camel.start();

});