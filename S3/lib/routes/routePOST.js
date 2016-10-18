import { errors } from 'arsenal';

import api from '../api/api';
import routesUtils from './routesUtils';
import pushMetrics from '../utilities/pushMetrics';

/* eslint-disable no-param-reassign */
export default function routePOST(request, response, log, utapi) {
    log.debug('routing request', { method: 'routePOST' });
    request.post = '';

    request.on('data', chunk => {
        request.post += chunk.toString();
    });

    request.on('end', () => {
        if (request.objectKey === undefined) {
            return routesUtils.responseNoBody(errors.InvalidURI, null, response,
                200, log);
        } else if (request.query.uploads !== undefined) {
            // POST multipart upload
            api.callApiMethod('initiateMultipartUpload', request, log,
                (err, result) => {
                    pushMetrics(err, log, utapi, 'initiateMultipartUpload',
                        request.bucketName);
                    return routesUtils.responseXMLBody(err, result, response,
                        log);
                });
        } else if (request.query.uploadId !== undefined) {
            // POST complete multipart upload
            api.callApiMethod('completeMultipartUpload', request, log,
                (err, result) => {
                    pushMetrics(err, log, utapi, 'completeMultipartUpload',
                        request.bucketName);
                    return routesUtils.responseXMLBody(err, result, response,
                        log);
                });
        } else {
            routesUtils.responseNoBody(errors.InternalError, null, response,
                200, log);
        }
        return undefined;
    });
}
/* eslint-enable no-param-reassign */
