import { errors } from 'arsenal';
import assert from 'assert';

import bucketPut from '../../../lib/api/bucketPut';
import constants from '../../../constants';
import { cleanup, DummyRequestLogger, makeAuthInfo } from '../helpers';
import metadata from '../metadataswitch';
import objectPut from '../../../lib/api/objectPut';
import objectPutACL from '../../../lib/api/objectPutACL';
import DummyRequest from '../DummyRequest';

const log = new DummyRequestLogger();
const canonicalID = 'accessKey1';
const authInfo = makeAuthInfo(canonicalID);
const namespace = 'default';
const bucketName = 'bucketname';
const postBody = Buffer.from('I am a body', 'utf8');
const correctMD5 = 'be747eb4b75517bf6b3cf7c5fbb62f3a';
const objectName = 'objectName';
const testPutBucketRequest = new DummyRequest({
    bucketName,
    namespace,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    url: '/',
});
const locationConstraint = 'us-west-1';
let testPutObjectRequest;

describe('putObjectACL API', () => {
    beforeEach(() => {
        cleanup();
        testPutObjectRequest = new DummyRequest({
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}`,
        }, postBody);
    });

    it('should return an error if invalid canned ACL provided', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: { 'x-amz-acl': 'invalid-option' },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert
                                .deepStrictEqual(err, errors.InvalidArgument);
                            done();
                        });
                    });
            });
    });

    it('should set a canned public-read-write ACL', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: { 'x-amz-acl': 'public-read-write' },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.strictEqual(err, undefined);
                            metadata.getObjectMD(bucketName, objectName, log,
                            (err, md) => {
                                assert.strictEqual(md.acl.Canned,
                                'public-read-write');
                                done();
                            });
                        });
                    });
            });
    });

    it('should set a canned public-read ACL followed by'
        + ' a canned authenticated-read ACL', done => {
        const testObjACLRequest1 = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: { 'x-amz-acl': 'public-read' },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };

        const testObjACLRequest2 = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: { 'x-amz-acl': 'authenticated-read' },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest1, log, err => {
                            assert.strictEqual(err, undefined);
                            metadata.getObjectMD(bucketName, objectName, log,
                            (err, md) => {
                                assert.strictEqual(md.acl.Canned,
                                'public-read');
                                objectPutACL(authInfo, testObjACLRequest2, log,
                                    err => {
                                        assert.strictEqual(err, undefined);
                                        metadata.getObjectMD(bucketName,
                                            objectName, log, (err, md) => {
                                                assert.strictEqual(md
                                                       .acl.Canned,
                                                       'authenticated-read');
                                                done();
                                            });
                                    });
                            });
                        });
                    });
            });
    });

    it('should set ACLs provided in request headers', done => {
        const canonicalIDforSample1 =
            '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be';
        const canonicalIDforSample2 =
            '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2bf';
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {
                'x-amz-grant-full-control':
                    'emailaddress="sampleaccount1@sampling.com"' +
                    ',emailaddress="sampleaccount2@sampling.com"',
                'x-amz-grant-read':
                    `uri=${constants.logId}`,
                'x-amz-grant-read-acp':
                    'id="79a59df900b949e55d96a1e698fbacedfd6e09d98eac' +
                    'f8f8d5218e7cd47ef2be"',
                'x-amz-grant-write-acp':
                    'id="79a59df900b949e55d96a1e698fbacedfd6e09d98eac' +
                    'f8f8d5218e7cd47ef2bf"',
            },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };
        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.strictEqual(err, undefined);
                            metadata.getObjectMD(bucketName, objectName, log,
                            (err, md) => {
                                assert.strictEqual(err, null);
                                const acls = md.acl;
                                assert.strictEqual(acls.READ[0],
                                    constants.logId);
                                assert(acls.FULL_CONTROL[0]
                                   .indexOf(canonicalIDforSample1) > -1);
                                assert(acls.FULL_CONTROL[1]
                                   .indexOf(canonicalIDforSample2) > -1);
                                assert(acls.READ_ACP[0]
                                    .indexOf(canonicalIDforSample1) > -1);
                                assert(acls.WRITE_ACP[0]
                                    .indexOf(canonicalIDforSample2) > -1);
                                done();
                            });
                        });
                    });
            });
    });

    it('should return an error if invalid email ' +
        'provided in ACL header request', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {
                'x-amz-grant-full-control':
                    'emailaddress="sampleaccount1@sampling.com"' +
                    ',emailaddress="nonexistentemail@sampling.com"',
            },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.strictEqual(err,
                                errors.UnresolvableGrantByEmailAddress);
                            done();
                        });
                    });
            });
    });

    it('should set ACLs provided in request body', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}?acl`,
            post: [Buffer.from(
                '<AccessControlPolicy xmlns=' +
                    '"http://s3.amazonaws.com/doc/2006-03-01/">' +
                  '<Owner>' +
                    '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                    '<DisplayName>OwnerDisplayName</DisplayName>' +
                  '</Owner>' +
                  '<AccessControlList>' +
                    '<Grant>' +
                      '<Grantee xsi:type="CanonicalUser">' +
                        '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                        '<DisplayName>OwnerDisplayName</DisplayName>' +
                      '</Grantee>' +
                      '<Permission>FULL_CONTROL</Permission>' +
                    '</Grant>' +
                    '<Grant>' +
                      '<Grantee xsi:type="Group">' +
                        `<URI>${constants.publicId}</URI>` +
                      '</Grantee>' +
                      '<Permission>READ</Permission>' +
                    '</Grant>' +
                    '<Grant>' +
                      '<Grantee xsi:type="AmazonCustomerByEmail">' +
                        '<EmailAddress>sampleaccount1@sampling.com' +
                        '</EmailAddress>' +
                      '</Grantee>' +
                      '<Permission>WRITE_ACP</Permission>' +
                    '</Grant>' +
                    '<Grant>' +
                      '<Grantee xsi:type="CanonicalUser">' +
                        '<ID>f30716ab7115dcb44a5ef76e9d74b8e20567f63</ID>' +
                      '</Grantee>' +
                      '<Permission>READ_ACP</Permission>' +
                    '</Grant>' +
                  '</AccessControlList>' +
                '</AccessControlPolicy>', 'utf8')],
            query: { acl: '' },
        };
        const canonicalIDforSample1 =
            '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be';

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined,
                    log, (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.strictEqual(err, undefined);
                            metadata.getObjectMD(bucketName, objectName, log,
                            (err, md) => {
                                assert.strictEqual(md
                                    .acl.FULL_CONTROL[0],
                                    '852b113e7a2f25102679df27bb0ae12b3f85be6');
                                assert.strictEqual(md
                                    .acl.READ[0], constants.publicId);
                                assert.strictEqual(md
                                    .acl.WRITE_ACP[0], canonicalIDforSample1);
                                assert.strictEqual(md
                                    .acl.READ_ACP[0],
                                    'f30716ab7115dcb44a5ef76e9d74b8e20567f63');
                                done();
                            });
                        });
                    });
            });
    });

    it('should ignore if WRITE ACL permission is ' +
        'provided in request body', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}?acl`,
            post: [Buffer.from(
                '<AccessControlPolicy xmlns=' +
                    '"http://s3.amazonaws.com/doc/2006-03-01/">' +
                  '<Owner>' +
                    '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                    '<DisplayName>OwnerDisplayName</DisplayName>' +
                  '</Owner>' +
                  '<AccessControlList>' +
                    '<Grant>' +
                      '<Grantee xsi:type="CanonicalUser">' +
                        '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                        '<DisplayName>OwnerDisplayName</DisplayName>' +
                      '</Grantee>' +
                      '<Permission>FULL_CONTROL</Permission>' +
                    '</Grant>' +
                    '<Grant>' +
                      '<Grantee xsi:type="Group">' +
                        `<URI>${constants.publicId}</URI>` +
                      '</Grantee>' +
                      '<Permission>WRITE</Permission>' +
                    '</Grant>' +
                  '</AccessControlList>' +
                '</AccessControlPolicy>', 'utf8')],
            query: { acl: '' },
        };

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.strictEqual(err, undefined);
                            metadata.getObjectMD(bucketName, objectName, log,
                            (err, md) => {
                                assert.strictEqual(md.acl.Canned, '');
                                assert.strictEqual(md.acl.FULL_CONTROL[0],
                                    '852b113e7a2f2510267' +
                                    '9df27bb0ae12b3f85be6');
                                assert.strictEqual(md.acl.WRITE, undefined);
                                assert.strictEqual(md.acl.READ[0], undefined);
                                assert.strictEqual(md.acl.WRITE_ACP[0],
                                    undefined);
                                assert.strictEqual(md.acl.READ_ACP[0],
                                    undefined);
                                done();
                            });
                        });
                    });
            });
    });

    it('should return an error if invalid email ' +
    'address provided in ACLs set out in request body', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}?acl`,
            post: [Buffer.from(
                '<AccessControlPolicy xmlns=' +
                    '"http://s3.amazonaws.com/doc/2006-03-01/">' +
                  '<Owner>' +
                    '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                    '<DisplayName>OwnerDisplayName</DisplayName>' +
                  '</Owner>' +
                  '<AccessControlList>' +
                    '<Grant>' +
                      '<Grantee xsi:type="AmazonCustomerByEmail">' +
                        '<EmailAddress>xyz@amazon.com' +
                        '</EmailAddress>' +
                      '</Grantee>' +
                      '<Permission>WRITE_ACP</Permission>' +
                    '</Grant>' +
                  '</AccessControlList>' +
                '</AccessControlPolicy>', 'utf8')],
            query: { acl: '' },
        };


        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.strictEqual(err,
                                errors.UnresolvableGrantByEmailAddress);
                            done();
                        });
                    });
            });
    });

    it('should return an error if xml provided does not match s3 ' +
    'scheme for setting ACLs', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}?acl`,
            post: [Buffer.from(
                '<AccessControlPolicy xmlns=' +
                    '"http://s3.amazonaws.com/doc/2006-03-01/">' +
                  '<Owner>' +
                    '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                    '<DisplayName>OwnerDisplayName</DisplayName>' +
                  '</Owner>' +
                  '<AccessControlList>' +
                    '<PowerGrant>' +
                      '<Grantee xsi:type="AmazonCustomerByEmail">' +
                        '<EmailAddress>xyz@amazon.com' +
                        '</EmailAddress>' +
                      '</Grantee>' +
                      '<Permission>WRITE_ACP</Permission>' +
                    '</PowerGrant>' +
                  '</AccessControlList>' +
                '</AccessControlPolicy>', 'utf8')],
            query: { acl: '' },
        };


        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.deepStrictEqual(err,
                                errors.MalformedACLError);
                            done();
                        });
                    });
            });
    });

    it('should return an error if malformed xml provided', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}?acl`,
            post: [Buffer.from(
                '<AccessControlPolicy xmlns=' +
                    '"http://s3.amazonaws.com/doc/2006-03-01/">' +
                  '<Owner>' +
                    '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                    '<DisplayName>OwnerDisplayName</DisplayName>' +
                  '</Owner>' +
                  '<AccessControlList>' +
                    '<Grant>' +
                      '<Grantee xsi:type="AmazonCustomerByEmail">' +
                        '<EmailAddress>xyz@amazon.com' +
                        '</EmailAddress>' +
                      '</Grantee>' +
                      '<Permission>WRITE_ACP</Permission>' +
                    '<Grant>' +
                  '</AccessControlList>' +
                '</AccessControlPolicy>', 'utf8')],
            query: { acl: '' },
        };


        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.deepStrictEqual(err, errors.MalformedXML);
                            done();
                        });
                    });
            });
    });

    it('should return an error if invalid group ' +
    'uri provided in ACLs set out in request body', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {},
            url: `/${bucketName}/${objectName}?acl`,
            post: [Buffer.from(
                '<AccessControlPolicy xmlns=' +
                    '"http://s3.amazonaws.com/doc/2006-03-01/">' +
                  '<Owner>' +
                    '<ID>852b113e7a2f25102679df27bb0ae12b3f85be6</ID>' +
                    '<DisplayName>OwnerDisplayName</DisplayName>' +
                  '</Owner>' +
                  '<AccessControlList>' +
                    '<Grant>' +
                    '<Grantee xsi:type="Group">' +
                      '<URI>http://acs.amazonaws.com/groups/' +
                      'global/NOTAVALIDGROUP</URI>' +
                    '</Grantee>' +
                      '<Permission>WRITE_ACP</Permission>' +
                    '<Grant>' +
                  '</AccessControlList>' +
                '</AccessControlPolicy>', 'utf8')],
            query: { acl: '' },
        };


        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.deepStrictEqual(err, errors.MalformedXML);
                            done();
                        });
                    });
            });
    });

    it('should return an error if invalid group uri ' +
        'provided in ACL header request', done => {
        const testObjACLRequest = {
            bucketName,
            namespace,
            objectKey: objectName,
            headers: {
                'host': 's3.amazonaws.com',
                'x-amz-grant-full-control':
                    'uri="http://acs.amazonaws.com/groups/' +
                    'global/NOTAVALIDGROUP"',
            },
            url: `/${bucketName}/${objectName}?acl`,
            query: { acl: '' },
        };

        bucketPut(authInfo, testPutBucketRequest, locationConstraint,
            log, () => {
                objectPut(authInfo, testPutObjectRequest, undefined, log,
                    (err, result) => {
                        assert.strictEqual(result, correctMD5);
                        objectPutACL(authInfo, testObjACLRequest, log, err => {
                            assert.deepStrictEqual(err, errors.InvalidArgument);
                            done();
                        });
                    });
            });
    });
});
