ruze
=======

integration patterns with remoting for javascript

##Getting Started.
Add ruze to your package.json, npm install or include contents of lib in html script with requirejs (see example in examples/multiserver/public)

    npm install ruze

OR see examples/multiserver public directory for an example of how to embed in the client
##Configuration

Ruze uses requirejs on both client and server.  It is configured with routes that you define in either Javascript or JSON:

	ruze.configure(function(from){
          from('dom:h1.project?on=click')
              .expr('in.header.timeStamp=in.body.timeStamp')
              .to('direct:a');

          from('direct:a')
              .to('console:out')
 
     });
     
OR you can define this in a json file - see examples/multiserver/conf directory

	{
	    "plugins":{
    	    "direct":{
        	    "debug":true
 	       }
	    },
    	"routes":[
	    {
            "name":"catch dom event and send",
            "route":[    	            	
            	{"from":"dom:h1.project?on=click"},
		{"expr":"in.header.timeStamp=in.body.timeStamp"},
                {"when":"in.body.timeStamp==2"},
                	{"to":"direct:a"},
                {"otherwise":""},
                	{"to":"direct:b"}
            ]
        },
        {
            "name":"send to console",
            "route":[
                {"from":"direct:a"},
                {"to":"console:out"}
            ]
        },
        {
            "name":"replace and send to console",
            "route":[
                {"from":"direct:b"},
                {"expr":"in.body='blah'"},
                {"to":"console:out"}
            ]
        }
	    ]
	}
    
##Definitions & DSL
 
In Ruze you define routes similar to other EIP architectures.  The DSL is both built-in but extensible:

	from()  //starts a route, takes an endpoint defn

	    from('direct:a').to(...)

    to() //continues the route with an endpoint defn

        .to('console:out')

    endpoint() // defines a single endpoint, used with custom components to specify 'the' instance

    expr() // takes a javascript expression, see expresssion language in section below

        from('direct:a')
            .expr('out.body = (in.header.a == 3) ? 'one', 1')

    when(),  // control structure, js expression (use multiple if you like, end with otherwise)
    otherwise() // control structure

        ...
        .when('in.header.b = 'b')
            .to(...)
        .when('in.header.b = 3)
            .to(...)
        .otherwise()
            .to(...)

    process()  // takes a function for inline defn as follows, remember to call next(), this is async:

                .process(function(exchange,next){
                    exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
                    next();
                })

    split()   //  takes an expression to split on, and optionally a character as the termination string (if the body is a string)
              //  if the body is an array, split will send each item as its own exchange, ditto for an object (treats fields as rows)

                .split('in.body','\n')

    aggregate()  // takes an object with the multiple conditions, the first condition to 'finish' completes that batch:
           completionFromBatchConsumer  // a boolean used in conjunction with endpoints like 'file' or the splitter for streaming
           completionPredicate // a string with in expr (javascript) condition format to signal completion condition
           completionInterval  // will complete a new batch after this number of ms after the last record was received
           completionTimeout   // will complete a batch after this timeout
           completionSize      // will complete batches once it has this many records
           strategy   // this is the aggregation strategy, it supports 'arrayStrategy', 'stringStrategy', or a function of your choosing

                        function(ruze, oldEx, newEx){
                            if (!oldEx) return newEx;
                            oldEx.in.body = oldEx.in.body + '--doodoo--' +newEx.in.body;
                            return oldEx;
                        }})
           // aggregate uses the fields aggregateId, index, and complete in your exchange's header when in batch consumer mode


                .aggregate({completionFromBatchConsumer:true})

                .aggregate({completionTimeout:1000, completionInterval:500})

                .aggregate({completionFromBatchConsumer:true, strategy:function(ruze, oldEx, newEx){
                    if (!oldEx) return newEx;
                    oldEx.in.body = oldEx.in.body + '--doodoo--' +newEx.in.body;
                    return oldEx;
                }})


Endpoints, used in from(), to(), and endpoint() define instances of plugins as defined in the /plugin directory.  You can create, configure and add your own.  They are defined in a quasi URI format:

	[<container>:]? <plugin> : <object/id> ? arg1=1,arg2=2
	
The container is optional.  When not specified it will try to find the plugin in the local environment, or "local", otherwise it can search for it on remote instances.  You can also specify "local" to force it to run locally or specify a remote identifier (more on that in config for remoteloader).

##Concepts & Exchanges

During route execution, the first endpoint, defined in from(), will kick off processing with its consume() method, if it has one.  Thereafter, endpoints process their task in produce().  This is an event-oriented architecture that passes an object called exchange between each processing stage.  This is important to understand so that you can maniputate your data using your own endpoints/plugins, the inline process(), or the expression language.  An exchange is defined as follows:

	{
		in:{ 
			header:{},
			body:null
		}, 
		out:{
			header:{},
			recipientList:null
		}, 
		properties:{}, 
		id:null, 
		error:null, 
		fromEndpoint:null
	}

	in - the input to this processing stage
	in.header - contains any headers you want
	in.body - input data you are manipulating

	out - the output from this processing stage
	out.header - any headers to pass forward
	out.body - output from your processing
	out.recipientList - optional, route to an endpoint

	properties - additional props 
	id - a uuid generated by ruze for tracking
	error - any errors to carry forward
	fromEndpoint - endpoint that executed just before you
	
