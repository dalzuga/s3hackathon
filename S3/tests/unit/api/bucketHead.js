import { errors } from 'arsenal';
import assert from 'assert';

import bucketHead from '../../../lib/api/bucketHead';
import bucketPut from '../../../lib/api/bucketPut';
import { cleanup, DummyRequestLogger, makeAuthInfo } from '../helpers';

const log = new DummyRequestLogger();
const authInfo = makeAuthInfo('accessKey1');
const namespace = 'default';
const bucketName = 'bucketname';
const locationConstraint = 'us-west-1';
const testRequest = {
    bucketName,
    namespace,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    url: '/',
};
describe('bucketHead API', () => {
    beforeEach(() => {
        cleanup();
    });

    it('should return an error if the bucket does not exist', done => {
        bucketHead(authInfo, testRequest, log, err => {
            assert.deepStrictEqual(err, errors.NoSuchBucket);
            done();
        });
    });

    it('should return an error if user is not authorized', done => {
        const otherAuthInfo = makeAuthInfo('accessKey2');
        bucketPut(otherAuthInfo, testRequest, locationConstraint, log, () => {
            bucketHead(authInfo, testRequest, log, err => {
                assert.deepStrictEqual(err, errors.AccessDenied);
                done();
            });
        });
    });

    it('should return a success message if ' +
       'bucket exists and user is authorized', done => {
        bucketPut(authInfo, testRequest, locationConstraint, log, () => {
            bucketHead(authInfo, testRequest, log, (err, result) => {
                assert.strictEqual(result,
                                   'Bucket exists and user authorized -- 200');
                done();
            });
        });
    });
});
