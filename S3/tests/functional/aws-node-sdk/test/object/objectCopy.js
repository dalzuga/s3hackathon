import assert from 'assert';

import withV4 from '../support/withV4';
import BucketUtility from '../../lib/utility/bucket-util';

const sourceBucketName = 'supersourcebucket8102016';
const sourceObjName = 'supersourceobject';
const destBucketName = 'destinationbucket8102016';
const destObjName = 'copycatobject';
const originalMetadata = {
    oldmetadata: 'same old',
    overwriteme: 'wipe me out with replace',
};
const newMetadata = {
    newmetadata: 'new kid in town',
    overwriteme: 'wiped',
};
const content = 'I am the best content ever';

const otherAccountBucketUtility = new BucketUtility('lisa', {});
const otherAccountS3 = otherAccountBucketUtility.s3;

function checkNoError(err) {
    assert.equal(err, null,
        `Expected success, got error ${JSON.stringify(err)}`);
}

function checkError(err, code) {
    assert.notEqual(err, null, 'Expected failure but got success');
    assert.strictEqual(err.code, code);
}

function dateFromNow(diff) {
    const d = new Date();
    d.setHours(d.getHours() + diff);
    return d.toISOString();
}

function dateConvert(d) {
    return (new Date(d)).toISOString();
}


