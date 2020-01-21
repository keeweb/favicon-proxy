/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const MAX_REDIRECTS = 3;
const KNOWN_ICONS = {
    'gmail.com': 'https://ssl.gstatic.com/ui/v1/icons/mail/images/favicon5.ico'
};

const bannedReferrers = {};

fs.readFileSync(path.resolve(__dirname, 'conf/banned-referrers.txt'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .forEach(line => { bannedReferrers[line] = true; });

function faviconApp(req, res) {
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.url === '/') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('This is a service for loading website favicons with CORS\n\n' +
            'Usage: GET /domain.com\n' +
            'Questions, source code: https://github.com/keeweb/favicon-proxy');
        return;
    }
    let action = '';
    if (req.headers.referer) {
        let refererDomain = req.headers.referer.match(/^\w+:\/\/([^/?]+)/);
        if (refererDomain) {
            refererDomain = refererDomain[1].toLowerCase();
        }
        if (bannedReferrers[refererDomain]) {
            action = 'blocked';
        }
    }
    console.log(new Date().toISOString(),
        'GET',
        req.url,
        req.headers.origin || '',
        req.headers.referer || '',
        req.connection.remoteAddress || '',
        req.headers['x-forwarded-for'] || '',
        action
    );
    if (action === 'blocked') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Please don\'t use my instance, deploy your own one.\n' +
            'You have been warned right here in the README, right?\n' +
            'https://github.com/keeweb/favicon-proxy#usage\n' +
            'So here\'s your 403.');
        return;
    }
    const domain = req.url.substr(1).toLowerCase();
    if (domain.indexOf('.') < 0 || domain.match(/[/:]/)) {
        return returnError(404, res, 'Usage: GET /domain.com');
    }
    if (domain.indexOf('keeweb.info') >= 0 || domain === 'favicon-proxy.herokuapp.com') {
        return returnError(403, res, 'No, I cannot get my own favicon');
    }
    const faviconUrl = KNOWN_ICONS[domain] || 'http://' + domain + '/favicon.ico';
    loadResource(faviconUrl).then(srvRes => {
        if (srvRes.headers['content-type'].startsWith('image/')) {
            return pipeResponse(res, srvRes);
        } else {
            throw 'Bad content-type';
        }
    }).catch(e => {
        if (e === 'Status 404' || e === 'Bad content-type') {
            loadResource('http://' + domain).then(srvRes => {
                readHtml(srvRes).then(html => {
                    const iconUrl = getIconUrl(html, domain);
                    if (iconUrl) {
                        loadResource(iconUrl).then(srvRes => {
                            pipeResponse(res, srvRes);
                        }).catch(e => returnError(500, res, e));
                    } else {
                        returnError(404, res, 'No favicon');
                    }
                }).catch(e => returnError(500, res, e));
            }).catch(e => returnError(500, res, e));
        } else {
            returnError(500, res, e);
        }
    });
}

function loadResource(url, redirectNum) {
    return new Promise((resolve, reject) => {
        const proto = url.lastIndexOf('https', 0) === 0 ? https : http;
        const serverReq = proto.get(url, srvRes => {
            if (srvRes.statusCode > 300 && srvRes.statusCode < 400 && srvRes.headers.location) {
                if (redirectNum > MAX_REDIRECTS) {
                    reject('Too many redirects');
                } else {
                    resolve(loadResource(srvRes.headers.location, (redirectNum || 0) + 1));
                }
            } else if (srvRes.statusCode === 200) {
                resolve(srvRes);
            } else {
                reject('Status ' + srvRes.statusCode);
            }
        });
        serverReq.on('error', e => {
            reject(e.message);
        });
        serverReq.end();
    });
}

function readHtml(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => {
            chunks.push(chunk);
        });
        stream.on('error', () => {
            reject('HTML read error');
        });
        stream.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
    });
}

function getIconUrl(html, domain) {
    const MAX_SIZE = 96;
    let match;
    const re = /<link\s+[^>]*rel=["']?(?:shortcut )?icon["']?[^>]*>/g;
    let iconHref, iconSize = 0;
    do {
        match = re.exec(html);
        if (match) {
            let href = /href=(["'])([^'"]+)"*\1/.exec(match[0]);
            if (href) {
                href = href[2];
            }
            const sizes = /sizes=["']?(\d+)/.exec(match[0]);
            if (sizes) {
                const size = +sizes[1];
                if (size && size > iconSize && size <= MAX_SIZE) {
                    iconHref = href;
                    iconSize = size;
                }
            } else if (!iconHref) {
                iconHref = href;
            }
        }
    } while (match);
    if (/\.(png|jpg|svg|gif|ico)/.test(iconHref)) {
        if (iconHref.indexOf('://') > 0) {
            return iconHref;
        } else {
            if (!iconHref.startsWith('/')) {
                iconHref = '/' + iconHref;
            }
            if (iconHref.startsWith('//')) {
                return 'http:' + iconHref;
            }
            return 'http://' + domain + iconHref;
        }
    }
}

function pipeResponse(res, srvRes) {
    res.writeHead(200, {'Content-Type': 'image/x-icon', 'Access-Control-Allow-Origin': '*'});
    srvRes.pipe(res, {end: true});
}

function returnError(code, res, err) {
    res.writeHead(code, {'Content-Type': 'text/plain'});
    return res.end(String(err));
}

module.exports = faviconApp;