Note that at each stage, the out object becomes the in object (it is copied and emptied).

##Process

    ruze.from('direct:a')
        .process(function(exchange,next){
          console.log('shoes ',exchange.in.header.shoes);
          
          exchange.out.body = 
           '{\"statement\":\"'+exchange.in.body+'\"}';
          
          next();
        })

Process defines an unnamed component inline.  You manipulate the exchange in the function you provide.  Remmber to call next().  next(err) passes on errors.  Note that exchange.out.body is set in this stage.  If you proceed without setting the output body, nothing will be passed forward.  Process declarations must execute in the local environment (you cannot pass in mobile code to a server/remote instance).

##Expression Language
    ruze.from('direct:a')
    	.expr('in.body= (in.header.a) ? 
    			in.header.a + " " + in.body :
    			in.body'
    		)
    	.to('console:out');

Expressions, based on exprjs, allow fairly powerful inline scripting that avoids the perils of eval().  Define single-line or comma-separated expressions using javascript.  These are portable across containers.  In the expression language you have access to the current exchange, instantiated plugin components, and extra utility functions for transforms:

	.expr('1==1') // a conditional, returns true
	.expr('out.body = in.body') // assignment
	.expr('bodyAs("json")') transforms body to json
	.expr('ref("mycomp:a").doSomething(in.body)')

bodyAs() takes 'json' or 'string' right now.  Will work on xml and other formats.  ref() pulls in an instantiated plugin allowing you to execute functions on it directly.

##Recipients
When you define a route in Ruze that flow represents the default recipient chain for the exchange as processing occurs.  This can be altered inline using expressions:

	.expr('out.recipientList=["direct:a","direct:b"]') 
	.expr('out.recipientList=in.header.myrecipients') 
	
This allows you to do dynamic routing at any point you choose.  The Exchange is broadcast to those endpoints.

##Plugins

Base-level plugins live in the /plugin directory or one you specify with your extensions.  Once you define a plugin, if appropriate, it can run either on the server (nodejs) in within the browser.  Plugins have a lifecycle where they are configured, overall using a config() call (class-level), they can have a initialize() per instance, and may define a consume() and produce() action. In addition, they can modify Ruze DSL through the mixin() call during config().  See /plugin/process/process.js for an example of how this works.
We will expand this library over time in the /extras directory for you to pick from.  Currently it contains:

    /extras/server/file
    /extras/client/dom

##File Endpoint

File used to read files from a directory or write to them allowing you to stream and process the results

            from('file:/Users/me/dev/ruze/test/in?once=true&archive=true&mode=line&buffer=true')
            ...
            .to('file:/Users/me/dev/ruze/test/out?mode=stream')

To use this component, make sure you run an npm install in its directory so it can build out what it needs

            cd extras/server/file
            npm install

The file component accepts the following parameters that govern how it handles files and their contents
            ignored   // ignores a directory called .ruze, created for producers to place processed files afterward
            persistent // informs underlying fs whether to keep the worker running
            ignorePermissionErrors // ignores permission errors when reading/writing to a directory
            ignoreInitial  // will ignore any initial file detections on startup (if files are resident in the directory)
            interval // the detection interval in milliseconds
            binaryInterval // the binary interval in milliseconds
            archive // if set to true will move processed files to the ./.ruze directory for producers, otherwise discard process files
            mode: // 'line' streams files line by line, 'file' reads in the whole file at once, 'stream' works on a buffer size basis
            buffer: // either false, or the buffer size for mode : 'buffer' setting, above

To see an example of this file running, try the test/file-test.js test file.

##DOM Endpoint

DOM uses jQuery to select an element and and event from which all event data becomes the body of the resulting exchange(s)

        from('dom:h1.project?on=click')
            .expr('in.body={timestamp:in.body.timeStamp, text:in.body.currentTarget.outerText, type:in.body.type}')
            .to('myserver:direct:a')

To see an example of this, look at the examples/multiserver/public/js/main.js file and try running the example (instructions, below)



You can add your own plugin components here beyond those provided.  They are labeled to differentiate those that work
in a the nodejs/server environment (e.g. file system access), those that work only in the browser, and those that are shared.

##Testing

    ruze.configure(function()        	
    	ruze.from('direct:in').to('mock:out');
    });
    ruze.start(function(){

	...

    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:in', 'helloworld');
        mockEnd.assert();
        mockEnd.maxWait(2000);
    }).then(function(){
        done.done()
    }).done();

Ruze supports a testing structure using an endpoint called mock.

##Remoting
One ultimate goal of this project is to allow you to define routes across a distributed architecture of ruze nodes.  This is a work in progress so this section is about what to expect shortly.

We are adding a socket.io backplane across instances, please look at the examples/multiserver project to see it in action
Your browser(s) environment, 'myserver', and 'server2' run ruze with different roles, loaded plugins, etc.

    // 1.  start server2
    node server2.js

    // 2.  start server - they will link
    node server.js

    // 3.  in a browser go to http://localhost:4000
    //      when the environment has loaded, you will see the diagnostics appear on the page, if it doesn't reload, its a Q/promise load issue

    // 4.  click on the sample text on the page, inspect the browser console and the two other
    //      server windows, you should see event routing as described in the route.