describe('Object Copy', () => {
    withV4(sigCfg => {
        let bucketUtil;
        let s3;
        let etag;
        let etagTrim;
        let lastModified;

        before(() => {
            bucketUtil = new BucketUtility('default', sigCfg);
            s3 = bucketUtil.s3;
            return bucketUtil.empty(sourceBucketName)
            .then(() =>
                bucketUtil.empty(destBucketName)
            )
            .then(() =>
                bucketUtil.deleteMany([sourceBucketName, destBucketName])
            )
            .catch(err => {
                if (err.code !== 'NoSuchBucket') {
                    process.stdout.write(`${err}\n`);
                    throw err;
                }
            })
            .then(() => bucketUtil.createOne(sourceBucketName)
            )
            .then(() => bucketUtil.createOne(destBucketName)
            )
            .catch(err => {
                throw err;
            });
        });

        beforeEach(() => s3.putObjectAsync({
            Bucket: sourceBucketName,
            Key: sourceObjName,
            Body: content,
            Metadata: originalMetadata,
        }).then(res => {
            etag = res.ETag;
            etagTrim = etag.substring(1, etag.length - 1);
            return s3.headObjectAsync({
                Bucket: sourceBucketName,
                Key: sourceObjName,
            });
        }).then(res => {
            lastModified = res.LastModified;
        }));

        afterEach(() => bucketUtil.empty(sourceBucketName)
            .then(() => bucketUtil.empty(destBucketName))
        );

        after(() => bucketUtil.deleteMany([sourceBucketName, destBucketName]));

        function requestCopy(fields, cb) {
            s3.copyObject(Object.assign({
                Bucket: destBucketName,
                Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
            }, fields), cb);
        }

        function successCopyCheck(error, response, copyVersionMetadata,
            destBucketName, destObjName, done) {
            checkNoError(error);
            assert.strictEqual(response.ETag, etag);
            const copyLastModified = new Date(response.LastModified)
                .toUTCString();
            s3.getObject({ Bucket: destBucketName,
                Key: destObjName }, (err, res) => {
                checkNoError(err);
                assert.strictEqual(res.Body.toString(),
                    content);
                assert.deepStrictEqual(res.Metadata,
                    copyVersionMetadata);
                assert.strictEqual(res.LastModified,
                    copyLastModified);
                done();
            });
        }

        it('should copy an object from a source bucket to a different ' +
            'destination bucket and copy the metadata if no metadata directve' +
            'header provided', done => {
            s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}` },
                (err, res) =>
                    successCopyCheck(err, res, originalMetadata,
                        destBucketName, destObjName, done)
                );
        });

        it('should copy an object from a source bucket to a different ' +
            'key in the same bucket',
            done => {
                s3.copyObject({ Bucket: sourceBucketName, Key: destObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}` },
                    (err, res) =>
                        successCopyCheck(err, res, originalMetadata,
                            sourceBucketName, destObjName, done)
                    );
            });

        it('should copy an object from a source to the same destination ' +
            '(update metadata)', done => {
            s3.copyObject({ Bucket: sourceBucketName, Key: sourceObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                MetadataDirective: 'REPLACE',
                Metadata: newMetadata },
                (err, res) =>
                    successCopyCheck(err, res, newMetadata,
                        sourceBucketName, sourceObjName, done)
                );
        });

        it('should copy an object and replace the metadata if replace ' +
            'included as metadata directive header', done => {
            s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                MetadataDirective: 'REPLACE',
                Metadata: newMetadata,
            },
                (err, res) =>
                    successCopyCheck(err, res, newMetadata,
                        destBucketName, destObjName, done)
                );
        });

        it('should copy an object and the metadata if copy ' +
            'included as metadata directive header (and ignore any new ' +
            'metadata sent with copy request)', done => {
            s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                MetadataDirective: 'COPY',
                Metadata: newMetadata,
            },
                err => {
                    checkNoError(err);
                    s3.getObject({ Bucket: destBucketName,
                        Key: destObjName }, (err, res) => {
                        assert.deepStrictEqual(res.Metadata, originalMetadata);
                        done();
                    });
                });
        });

        it('should copy a 0 byte object to different destination', done => {
            const emptyFileETag = '"d41d8cd98f00b204e9800998ecf8427e"';
            s3.putObject({ Bucket: sourceBucketName, Key: sourceObjName,
                Body: '', Metadata: originalMetadata }, () => {
                s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
                },
                    (err, res) => {
                        checkNoError(err);
                        assert.strictEqual(res.ETag, emptyFileETag);
                        s3.getObject({ Bucket: destBucketName,
                            Key: destObjName }, (err, res) => {
                            assert.deepStrictEqual(res.Metadata,
                                originalMetadata);
                            assert.strictEqual(res.ETag, emptyFileETag);
                            done();
                        });
                    });
            });
        });

        it('should copy a 0 byte object to same destination', done => {
            const emptyFileETag = '"d41d8cd98f00b204e9800998ecf8427e"';
            s3.putObject({ Bucket: sourceBucketName, Key: sourceObjName,
                Body: '' }, () => {
                s3.copyObject({ Bucket: sourceBucketName, Key: sourceObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
                    StorageClass: 'REDUCED_REDUNDANCY',
                },
                    (err, res) => {
                        checkNoError(err);
                        assert.strictEqual(res.ETag, emptyFileETag);
                        s3.getObject({ Bucket: sourceBucketName,
                            Key: sourceObjName }, (err, res) => {
                            assert.deepStrictEqual(res.Metadata,
                                {});
                            assert.deepStrictEqual(res.StorageClass,
                                'REDUCED_REDUNDANCY');
                            assert.strictEqual(res.ETag, emptyFileETag);
                            done();
                        });
                    });
            });
        });

        it('should copy an object to a different destination and change ' +
            'the storage class if storage class header provided', done => {
            s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                StorageClass: 'REDUCED_REDUNDANCY',
            },
                err => {
                    checkNoError(err);
                    s3.getObject({ Bucket: destBucketName,
                        Key: destObjName }, (err, res) => {
                        assert.strictEqual(res.StorageClass,
                            'REDUCED_REDUNDANCY');
                        done();
                    });
                });
        });

        it('should copy an object to the same destination and change the ' +
            'storage class if the storage class header provided', done => {
            s3.copyObject({ Bucket: sourceBucketName, Key: sourceObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                StorageClass: 'REDUCED_REDUNDANCY',
            },
                err => {
                    checkNoError(err);
                    s3.getObject({ Bucket: sourceBucketName,
                        Key: sourceObjName }, (err, res) => {
                        checkNoError(err);
                        assert.strictEqual(res.StorageClass,
                            'REDUCED_REDUNDANCY');
                        done();
                    });
                });
        });

        it('should copy an object to a new bucket and overwrite an already ' +
            'existing object in the destination bucket', done => {
            s3.putObject({ Bucket: destBucketName, Key: destObjName,
                Body: 'overwrite me', Metadata: originalMetadata }, () => {
                s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
                    MetadataDirective: 'REPLACE',
                    Metadata: newMetadata,
                },
                    (err, res) => {
                        checkNoError(err);
                        assert.strictEqual(res.ETag, etag);
                        s3.getObject({ Bucket: destBucketName,
                            Key: destObjName }, (err, res) => {
                            assert.deepStrictEqual(res.Metadata,
                                newMetadata);
                            assert.strictEqual(res.ETag, etag);
                            assert.strictEqual(res.Body.toString(), content);
                            done();
                        });
                    });
            });
        });

        // skipping test as object level encryption is not implemented yet
        it.skip('should copy an object and change the server side encryption' +
            'option if server side encryption header provided', done => {
            s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                ServerSideEncryption: 'AES256',
            },
                err => {
                    checkNoError(err);
                    s3.getObject({ Bucket: destBucketName,
                        Key: destObjName }, (err, res) => {
                        assert.strictEqual(res.ServerSideEncryption,
                            'AES256');
                        done();
                    });
                });
        });

        it('should return Not Implemented error for obj. encryption using ' +
            'AWS-managed encryption keys', done => {
            const params = { Bucket: destBucketName, Key: 'key',
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                ServerSideEncryption: 'AES256' };
            s3.copyObject(params, err => {
                assert.strictEqual(err.code, 'NotImplemented');
                done();
            });
        });

        it('should return Not Implemented error for obj. encryption using ' +
            'customer-provided encryption keys', done => {
            const params = { Bucket: destBucketName, Key: 'key',
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                SSECustomerAlgorithm: 'AES256' };
            s3.copyObject(params, err => {
                assert.strictEqual(err.code, 'NotImplemented');
                done();
            });
        });

        it('should copy an object and set the acl on the new object', done => {
            s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
                ACL: 'authenticated-read',
            },
                err => {
                    checkNoError(err);
                    s3.getObjectAcl({ Bucket: destBucketName,
                        Key: destObjName }, (err, res) => {
                        // With authenticated-read ACL, there are two
                        // grants:
                        // (1) FULL_CONTROL to the object owner
                        // (2) READ to the authenticated-read
                        assert.strictEqual(res.Grants.length, 2);
                        assert.strictEqual(res.Grants[0].Permission,
                            'FULL_CONTROL');
                        assert.strictEqual(res.Grants[1].Permission,
                            'READ');
                        assert.strictEqual(res.Grants[1].Grantee.URI,
                            'http://acs.amazonaws.com/groups/' +
                            'global/AuthenticatedUsers');
                        done();
                    });
                });
        });

        it('should copy an object and default the acl on the new object ' +
            'to private even if the copied object had a ' +
            'different acl', done => {
            s3.putObjectAcl({ Bucket: sourceBucketName, Key: sourceObjName,
                ACL: 'authenticated-read' }, () => {
                s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
                },
                    () => {
                        s3.getObjectAcl({ Bucket: destBucketName,
                            Key: destObjName }, (err, res) => {
                            // With private ACL, there is only one grant
                            // of FULL_CONTROL to the object owner
                            assert.strictEqual(res.Grants.length, 1);
                            assert.strictEqual(res.Grants[0].Permission,
                                'FULL_CONTROL');
                            done();
                        });
                    });
            });
        });

        it('should return an error if attempt to copy with same source as' +
            'destination and do not change any metadata', done => {
            s3.copyObject({ Bucket: sourceBucketName, Key: sourceObjName,
                CopySource: `${sourceBucketName}/${sourceObjName}`,
            },
                err => {
                    checkError(err, 'InvalidRequest');
                    done();
                });
        });

        it('should return an error if attempt to copy from nonexistent bucket',
            done => {
                s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                    CopySource: `nobucket453234/${sourceObjName}`,
            },
                err => {
                    checkError(err, 'NoSuchBucket');
                    done();
                });
            });


        it('should return an error if attempt to copy to nonexistent bucket',
            done => {
                s3.copyObject({ Bucket: 'nobucket453234', Key: destObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
            },
                err => {
                    checkError(err, 'NoSuchBucket');
                    done();
                });
            });

        it('should return an error if attempt to copy nonexistent object',
            done => {
                s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                    CopySource: `${sourceBucketName}/nokey`,
            },
                err => {
                    checkError(err, 'NoSuchKey');
                    done();
                });
            });

        it('should return an error if send invalid metadata directive header',
            done => {
                s3.copyObject({ Bucket: destBucketName, Key: destObjName,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
                    MetadataDirective: 'copyHalf',
            },
                err => {
                    checkError(err, 'InvalidArgument');
                    done();
                });
            });

        describe('copying by another account', () => {
            const otherAccountBucket = 'otheraccountbucket42342342342';
            const otherAccountKey = 'key';
            beforeEach(() => otherAccountBucketUtility
                .createOne(otherAccountBucket)
            );

            afterEach(() => otherAccountBucketUtility.empty(otherAccountBucket)
                .then(() => otherAccountBucketUtility
                .deleteOne(otherAccountBucket))
            );

            it('should not allow an account without read persmission on the ' +
                'source object to copy the object', done => {
                otherAccountS3.copyObject({ Bucket: otherAccountBucket,
                    Key: otherAccountKey,
                    CopySource: `${sourceBucketName}/${sourceObjName}`,
                },
                    err => {
                        checkError(err, 'AccessDenied');
                        done();
                    });
            });

            it('should not allow an account without write persmission on the ' +
                'destination bucket to copy the object', done => {
                otherAccountS3.putObject({ Bucket: otherAccountBucket,
                    Key: otherAccountKey, Body: '' }, () => {
                    otherAccountS3.copyObject({ Bucket: destBucketName,
                        Key: destObjName,
                        CopySource: `${otherAccountBucket}/${otherAccountKey}`,
                    },
                        err => {
                            checkError(err, 'AccessDenied');
                            done();
                        });
                });
            });

            it('should allow an account with read permission on the ' +
                'source object and write permission on the destination ' +
                'bucket to copy the object', done => {
                s3.putObjectAcl({ Bucket: sourceBucketName,
                    Key: sourceObjName, ACL: 'public-read' }, () => {
                    otherAccountS3.copyObject({ Bucket: otherAccountBucket,
                        Key: otherAccountKey,
                        CopySource: `${sourceBucketName}/${sourceObjName}`,
                    },
                        err => {
                            checkNoError(err);
                            done();
                        });
                });
            });
        });

        it('If-Match: returns no error when ETag match, with double quotes ' +
            'around ETag',
            done => {
                requestCopy({ CopySourceIfMatch: etag }, err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-Match: returns no error when one of ETags match, with double ' +
            'quotes around ETag',
            done => {
                requestCopy({ CopySourceIfMatch:
                    `non-matching,${etag}` }, err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-Match: returns no error when ETag match, without double ' +
            'quotes around ETag',
            done => {
                requestCopy({ CopySourceIfMatch: etagTrim }, err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-Match: returns no error when one of ETags match, without ' +
            'double quotes around ETag',
            done => {
                requestCopy({ CopySourceIfMatch:
                    `non-matching,${etagTrim}` }, err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-Match: returns no error when ETag match with *', done => {
            requestCopy({ CopySourceIfMatch: '*' }, err => {
                checkNoError(err);
                done();
            });
        });

        it('If-Match: returns PreconditionFailed when ETag does not match',
            done => {
                requestCopy({ CopySourceIfMatch: 'non-matching ETag' }, err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-None-Match: returns no error when ETag does not match', done => {
            requestCopy({ CopySourceIfNoneMatch: 'non-matching' }, err => {
                checkNoError(err);
                done();
            });
        });

        it('If-None-Match: returns no error when all ETags do not match',
            done => {
                requestCopy({
                    CopySourceIfNoneMatch: 'non-matching,non-matching-either',
                }, err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-None-Match: returns NotModified when ETag match, with double ' +
            'quotes around ETag',
            done => {
                requestCopy({ CopySourceIfNoneMatch: etag }, err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-None-Match: returns NotModified when one of ETags match, with ' +
            'double quotes around ETag',
            done => {
                requestCopy({
                    CopySourceIfNoneMatch: `non-matching,${etag}`,
                }, err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-None-Match: returns NotModified when ETag match, without ' +
            'double quotes around ETag',
            done => {
                requestCopy({ CopySourceIfNoneMatch: etagTrim }, err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-None-Match: returns NotModified when one of ETags match, ' +
            'without double quotes around ETag',
            done => {
                requestCopy({
                    CopySourceIfNoneMatch: `non-matching,${etagTrim}`,
                }, err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-Modified-Since: returns no error if Last modified date is ' +
            'greater',
            done => {
                requestCopy({ CopySourceIfModifiedSince: dateFromNow(-1) },
                    err => {
                        checkNoError(err);
                        done();
                    });
            });

        // Skipping this test, because real AWS does not provide error as
        // expected
        it.skip('If-Modified-Since: returns NotModified if Last modified ' +
            'date is lesser',
            done => {
                requestCopy({ CopySourceIfModifiedSince: dateFromNow(1) },
                    err => {
                        checkError(err, 'PreconditionFailed');
                        done();
                    });
            });

        it('If-Modified-Since: returns NotModified if Last modified ' +
            'date is equal',
            done => {
                requestCopy({ CopySourceIfModifiedSince:
                    dateConvert(lastModified) },
                    err => {
                        checkError(err, 'PreconditionFailed');
                        done();
                    });
            });

        it('If-Unmodified-Since: returns no error when lastModified date is ' +
            'greater',
            done => {
                requestCopy({ CopySourceIfUnmodifiedSince: dateFromNow(1) },
                err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-Unmodified-Since: returns no error when lastModified ' +
            'date is equal',
            done => {
                requestCopy({ CopySourceIfUnmodifiedSince:
                    dateConvert(lastModified) },
                    err => {
                        checkNoError(err);
                        done();
                    });
            });

        it('If-Unmodified-Since: returns PreconditionFailed when ' +
            'lastModified date is lesser',
            done => {
                requestCopy({ CopySourceIfUnmodifiedSince: dateFromNow(-1) },
                err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-Match & If-Unmodified-Since: returns no error when match Etag ' +
            'and lastModified is greater',
            done => {
                requestCopy({
                    CopySourceIfMatch: etagTrim,
                    CopySourceIfUnmodifiedSince: dateFromNow(-1),
                }, err => {
                    checkNoError(err);
                    done();
                });
            });

        it('If-Match match & If-Unmodified-Since match', done => {
            requestCopy({
                CopySourceIfMatch: etagTrim,
                CopySourceIfUnmodifiedSince: dateFromNow(1),
            }, err => {
                checkNoError(err);
                done();
            });
        });

        it('If-Match not match & If-Unmodified-Since not match', done => {
            requestCopy({
                CopySourceIfMatch: 'non-matching',
                CopySourceIfUnmodifiedSince: dateFromNow(-1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-Match not match & If-Unmodified-Since match', done => {
            requestCopy({
                CopySourceIfMatch: 'non-matching',
                CopySourceIfUnmodifiedSince: dateFromNow(1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        // Skipping this test, because real AWS does not provide error as
        // expected
        it.skip('If-Match match & If-Modified-Since not match', done => {
            requestCopy({
                CopySourceIfMatch: etagTrim,
                CopySourceIfModifiedSince: dateFromNow(1),
            }, err => {
                checkNoError(err);
                done();
            });
        });

        it('If-Match match & If-Modified-Since match', done => {
            requestCopy({
                CopySourceIfMatch: etagTrim,
                CopySourceIfModifiedSince: dateFromNow(-1),
            }, err => {
                checkNoError(err);
                done();
            });
        });

        it('If-Match not match & If-Modified-Since not match', done => {
            requestCopy({
                CopySourceIfMatch: 'non-matching',
                CopySourceIfModifiedSince: dateFromNow(1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-Match not match & If-Modified-Since match', done => {
            requestCopy({
                CopySourceIfMatch: 'non-matching',
                CopySourceIfModifiedSince: dateFromNow(-1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-None-Match & If-Modified-Since: returns NotModified when Etag ' +
            'does not match and lastModified is greater',
            done => {
                requestCopy({
                    CopySourceIfNoneMatch: etagTrim,
                    CopySourceIfModifiedSince: dateFromNow(-1),
                }, err => {
                    checkError(err, 'PreconditionFailed');
                    done();
                });
            });

        it('If-None-Match not match & If-Modified-Since not match', done => {
            requestCopy({
                CopySourceIfNoneMatch: etagTrim,
                CopySourceIfModifiedSince: dateFromNow(1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-None-Match match & If-Modified-Since match', done => {
            requestCopy({
                CopySourceIfNoneMatch: 'non-matching',
                CopySourceIfModifiedSince: dateFromNow(-1),
            }, err => {
                checkNoError(err);
                done();
            });
        });

        // Skipping this test, because real AWS does not provide error as
        // expected
        it.skip('If-None-Match match & If-Modified-Since not match', done => {
            requestCopy({
                CopySourceIfNoneMatch: 'non-matching',
                CopySourceIfModifiedSince: dateFromNow(1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-None-Match match & If-Unmodified-Since match', done => {
            requestCopy({
                CopySourceIfNoneMatch: 'non-matching',
                CopySourceIfUnmodifiedSince: dateFromNow(1),
            }, err => {
                checkNoError(err);
                done();
            });
        });

        it('If-None-Match match & If-Unmodified-Since not match', done => {
            requestCopy({
                CopySourceIfNoneMatch: 'non-matching',
                CopySourceIfUnmodifiedSince: dateFromNow(-1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-None-Match not match & If-Unmodified-Since match', done => {
            requestCopy({
                CopySourceIfNoneMatch: etagTrim,
                CopySourceIfUnmodifiedSince: dateFromNow(1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });

        it('If-None-Match not match & If-Unmodified-Since not match', done => {
            requestCopy({
                CopySourceIfNoneMatch: etagTrim,
                CopySourceIfUnmodifiedSince: dateFromNow(-1),
            }, err => {
                checkError(err, 'PreconditionFailed');
                done();
            });
        });
    });
});
