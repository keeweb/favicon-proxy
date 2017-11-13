/* eslint-disable no-console */

const http = require('http');
const https = require('https');

function faviconApp(req, res) {
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.url === '/') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('This is a service for loading website favicon with CORS\n\n' +
            'Usage: GET /domain.com\n' +
            'Questions, source code: https://github.com/keeweb/favicon-proxy');
        return;
    }
    console.log('GET', req.url, req.headers.origin || '',
        req.connection.remoteAddress || '', req.headers['x-forwarded-for'] || '');
    const domain = req.url.substr(1);
    if (domain.indexOf('.') < 0 || domain.indexOf('/') >= 0) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Usage: GET /domain.com');
    }
    loadResource('http://' + domain + '/favicon.ico', res);
}

function loadResource(url, res, redirectNum) {
    const proto = url.lastIndexOf('https', 0) === 0 ? https : http;
    const serverReq = proto.get(url, srvRes => {
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
    serverReq.on('error', e => {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end(e.message);
    });
    serverReq.end();
}

module.exports = faviconApp;
