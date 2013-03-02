
requirejs.config({
    baseUrl:'/js',
    paths:{
        ruze:'ruze',
        cutils:'ruze/cutils',
        path:'ruze/path'
    }
})

requirejs(['ruze/ruze'], function(Ruze) {

    // todo - right now lazy loading and promises are driving me crazy, configuring with the options for preload

    var ruze = new Ruze();

    ruze.configure(function(){
        ruze.from('dom:h1.project?on=click').to('direct:a');
        ruze.from('direct:a').to('console:out')

    });
    ruze.start()


});