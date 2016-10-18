import { errors } from 'arsenal';
import { UtapiClient } from 'utapi';

import routeGET from './routes/routeGET';
import routePUT from './routes/routePUT';
import routeDELETE from './routes/routeDELETE';
import routeHEAD from './routes/routeHEAD';
import routePOST from './routes/routePOST';
import routesUtils from './routes/routesUtils';
import utils from './utils';
import _config from './Config';

const routeMap = {
    GET: routeGET,
    PUT: routePUT,
    POST: routePOST,
    DELETE: routeDELETE,
    HEAD: routeHEAD,
};

// setup utapi client
const utapi = new UtapiClient(_config.utapi);

function checkUnsuportedRoutes(req, res, log) {
    if (req.query.policy !== undefined ||
        req.query.cors !== undefined ||
        req.query.tagging !== undefined) {
        return routesUtils.responseXMLBody(
            errors.NotImplemented, null, res, log);
    }
    const method = routeMap[req.method.toUpperCase()];
    if (method) {
        return method(req, res, log, utapi);
    }
    return routesUtils.responseXMLBody(errors.MethodNotAllowed, null, res, log);
}

// current function utility is minimal, but will be expanded
export function isHealthy() {
    return true;
}

export function setHealthCheckResponse(req, res, log) {
    if (isHealthy()) {
        if (req.method === 'GET' || req.method === 'POST') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write('{}');
            log.debug('healthcheck response',
                { httpMethod: req.method, httpCode: res.statusCode });
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.write('{}');
        }
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.write('{}');
    }
    return res.statusCode;
}

export default function routes(req, res, logger) {
    const clientInfo = {
        clientIP: req.socket.remoteAddress,
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.url,
    };

    const log = logger.newRequestLogger();
    log.info('received request', clientInfo);

    log.end().addDefaultFields(clientInfo);

    if (req.url === '/_/healthcheck') {
        return setHealthCheckResponse(req, res, log);
    }

    try {
        utils.normalizeRequest(req);
    } catch (err) {
        log.trace('could not normalize request', { error: err });
        return routesUtils.responseXMLBody(
            errors.InvalidURI, undefined, res, log);
    }

    log.addDefaultFields({
        bucketName: req.bucketName,
        objectKey: req.objectKey,
    });

    if (req.bucketName !== undefined &&
        utils.isValidBucketName(req.bucketName) === false) {
        log.warn('invalid bucket name', { bucketName: req.bucketName });
        return routesUtils.responseXMLBody(errors.InvalidBucketName,
            undefined, res, log);
    }

    return checkUnsuportedRoutes(req, res, log);
}
