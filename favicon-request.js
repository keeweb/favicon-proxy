'use strict';

'use strict';

var http = require('http'),
    https = require('https');

function faviconApp(req, res) {
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    console.log('GET', req.url, req.headers.origin || '',
        req.connection.remoteAddress || '', req.headers['x-forwarded-for'] || '');
    var domain = req.url.substr(1);
    if (domain.indexOf('.') < 0 || domain.indexOf('/') >= 0) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Usage: GET /domain.com');
    }
    loadResource('http://' + domain + '/favicon.ico', res);
}

function loadResource(url, res, redirectNum) {
    var proto = url.lastIndexOf('https', 0) === 0 ? https : http;
    var serverReq = proto.get(url, function(srvRes) {
        if (srvRes.statusCode > 300 && srvRes.statusCode < 400 && srvRes.headers.location) {
            if (redirectNum > 3) {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                return res.end('Too many redirects');
            }
            return loadResource(srvRes.headers.location, res, (redirectNum || 0) + 1);
        } else if (srvRes.statusCode === 200) {
            res.writeHead(200, {'Content-Type': 'image/x-icon', 'Access-Control-Allow-Origin': '*'});
            srvRes.pipe(res, {end: true});
        } else {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            return res.end('Status ' + srvRes.statusCode);
        }
    });
    serverReq.on('error', function(e) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end(e.message);
    });
    serverReq.end();
}

module.exports = faviconApp;
