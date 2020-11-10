/* eslint-disable no-console */

const http = require('http');
const faviconRequest = require('./favicon-request');

/**
 *  Define the sample application.
 */
class FaviconApp {
    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    setupVariables() {
        this.port = process.env.PORT || 8080;
    }

    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    terminator(sig) {
        if (typeof sig === 'string') {
            console.log('%s: Received %s - terminating favicon app ...', new Date(Date.now()), sig);
            process.exit(1);
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        console.log('%s: Node server stopped.', new Date(Date.now()));
    }

    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    setupTerminationHandlers() {
        process.on('exit', () => {
            this.terminator();
        });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        [
            'SIGHUP',
            'SIGINT',
            'SIGQUIT',
            'SIGILL',
            'SIGTRAP',
            'SIGABRT',
            'SIGBUS',
            'SIGFPE',
            'SIGUSR1',
            'SIGSEGV',
            'SIGUSR2',
            'SIGTERM'
        ].forEach((element) => {
            process.on(element, () => {
                this.terminator(element);
            });
        });
    }

    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    initializeServer() {
        this.server = http.createServer(faviconRequest);
    }

    /**
     *  Initializes the sample application.
     */
    initialize() {
        this.setupVariables();
        this.setupTerminationHandlers();
        this.initializeServer();
    }

    /**
     *  Start the server (starts up the sample application).
     */
    start() {
        this.server.listen(this.port, () => {
            console.log('%s: Node server started on port %d ...', new Date(Date.now()), this.port);
        });
    }
}

const app = new FaviconApp();
app.initialize();
app.start();
