import async from 'async';
import { errors } from 'arsenal';

import data from '../data/wrapper';
import kms from '../kms/wrapper';
import { logger } from '../utilities/logger';
import services from '../services';
import utils from '../utils';
import validateHeaders from '../utilities/validateHeaders';

/**
 * Preps metadata to be saved (based on copy or replace request header)
 * @param {object} sourceObjMD - object md of source object
 * @param {object} headers - request headers
 * @param {boolean} sourceIsDestination - whether or not source is same as
 * destination
 * @param {AuthInfo} authInfo - authInfo from Vault
 * @param {string} objectKey - destination key name
 * @param {object} log - logger object
 * @return {object} storeMetadataParams or an error
 */
function _prepMetadata(sourceObjMD, headers, sourceIsDestination, authInfo,
    objectKey, log) {
    let whichMetadata = headers['x-amz-metadata-directive'];
    // Default is COPY
    whichMetadata = whichMetadata === undefined ? 'COPY' : whichMetadata;
    if (whichMetadata !== 'COPY' && whichMetadata !== 'REPLACE') {
        return { error: errors.InvalidArgument };
    }
    const overrideMetadata = {};
    if (headers['x-amz-server-side-encryption']) {
        overrideMetadata['x-amz-server-side-encryption'] =
            headers['x-amz-server-side-encryption'];
    }
    if (headers['x-amz-storage-class']) {
        overrideMetadata['x-amz-storage-class'] =
            headers['x-amz-storage-class'];
    }
    if (headers['x-amz-website-redirect-location']) {
        overrideMetadata['x-amz-website-redirect-location'] =
            headers['x-amz-website-redirect-location'];
    }
    // Cannot copy from same source and destination if no MD
    // changed
    if (sourceIsDestination && whichMetadata === 'COPY' &&
        Object.keys(overrideMetadata).length === 0) {
        return { error: errors.InvalidRequest.customizeDescription('This copy' +
            ' request is illegal because it is trying to copy an ' +
            'object to itself without changing the object\'s metadata, ' +
            'storage class, website redirect location or encryption ' +
            'attributes.') };
    }
    // If COPY, pull all x-amz-meta keys/values from source object
    // Otherwise, pull all x-amz-meta keys/values from request headers
    const userMetadata = whichMetadata === 'COPY' ?
        utils.getMetaHeaders(sourceObjMD) :
        utils.getMetaHeaders(headers);
    const storeMetadataParams = {
        objectKey,
        log,
        headers,
        authInfo,
        metaHeaders: userMetadata,
        size: sourceObjMD['content-length'],
        contentType: sourceObjMD['content-type'],
        contentMD5: sourceObjMD['content-md5'],
        overrideMetadata,
        lastModifiedDate: new Date().toJSON(),
    };
    return storeMetadataParams;
}

/**
 * PUT Object Copy in the requested bucket.
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with
 * requester's info
 * @param {request} request - request object given by router,
 *                            includes normalized headers
 * @param {string} sourceBucket - name of source bucket for object copy
 * @param {string} sourceObject - name of source object for object copy
 * @param {object} log - the log request
 * @param {function} callback - final callback to call with the result
 * @return {undefined}
 */
