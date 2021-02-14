/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_CHUNKS = 1000;
const KNOWN_ICONS = {
    'gmail.com': 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico'
};
const DEBUG = process.env.DEBUG_FAVICON;
const IP_THROTTLING_MS = +(process.env.IP_THROTTLING_MS || 1000);
const IP_THROTTLING_AGGRESSIVE_LOCKDOWN_DETECTION_THRESHOLD = +(
    process.env.IP_THROTTLING_AGGRESSIVE_LOCKDOWN_DETECTION_THRESHOLD || 100
);
const IP_THROTTLING_AGGRESSIVE_LOCKDOWN_TIME_MS = +(
    process.env.IP_THROTTLING_AGGRESSIVE_LOCKDOWN_TIME_MS || 60 * 60 * 1000
);
const lastRequestDatePerIp = new Map();

const bannedReferrers = {};

fs.readFileSync(path.resolve(__dirname, 'conf/banned-referrers.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
        bannedReferrers[line] = true;
    });

function faviconApp(req, res) {
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(
            'This is a service for loading website favicons with CORS\n\n' +
                'Usage: GET /domain.com\n' +
                'Questions, source code: https://github.com/keeweb/favicon-proxy'
        );
        return;
    }

    let blockStatusCode = 0;
    let blockReason = '';
    if (req.headers.referer) {
        let refererDomain = req.headers.referer.match(/^\w+:\/\/([^/?]+)/);
        if (refererDomain) {
            refererDomain = refererDomain[1].toLowerCase();
        }
        if (bannedReferrers[refererDomain]) {
            blockReason = 'Forbidden';
            blockStatusCode = 403;
        }
    }

    const clientIp = req.headers['cf-connecting-ip'] || req.connection.remoteAddress;
    const now = new Date();

    if (needThrottle(clientIp, now)) {
        blockReason = 'Too many requests';
        blockStatusCode = 429;
    }

    console.log(
        now.toISOString(),
        'GET',
        req.url,
        req.headers.origin || '-',
        req.headers.referer || '-',
        req.headers['user-agent'] || '-',
        clientIp,
        req.headers['cf-ipcountry'] || '-',
        blockReason || '-'
    );
    if (blockReason) {
        return returnError(blockStatusCode || 403, res, blockReason);
    }
    const domain = req.url.substr(1).toLowerCase();
    if (domain.indexOf('.') < 0 || domain.match(/[\/:?]|(\.\.)/)) {
        return returnError(404, res, 'Usage: GET /domain.com');
    }
    if (domain.indexOf('keeweb.info') >= 0) {
        return returnError(403, res, 'No, I cannot get my own favicon');
    }
    const faviconUrl = KNOWN_ICONS[domain] || 'http://' + domain + '/favicon.ico';
    loadResource(faviconUrl)
        .then((srvRes) => {
            const contentType = srvRes.headers['content-type'];
            if (contentType.startsWith('image/') || contentType === 'application/octet-stream') {
                return pipeResponse(res, srvRes);
            } else {
                throw 'Bad content-type';
            }
        })
        .catch((e) => {
            if (e === 'Status 404' || e === 'Bad content-type') {
                loadResource('http://' + domain)
                    .then((srvRes) => {
                        readHtml(srvRes)
                            .then((html) => {
                                const iconUrl = getIconUrl(html, domain);
                                if (iconUrl) {
                                    loadResource(iconUrl)
                                        .then((srvRes) => {
                                            pipeResponse(res, srvRes);
                                        })
                                        .catch((e) => returnError(500, res, e));
                                } else {
                                    returnError(404, res, 'No favicon');
                                }
                            })
                            .catch((e) => returnError(500, res, e));
                    })
                    .catch((e) => returnError(500, res, e));
            } else {
                returnError(500, res, e);
            }
        });
}

function loadResource(url, redirectNum) {
    DEBUG && console.log('GET', url);
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https://')
            ? https
            : url.startsWith('http://')
            ? http
            : undefined;
        if (!proto) {
            return reject('Invalid protocol');
        }
        if (/:\/\/(127\.|192\.|0\.0\.|localhost|(\w+\.)?keeweb\.info)/i.test(url)) {
            return reject('Bad redirect: ' + url);
        }
        const serverReq = proto.get(url, (srvRes) => {
            DEBUG && console.log(srvRes.statusCode);
            if (srvRes.statusCode > 300 && srvRes.statusCode < 400 && srvRes.headers.location) {
                const redirectLocation = srvRes.headers.location;
                try {
                    new URL(redirectLocation);
                } catch {
                    DEBUG && console.log(`Bad redirect: ${redirectLocation}`);
                    return reject('Bad redirect');
                }
                if (redirectNum > MAX_REDIRECTS) {
                    reject('Too many redirects');
                } else {
                    resolve(loadResource(redirectLocation, (redirectNum || 0) + 1));
                }
            } else if (srvRes.statusCode === 200) {
                resolve(srvRes);
            } else {
                reject('Status ' + srvRes.statusCode);
            }
        });
        serverReq.on('error', (e) => {
            reject(e.message);
        });
        serverReq.end();
    });
}

function readHtml(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => {
            if (chunks.length > MAX_RESPONSE_CHUNKS) {
                return reject('Response too large');
            } else {
                chunks.push(chunk);
            }
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
    let iconHref,
        iconSize = 0;
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
    res.writeHead(200, {
        'Content-Type': 'image/x-icon',
        'Access-Control-Allow-Origin': '*'
    });
    srvRes.pipe(res, { end: true });
}

function needThrottle(clientIp, now) {
    if (!IP_THROTTLING_MS) {
        return false;
    }

    let lastRequestDate = lastRequestDatePerIp.get(clientIp);
    let throttled = false;

    let newLastRequestDate = now.getTime();
    if (lastRequestDate) {
        const dateDiff = now - lastRequestDate;
        if (dateDiff < IP_THROTTLING_MS) {
            if (
                IP_THROTTLING_AGGRESSIVE_LOCKDOWN_DETECTION_THRESHOLD &&
                IP_THROTTLING_AGGRESSIVE_LOCKDOWN_TIME_MS &&
                dateDiff < IP_THROTTLING_AGGRESSIVE_LOCKDOWN_DETECTION_THRESHOLD
            ) {
                newLastRequestDate += IP_THROTTLING_AGGRESSIVE_LOCKDOWN_TIME_MS;
            }
            throttled = true;
        }
    }

    lastRequestDatePerIp.set(clientIp, newLastRequestDate);

    if (lastRequestDatePerIp.size > 50) {
        for (const [ip, dt] of lastRequestDatePerIp.entries()) {
            if (now - dt > IP_THROTTLING_MS) {
                lastRequestDatePerIp.delete(ip);
            }
        }
    }

    return throttled;
}

function returnError(code, res, err) {
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    return res.end(String(err));
}

module.exports = faviconApp;
