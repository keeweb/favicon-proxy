#!/bin/env node

var http = require('http'),
    faviconRequest = require('./favicon-request');

/**
 *  Define the sample application.
 */
var FaviconApp = function() {
    var self = this;

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        if (!self.ipaddress) {
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = '127.0.0.1';
        }
    };

    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === 'string') {
           console.log('%s: Received %s - terminating favicon app ...', new Date(Date.now()), sig);
           process.exit(1);
        }
        if (self.server) {
            self.server.close();
            self.server = null;
        }
        console.log('%s: Node server stopped.', new Date(Date.now()));
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element) {
            process.on(element, function() { self.terminator(element); });
        });
    };

    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.server = http.createServer(faviconRequest);
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.setupTerminationHandlers();
        self.initializeServer();
    };

    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        self.server.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...', new Date(Date.now()), self.ipaddress, self.port);
        });
    };

};

var app = new FaviconApp();
app.initialize();
app.start();