export default
function objectCopy(authInfo, request, sourceBucket,
    sourceObject, log, callback) {
    log.debug('processing request', { method: 'objectCopy' });
    const destBucketName = request.bucketName;
    const destObjectKey = request.objectKey;
    const sourceIsDestination =
        destBucketName === sourceBucket && destObjectKey === sourceObject;
    const valGetParams = {
        authInfo,
        bucketName: sourceBucket,
        objectKey: sourceObject,
        requestType: 'objectGet',
        log,
    };
    const valPutParams = {
        authInfo,
        bucketName: destBucketName,
        objectKey: destObjectKey,
        requestType: 'objectPut',
        log,
    };
    const dataStoreContext = {
        bucketName: destBucketName,
        owner: authInfo.getCanonicalID(),
        namespace: request.namespace,
    };

    return async.waterfall([
        function checkSourceAuthorization(next) {
            return services.metadataValidateAuthorization(valGetParams,
                (err, sourceBucketMD, sourceObjMD) => {
                    if (err) {
                        log.debug('error validating get part of request',
                        { error: err });
                        return next(err);
                    }
                    if (!sourceObjMD) {
                        log.debug('no source object', { sourceObject });
                        return next(errors.NoSuchKey);
                    }
                    const headerValResult =
                        validateHeaders(sourceObjMD, request.headers);
                    if (headerValResult.error) {
                        return next(errors.PreconditionFailed);
                    }
                    const storeMetadataParams =
                        _prepMetadata(sourceObjMD, request.headers,
                            sourceIsDestination, authInfo, destObjectKey, log);
                    if (storeMetadataParams.error) {
                        return next(storeMetadataParams.error);
                    }
                    let dataLocator;
                    // If 0 byte object just set dataLocator to empty array
                    if (!sourceObjMD.location) {
                        dataLocator = [];
                    } else {
                        // To provide for backwards compatibility before
                        // md-model-version 2, need to handle cases where
                        // objMD.location is just a string
                        dataLocator = Array.isArray(sourceObjMD.location) ?
                        sourceObjMD.location : [{ key: sourceObjMD.location }];
                    }

                    if (sourceObjMD['x-amz-server-side-encryption']) {
                        for (let i = 0; i < dataLocator.length; i++) {
                            dataLocator[i].masterKeyId = sourceObjMD
                            ['x-amz-server-side-encryption-aws-kms-key-id'];
                            dataLocator[i].algorithm =
                                sourceObjMD['x-amz-server-side-encryption'];
                        }
                    }
                    return next(null, storeMetadataParams, dataLocator);
                });
        },
        function checkDestAuth(storeMetadataParams, dataLocator, next) {
            return services.metadataValidateAuthorization(valPutParams,
                (err, destBucketMD, destObjMD) => {
                    if (err) {
                        log.debug('error validating put part of request',
                        { error: err });
                        return next(err);
                    }
                    const flag = destBucketMD.hasDeletedFlag()
                        || destBucketMD.hasTransientFlag();
                    if (flag) {
                        log.trace('deleted flag or transient flag ' +
                        'on destination bucket', { flag });
                        return next(errors.NoSuchBucket);
                    }
                    return next(null, storeMetadataParams,
                        dataLocator, destBucketMD, destObjMD);
                });
        },
        function goGetData(storeMetadataParams, dataLocator, destBucketMD,
            destObjMD, next) {
            const serverSideEncryption = destBucketMD.getServerSideEncryption();

            // skip if source and dest the same or 0 byte object
            // still send along serverSideEncryption info so algo
            // and masterKeyId stored properly in metadata
            if (sourceIsDestination || dataLocator.length === 0) {
                return next(null, storeMetadataParams, dataLocator, destObjMD,
                    serverSideEncryption);
            }
             // dataLocator is an array.  need to get and put all parts
             // For now, copy 1 part at a time. Could increase the second
             // argument here to increase the number of parts
             // copied at once.
            return async.mapLimit(dataLocator, 1,
                // eslint-disable-next-line prefer-arrow-callback
                function copyPart(part, cb) {
                    return data.get(part, log, (err, stream) => {
                        if (err) {
                            return cb(err);
                        }
                        if (serverSideEncryption) {
                            return kms.createCipherBundle(
                                serverSideEncryption,
                                log, (err, cipherBundle) => {
                                    if (err) {
                                        log.debug('error getting cipherBundle');
                                        return cb(errors.InternalError);
                                    }
                                    return data.put(cipherBundle, stream,
                                        part.size, dataStoreContext, log,
                                        (error, partRetrievalInfo) => {
                                            if (error) {
                                                return cb(error);
                                            }
                                            const partResult = {
                                                key: partRetrievalInfo.key,
                                                dataStoreName: partRetrievalInfo
                                                    .dataStoreName,
                                                start: part.start,
                                                size: part.size,
                                                cryptoScheme: cipherBundle
                                                    .cryptoScheme,
                                                cipheredDataKey: cipherBundle
                                                    .cipheredDataKey,
                                            };
                                            return cb(null, partResult);
                                        });
                                });
                        }
                        // Copied object is not encrypted so just put it
                        // without a cipherBundle
                        return data.put(null, stream, part.size,
                        dataStoreContext, log, (error, partRetrievalInfo) => {
                            if (error) {
                                return cb(error);
                            }
                            const partResult = {
                                key: partRetrievalInfo.key,
                                dataStoreName: partRetrievalInfo.dataStoreName,
                                start: part.start,
                                size: part.size,
                            };
                            return cb(null, partResult);
                        });
                    });
                }, (err, results) => {
                    if (err) {
                        log.debug('error transferring data from source',
                        { error: err });
                        return next(err);
                    }
                    return next(null, storeMetadataParams, results,
                        destObjMD, serverSideEncryption);
                });
        },
        function storeNewMetadata(storeMetadataParams, destDataGetInfoArr,
            destObjMD, serverSideEncryption, next) {
            return services.metadataStoreObject(destBucketName,
                destDataGetInfoArr,
                serverSideEncryption, storeMetadataParams, err => {
                    if (err) {
                        log.debug('error storing new metadata', { error: err });
                        return next(err);
                    }
                    // Clean up any potential orphans in data if object
                    // put is an overwrite of already existing
                    // object with same name
                    // so long as the source is not the same as the destination
                    let dataToDelete;
                    if (destObjMD && destObjMD.location &&
                        !sourceIsDestination) {
                        dataToDelete = Array.isArray(destObjMD.location) ?
                            destObjMD.location : [destObjMD.location];
                        data.batchDelete(dataToDelete,
                            logger.newRequestLoggerFromSerializedUids(
                            log.getSerializedUids()));
                    }
                    const sourceObjSize = storeMetadataParams.size;
                    const destObjPrevSize = destObjMD ?
                        destObjMD['content-length'] : null;
                    return next(null, storeMetadataParams,
                        serverSideEncryption, sourceObjSize, destObjPrevSize);
                });
        },
    ], (err, storeMetadataParams, serverSideEncryption, sourceObjSize,
        destObjPrevSize) => {
        if (err) {
            return callback(err);
        }
        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<CopyObjectResult>',
            '<LastModified>', new Date(storeMetadataParams.lastModifiedDate)
                .toUTCString(), '</LastModified>',
            '<ETag>&quot;', storeMetadataParams.contentMD5, '&quot;</ETag>',
            '</CopyObjectResult>',
        ].join('');
        const additionalHeaders = {};
        if (serverSideEncryption) {
            additionalHeaders['x-amz-server-side-encryption'] =
                serverSideEncryption.algorithm;
            if (serverSideEncryption.algorithm === 'aws:kms') {
                additionalHeaders
                ['x-amz-server-side-encryption-aws-kms-key-id'] =
                    serverSideEncryption.masterKeyId;
            }
        }
        // TODO: Add version headers for response
        // (if source or destination is version).
        // Add expiration header if lifecycle enabled
        return callback(null, xml, additionalHeaders, sourceObjSize,
            destObjPrevSize);
    });
}
