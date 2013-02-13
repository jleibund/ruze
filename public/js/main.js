
requirejs.config({
    baseUrl:'js'
})

requirejs(['./camel/camel','./camel/plugin/console/index','./camel/plugin/dom/index'], function(camel) {

    camel.from('dom:h1.project?on=click').to('console:out');
    camel.start();

});