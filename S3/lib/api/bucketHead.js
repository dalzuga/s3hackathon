import services from '../services';

/**
 * Determine if bucket exists and if user has permission to access it
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with requester's info
 * @param {object} request - http request object
 * @param {object} log - Werelogs logger
 * @param {function} callback - callback to respond to http request
 *  with either error code or success
 * @return {undefined}
 */
export default function bucketHead(authInfo, request, log, callback) {
    log.debug('processing request', { method: 'bucketHead' });
    const bucketName = request.bucketName;
    const metadataValParams = {
        authInfo,
        bucketName,
        requestType: 'bucketHead',
        log,
    };
    services.metadataValidateAuthorization(metadataValParams, err =>
        callback(err, 'Bucket exists and user authorized -- 200')
    );
}
